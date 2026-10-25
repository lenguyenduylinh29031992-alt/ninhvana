import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ALL_PERMISSIONS, type LoginResponse, type SessionUser } from '@grand-suite/shared';
import { createTestApp, readSetCookie } from './test-app';

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'NinhVaNa@2026';

const DEMO_ACCOUNTS = [
  { email: 'admin@ninhvana.vn', orgWide: true, properties: 2 },
  { email: 'chairman@ninhvana.vn', orgWide: true, properties: 2 },
  { email: 'ceo@ninhvana.vn', orgWide: true, properties: 2 },
  { email: 'cfo@ninhvana.vn', orgWide: true, properties: 2 },
  { email: 'revenue@ninhvana.vn', orgWide: true, properties: 2 },
  { email: 'hr@ninhvana.vn', orgWide: true, properties: 2 },
  { email: 'marketing@ninhvana.vn', orgWide: true, properties: 2 },
  { email: 'manager.hanoi@ninhvana.vn', orgWide: false, properties: 1 },
  { email: 'manager.ninhvan@ninhvana.vn', orgWide: false, properties: 1 },
  { email: 'frontdesk@ninhvana.vn', orgWide: false, properties: 1 },
  { email: 'housekeeping@ninhvana.vn', orgWide: false, properties: 1 },
  { email: 'chef@ninhvana.vn', orgWide: false, properties: 1 },
  { email: 'fnb@ninhvana.vn', orgWide: false, properties: 1 },
  { email: 'cashier@ninhvana.vn', orgWide: false, properties: 1 },
  { email: 'warehouse@ninhvana.vn', orgWide: false, properties: 1 },
];

describe('Auth, RBAC, CSRF & audit (integration)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
  }, 90_000);

  afterAll(async () => {
    await app?.close();
  });

  it('signs in every demo role with the correct property scope', async () => {
    for (const [index, account] of DEMO_ACCOUNTS.entries()) {
      const response = await request(http)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `10.20.0.${index + 1}`)
        .send({ email: account.email, password: PASSWORD })
        .expect(200);

      const body = response.body as LoginResponse;
      expect(body.twoFactorRequired).toBe(false);
      expect(body.user?.email).toBe(account.email);
      expect(body.user?.permissions.length).toBeGreaterThan(0);
      expect(body.user?.orgWide).toBe(account.orgWide);
      expect(body.user?.properties).toHaveLength(account.properties);
      expect(readSetCookie(response.headers, 'gs_at')).toBeTruthy();
      expect(readSetCookie(response.headers, 'gs_rt')).toBeTruthy();
      expect(readSetCookie(response.headers, 'gs_csrf')).toBeTruthy();
    }
  }, 120_000);

  it('rejects a bad password without leaking whether the email exists', async () => {
    const response = await request(http)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.21.0.1')
      .send({ email: 'ceo@ninhvana.vn', password: 'definitely-wrong-123' })
      .expect(401);
    expect(response.body.code).toBe('INVALID_CREDENTIALS');

    const unknown = await request(http)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.21.0.2')
      .send({ email: 'nobody@ninhvana.vn', password: 'definitely-wrong-123' })
      .expect(401);
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('allows only the dedicated admin to change a display name', async () => {
    const ceo = request.agent(http);
    const ceoLogin = await ceo.post('/api/v1/auth/login').set('X-Forwarded-For', '10.21.0.100').send({ email: 'ceo@ninhvana.vn', password: PASSWORD }).expect(200);
    const ceoCsrf = readSetCookie(ceoLogin.headers, 'gs_csrf')!;
    await ceo.patch('/api/v1/auth/profile').set('x-csrf-token', ceoCsrf).send({ fullName: 'Tên trái phép' }).expect(403);

    const admin = request.agent(http);
    const adminLogin = await admin.post('/api/v1/auth/login').set('X-Forwarded-For', '10.21.0.101').send({ email: 'admin@ninhvana.vn', password: PASSWORD }).expect(200);
    const adminCsrf = readSetCookie(adminLogin.headers, 'gs_csrf')!;
    const original = adminLogin.body.user.fullName as string;
    await admin.patch('/api/v1/auth/profile').set('x-csrf-token', adminCsrf).send({ fullName: `${original} (Admin)` }).expect(200);
    await admin.patch('/api/v1/auth/profile').set('x-csrf-token', adminCsrf).send({ fullName: original }).expect(200);
  });

  it('grants the dedicated admin every permission', async () => {
    const response = await request(http)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.21.0.99')
      .send({ email: 'admin@ninhvana.vn', password: PASSWORD })
      .expect(200);
    expect(response.body.user.email).toBe('admin@ninhvana.vn');
    expect(new Set(response.body.user.permissions)).toEqual(new Set(ALL_PERMISSIONS));
  });

  it('enforces CSRF on cookie-authenticated mutations', async () => {
    const agent = request.agent(http);
    const login = await agent
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.22.0.1')
      .send({ email: 'ceo@ninhvana.vn', password: PASSWORD })
      .expect(200);

    await agent.post('/api/v1/notifications/read-all').expect(403);

    const csrf = readSetCookie(login.headers, 'gs_csrf');
    expect(csrf).toBeTruthy();
    await agent
      .post('/api/v1/notifications/read-all')
      .set('x-csrf-token', csrf!)
      .expect(201);
  });

  it('blocks a property user from acting on another property', async () => {
    const ceo = await request(http)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.23.0.1')
      .send({ email: 'ceo@ninhvana.vn', password: PASSWORD })
      .expect(200);
    const ceoUser = ceo.body.user as SessionUser;
    const otherProperty = ceoUser.properties.find((property) => property.code === 'NVN-NVT');
    expect(otherProperty).toBeTruthy();

    const agent = request.agent(http);
    await agent
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.23.0.2')
      .send({ email: 'frontdesk@ninhvana.vn', password: PASSWORD })
      .expect(200);

    await agent
      .get('/api/v1/dashboard/overview')
      .set('x-property-id', otherProperty!.id)
      .expect(403);

    await agent.get('/api/v1/users').expect(403);
  });

  it('returns 401 for unauthenticated access to protected routes', async () => {
    await request(http).get('/api/v1/users').expect(401);
    await request(http).get('/api/v1/dashboard/overview').expect(401);
  });

  it('keeps the audit hash chain valid after real traffic', async () => {
    const agent = request.agent(http);
    await agent
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.24.0.1')
      .send({ email: 'admin@ninhvana.vn', password: PASSWORD })
      .expect(200);

    const verify = await agent.get('/api/v1/audit/verify').expect(200);
    expect(verify.body.valid).toBe(true);
    expect(verify.body.checked).toBeGreaterThan(0);
  });

  it('serves a public aggregate summary with no PII', async () => {
    const response = await request(http).get('/api/v1/public/summary').expect(200);
    expect(response.body.properties).toBeGreaterThanOrEqual(2);
    expect(response.body.rooms).toBeGreaterThanOrEqual(250);
    expect(response.body).not.toHaveProperty('users');
  });
});
