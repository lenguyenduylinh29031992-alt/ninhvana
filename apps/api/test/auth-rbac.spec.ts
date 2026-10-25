import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { LoginResponse, SessionUser } from '@grand-suite/shared';
import { createTestApp, readSetCookie } from './test-app';

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'GrandSuite@2026';

const DEMO_ACCOUNTS = [
  { email: 'admin@grandsuite.vn', orgWide: true, properties: 2 },
  { email: 'chairman@grandsuite.vn', orgWide: true, properties: 2 },
  { email: 'ceo@grandsuite.vn', orgWide: true, properties: 2 },
  { email: 'cfo@grandsuite.vn', orgWide: true, properties: 2 },
  { email: 'revenue@grandsuite.vn', orgWide: true, properties: 2 },
  { email: 'hr@grandsuite.vn', orgWide: true, properties: 2 },
  { email: 'marketing@grandsuite.vn', orgWide: true, properties: 2 },
  { email: 'manager.han@grandsuite.vn', orgWide: false, properties: 1 },
  { email: 'manager.dan@grandsuite.vn', orgWide: false, properties: 1 },
  { email: 'frontdesk@grandsuite.vn', orgWide: false, properties: 1 },
  { email: 'housekeeping@grandsuite.vn', orgWide: false, properties: 1 },
  { email: 'chef@grandsuite.vn', orgWide: false, properties: 1 },
  { email: 'fnb@grandsuite.vn', orgWide: false, properties: 1 },
  { email: 'cashier@grandsuite.vn', orgWide: false, properties: 1 },
  { email: 'warehouse@grandsuite.vn', orgWide: false, properties: 1 },
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
      .send({ email: 'ceo@grandsuite.vn', password: 'definitely-wrong-123' })
      .expect(401);
    expect(response.body.code).toBe('INVALID_CREDENTIALS');

    const unknown = await request(http)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.21.0.2')
      .send({ email: 'nobody@grandsuite.vn', password: 'definitely-wrong-123' })
      .expect(401);
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('enforces CSRF on cookie-authenticated mutations', async () => {
    const agent = request.agent(http);
    const login = await agent
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.22.0.1')
      .send({ email: 'ceo@grandsuite.vn', password: PASSWORD })
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
      .send({ email: 'ceo@grandsuite.vn', password: PASSWORD })
      .expect(200);
    const ceoUser = ceo.body.user as SessionUser;
    const otherProperty = ceoUser.properties.find((property) => property.code === 'GSL-DAN');
    expect(otherProperty).toBeTruthy();

    const agent = request.agent(http);
    await agent
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.23.0.2')
      .send({ email: 'frontdesk@grandsuite.vn', password: PASSWORD })
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
      .send({ email: 'admin@grandsuite.vn', password: PASSWORD })
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
