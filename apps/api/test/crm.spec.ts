import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from './test-app';

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'NinhVaNa@2026';

describe('CRM segments, reviews and campaigns', () => {
  let app: INestApplication; let http: ReturnType<INestApplication['getHttpServer']>; let agent: ReturnType<typeof request.agent>; let csrf: string;
  beforeAll(async () => {
    app = await createTestApp(); http = app.getHttpServer(); agent = request.agent(http);
    const login = await agent.post('/api/v1/auth/login').set('X-Forwarded-For', '10.97.0.1').send({ email: 'admin@ninhvana.vn', password: PASSWORD }).expect(200);
    csrf = (login.headers['set-cookie'] as unknown as string[]).find((cookie) => cookie.startsWith('gs_csrf='))!.split(';')[0]!.split('=')[1]!;
  }, 90_000);
  afterAll(async () => { await app?.close(); });

  it('returns guest segments and top guests', async () => {
    const response = await agent.get('/api/v1/crm/segments').expect(200);
    expect(response.body.total).toBeGreaterThan(0);
    expect(response.body.segments.length).toBe(4);
    expect(response.body.topGuests.length).toBeGreaterThan(0);
  });

  it('lists reviews and responds once', async () => {
    const list = await agent.get('/api/v1/crm/reviews').expect(200);
    expect(list.body.count).toBeGreaterThan(0);
    const review = list.body.items[0];
    const reply = await agent.post(`/api/v1/crm/reviews/${review.id}/reply`).set('x-csrf-token', csrf).send({ response: 'Cảm ơn quý khách đã phản hồi.' }).expect(201);
    expect(reply.body.status).toBe('RESPONDED');
  });

  it('creates and sends a campaign to a segment', async () => {
    const created = await agent.post('/api/v1/crm/campaigns').set('x-csrf-token', csrf).send({ name: `Test campaign ${Date.now()}`, channel: 'EMAIL', segment: 'VIP', subject: 'Ưu đãi', body: 'Nội dung' }).expect(201);
    const sent = await agent.post(`/api/v1/crm/campaigns/${created.body.id}/send`).set('x-csrf-token', csrf).expect(201);
    expect(sent.body.status).toBe('SENT');
    expect(sent.body.recipients).toBeGreaterThan(0);
  });
});
