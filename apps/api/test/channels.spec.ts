import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { createTestApp, readSetCookie } from './test-app';

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'NinhVaNa@2026';

describe('Channel manager, booking engine & social inbox', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let agent: ReturnType<typeof request.agent>;
  let csrf: string;
  let propertyCode = 'NVN-HAN';

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    agent = request.agent(http);
    const login = await agent
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.60.0.1')
      .send({ email: 'manager.hanoi@ninhvana.vn', password: PASSWORD })
      .expect(200);
    csrf = readSetCookie(login.headers, 'gs_csrf')!;
    propertyCode = 'NVN-HAN';
  }, 90_000);

  afterAll(async () => {
    await app?.close();
  });

  it('lists 8 OTA and 9 social channels with mappings', async () => {
    const response = await agent.get('/api/v1/channels').expect(200);
    expect(response.body.totals.ota).toBeGreaterThanOrEqual(8);
    expect(response.body.totals.social).toBeGreaterThanOrEqual(9);
    expect(response.body.totals.mappings).toBeGreaterThan(0);
    const booking = response.body.channels.find((channel: { code: string }) => channel.code === 'BOOKING_COM');
    expect(booking.mappings).toBeGreaterThan(0);
    expect(booking.adapter).toBe(true);
    expect(response.body.logs.length).toBeGreaterThan(0);
  });

  it('pulls reservations from an OTA with idempotent external ids', async () => {
    const response = await agent
      .post('/api/v1/channels/BOOKING_COM/pull?count=1')
      .set('x-csrf-token', csrf)
      .expect(201);
    expect(response.body.created.length + response.body.skipped.length + response.body.errors.length).toBe(1);
    expect(Array.isArray(response.body.created)).toBe(true);
  });

  it('accepts a signed webhook once and rejects replays or bad signatures', async () => {
    const payload = {
      externalId: `TEST-HOOK-${Date.now()}`,
      status: 'confirmed',
      propertyCode,
      roomTypeCode: 'DLX-K',
      checkIn: '2027-08-10',
      checkOut: '2027-08-12',
      guest: { firstName: 'Webhook', lastName: 'Idem', email: 'hook.idem@example.com', phone: '+84 900111222' },
      adults: 2,
      children: 0,
    };
    const timestamp = String(Date.now());
    const secret = process.env.CHANNEL_WEBHOOK_SECRET ?? 'dev-channel-webhook-secret';
    const signature = createHmac('sha256', secret)
      .update(`BOOKING_COM.${timestamp}.${JSON.stringify(payload)}`)
      .digest('hex');

    const first = await request(http)
      .post('/api/v1/channels/webhooks/BOOKING_COM')
      .set('x-channel-signature', signature)
      .set('x-channel-timestamp', timestamp)
      .send(payload)
      .expect(201);
    expect(first.body.duplicate).toBe(false);
    expect(first.body.reservationCode).toMatch(/^RSV-/);

    const second = await request(http)
      .post('/api/v1/channels/webhooks/BOOKING_COM')
      .set('x-channel-signature', signature)
      .set('x-channel-timestamp', timestamp)
      .send(payload)
      .expect(201);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.reservationId).toBe(first.body.reservationId);

    await request(http)
      .post('/api/v1/channels/webhooks/BOOKING_COM')
      .set('x-channel-signature', 'deadbeef')
      .set('x-channel-timestamp', timestamp)
      .send(payload)
      .expect(401);
  });

  it('pushes availability and rates to a channel', async () => {
    const response = await agent
      .post('/api/v1/channels/EXPEDIA/push-ari')
      .set('x-csrf-token', csrf)
      .send({ days: 1 })
      .expect(201);
    expect(response.body.failed).toBe(0);
    // ARI keys are idempotent, so a re-run may enqueue nothing. Prove the
    // worker still executes jobs with a fresh probe job.
    const probe = await agent
      .post('/api/v1/channels/EXPEDIA/test-job')
      .set('x-csrf-token', csrf)
      .send({ fail: false })
      .expect(201);
    expect(probe.body.id).toBeTruthy();
    const processed = await agent
      .post('/api/v1/channels/EXPEDIA/process?force=true')
      .set('x-csrf-token', csrf)
      .expect(201);
    expect(processed.body.succeeded).toBeGreaterThan(0);
  });

  it('retries failed jobs and moves exhausted jobs to the dead-letter queue', async () => {
    const created = await agent
      .post('/api/v1/channels/AGODA/test-job')
      .set('x-csrf-token', csrf)
      .send({ fail: true })
      .expect(201);
    const jobId = created.body.id as string;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await agent
        .post('/api/v1/channels/AGODA/process?force=true')
        .set('x-csrf-token', csrf)
        .expect(201);
    }
    const afterFailures = await agent.get('/api/v1/channels').expect(200);
    expect(afterFailures.body.totals.dlq).toBeGreaterThan(0);

    await agent.post(`/api/v1/channels/jobs/${jobId}/retry`).set('x-csrf-token', csrf).expect(201);
    const processed = await agent
      .post('/api/v1/channels/AGODA/process?force=true')
      .set('x-csrf-token', csrf)
      .expect(201);
    expect(processed.body.succeeded).toBeGreaterThan(0);
  });

  it('lets guests search and book through the public booking engine', async () => {
    const availability = await request(http)
      .get('/api/v1/public/booking/availability')
      .query({ propertyCode, checkIn: '2027-09-20', checkOut: '2027-09-22', adults: 2 })
      .expect(200);
    expect(availability.body.rooms.length).toBeGreaterThan(0);
    const room = availability.body.rooms.find((item: { code: string }) => item.code === 'DLX-K') ?? availability.body.rooms[0];

    const created = await request(http)
      .post('/api/v1/public/booking/reservations')
      .send({
        propertyCode,
        checkIn: '2027-09-20',
        checkOut: '2027-09-22',
        roomTypeId: room.roomTypeId,
        adults: 2,
        children: 0,
        guest: {
          firstName: 'Public',
          lastName: 'Guest',
          email: `public.${Date.now()}@example.com`,
          phone: '+84 909888777',
        },
      })
      .expect(201);
    expect(created.body.code).toMatch(/^RSV-/);
    expect(created.body.session).toBeUndefined();
    expect(created.body.payment.mode).toBe('PAY_AT_HOTEL');
    expect(created.body.totals.total).toBeGreaterThan(0);
  });

  it('lists social conversations and sends a reply', async () => {
    const list = await agent.get('/api/v1/inbox/conversations?page=1&pageSize=3').expect(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    const conversation = list.body.items[0];

    const detail = await agent.get(`/api/v1/inbox/conversations/${conversation.id}`).expect(200);
    expect(detail.body.messages.length).toBeGreaterThan(0);

    const reply = await agent
      .post(`/api/v1/inbox/conversations/${conversation.id}/reply`)
      .set('x-csrf-token', csrf)
      .send({ body: 'Cảm ơn anh/chị, em đã kiểm tra và phản hồi ngay ạ.' })
      .expect(201);
    expect(reply.body.status).toBe('SENT');

    const updated = await agent.get(`/api/v1/inbox/conversations/${conversation.id}`).expect(200);
    expect(updated.body.messages.at(-1).direction).toBe('OUTBOUND');
  });

  it('keeps the audit chain valid after channel traffic', async () => {
    const verify = await agent.get('/api/v1/audit/verify').expect(200);
    expect(verify.body.valid).toBe(true);
  });
});
