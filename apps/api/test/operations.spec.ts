import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { addDays, isoToday } from '@grand-suite/shared';
import { PrismaService } from '../src/common/prisma/prisma.module';
import { createTestApp, readSetCookie } from './test-app';

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'GrandSuite@2026';

type Agent = ReturnType<typeof request.agent>;

describe('PMS, POS, night audit & ledger (integration)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  let propertyId: string;
  let outletId: string;
  let menuItemId: string;
  let flowTypeId: string;
  let flowRoomId: string;
  let flowDate: string;
  let flowCheckOut: string;
  let reservationId = '';
  let folioId = '';
  let invoiceId = '';
  const cleanupReservationIds: string[] = [];

  async function login(email: string, ip: string): Promise<{ agent: Agent; csrf: string }> {
    const agent = request.agent(http);
    const response = await agent
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password: PASSWORD })
      .expect(200);
    return { agent, csrf: readSetCookie(response.headers, 'gs_csrf')! };
  }

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
    const property = await prisma.property.findFirstOrThrow({ where: { code: 'GSL-HAN' } });
    propertyId = property.id;
    const outlet = await prisma.outlet.findFirstOrThrow({ where: { propertyId, code: 'NH01' } });
    outletId = outlet.id;
    menuItemId = (await prisma.menuItem.findFirstOrThrow({ where: { outletId, station: 'KITCHEN' } })).id;

    // A date far outside the seeded 24-month window keeps the suite repeatable.
    const offset = Math.floor(Math.random() * 300);
    flowDate = addDays('2020-01-01', offset);
    flowCheckOut = addDays(flowDate, 2);

    await prisma.nightAudit.deleteMany({
      where: { propertyId, businessDate: new Date(`${flowDate}T00:00:00Z`) },
    });
    await prisma.journalEntry.deleteMany({
      where: { propertyId, businessDate: new Date(`${flowDate}T00:00:00Z`) },
    });

    const stamp = Date.now().toString().slice(-6);
    const type = await prisma.roomType.create({
      data: {
        propertyId,
        code: `FLOW${stamp}`,
        name: 'Flow Test Room',
        description: 'integration test room type',
        baseRate: 2_000_000,
        maxAdults: 2,
        maxChildren: 0,
        maxOccupancy: 2,
        sizeSqm: 28,
        bedType: 'King',
      },
    });
    flowTypeId = type.id;
    const room = await prisma.room.create({
      data: { propertyId, roomTypeId: type.id, number: `FL${stamp}`, status: 'CLEAN', isActive: true },
    });
    flowRoomId = room.id;
  }, 90_000);

  afterAll(async () => {
    try {
      if (cleanupReservationIds.length > 0) {
        await prisma.invoice.deleteMany({ where: { reservationId: { in: cleanupReservationIds } } });
        await prisma.payment.deleteMany({ where: { reservationId: { in: cleanupReservationIds } } });
        await prisma.folio.deleteMany({ where: { reservationId: { in: cleanupReservationIds } } });
        await prisma.reservation.deleteMany({ where: { id: { in: cleanupReservationIds } } });
      }
      await prisma.nightAudit.deleteMany({
        where: { propertyId, businessDate: new Date(`${flowDate}T00:00:00Z`) },
      });
      await prisma.journalEntry.deleteMany({
        where: { propertyId, businessDate: new Date(`${flowDate}T00:00:00Z`) },
      });
      if (flowRoomId) await prisma.room.deleteMany({ where: { id: flowRoomId } });
      if (flowTypeId) await prisma.roomType.deleteMany({ where: { id: flowTypeId } });
    } finally {
      await app?.close();
    }
  });

  it('creates a reservation with folio and nightly pricing', async () => {
    const { agent, csrf } = await login('frontdesk@grandsuite.vn', '10.30.0.1');
    const response = await agent
      .post('/api/v1/reservations')
      .set('x-csrf-token', csrf)
      .send({
        propertyId,
        checkIn: flowDate,
        checkOut: flowCheckOut,
        channelCode: 'BOOKING_COM',
        guest: { firstName: 'Kiểm', lastName: 'Thử', email: 'flow-test@example.com', nationality: 'VN' },
        rooms: [{ roomTypeId: flowTypeId, adults: 2 }],
      })
      .expect(201);

    reservationId = response.body.id;
    cleanupReservationIds.push(reservationId);
    folioId = response.body.folios[0].id;
    expect(response.body.status).toBe('CONFIRMED');
    expect(response.body.nights).toBe(2);
    expect(response.body.rooms[0].roomNumber).toBeTruthy();
    expect(response.body.totals.total).toBe(
      Number((response.body.totals.net + response.body.totals.serviceCharge + response.body.totals.vat).toFixed(2)),
    );
    expect(response.body.channel.code).toBe('BOOKING_COM');
  });

  it('checks in and posts a POS charge to the room', async () => {
    const front = await login('frontdesk@grandsuite.vn', '10.30.0.2');
    await front.agent
      .post(`/api/v1/reservations/${reservationId}/check-in`)
      .set('x-csrf-token', front.csrf)
      .send({})
      .expect(201);

    const operations = await login('manager.han@grandsuite.vn', '10.30.0.3');
    const order = await operations.agent
      .post('/api/v1/pos/orders')
      .set('x-csrf-token', operations.csrf)
      .send({ outletId, type: 'DINE_IN' })
      .expect(201);
    await operations.agent
      .post(`/api/v1/pos/orders/${order.body.id}/items`)
      .set('x-csrf-token', operations.csrf)
      .send({ items: [{ menuItemId, quantity: 2 }] })
      .expect(201);
    const charged = await operations.agent
      .post(`/api/v1/pos/orders/${order.body.id}/charge-to-room`)
      .set('x-csrf-token', operations.csrf)
      .send({ reservationId })
      .expect(201);
    expect(charged.body.status).toBe('CHARGED_TO_ROOM');
    expect(charged.body.folioBalance).toBeGreaterThan(0);
  });

  it('posts room revenue and OTA commission during night audit', async () => {
    const { agent, csrf } = await login('manager.han@grandsuite.vn', '10.30.0.4');
    const audit = await agent
      .post('/api/v1/night-audit/run')
      .set('x-csrf-token', csrf)
      .send({ propertyId, businessDate: flowDate })
      .expect(201);
    expect(audit.body.audit.status).toBe('COMPLETED');
    expect(audit.body.revenue.total).toBeGreaterThan(0);
    expect(audit.body.revenue.byDepartment.some((row: { department: string }) => row.department === 'ROOMS')).toBe(true);
    expect(audit.body.revenue.commissions).toBeGreaterThan(0);
    expect(audit.body.ledger.balanced).toBe(true);

    await agent
      .post('/api/v1/night-audit/run')
      .set('x-csrf-token', csrf)
      .send({ propertyId, businessDate: flowDate })
      .expect(409);
  });

  it('checks out, settles the folio and issues a paid invoice', async () => {
    const { agent, csrf } = await login('frontdesk@grandsuite.vn', '10.30.0.5');
    const checkout = await agent
      .post(`/api/v1/reservations/${reservationId}/check-out`)
      .set('x-csrf-token', csrf)
      .send({})
      .expect(201);
    expect(checkout.body.status).toBe('CHECKED_OUT');
    const balance = checkout.body.checkoutBalance as number;
    expect(balance).toBeGreaterThan(0);

    const payment = await agent
      .post(`/api/v1/folios/${folioId}/payments`)
      .set('x-csrf-token', csrf)
      .send({ amount: balance, method: 'CASH', reference: 'IT-CASH' })
      .expect(201);
    expect(payment.body.balance).toBe(0);

    const invoice = await agent
      .post(`/api/v1/invoices/folio/${folioId}`)
      .set('x-csrf-token', csrf)
      .send({ buyerName: 'Công ty Kiểm thử', buyerTaxCode: '0109999999' })
      .expect(201);
    invoiceId = invoice.body.id;
    expect(invoice.body.total).toBeGreaterThan(0);
    expect(invoice.body.balance).toBe(0);
    expect(invoice.body.status).toBe('PAID');
    expect(invoice.body.eInvoiceNo).toContain('EINV');
    expect(invoice.body.lines.length).toBeGreaterThanOrEqual(2);
  });

  it('reconciles revenue across departments, channels and the ledger', async () => {
    const { agent } = await login('ceo@grandsuite.vn', '10.30.0.6');
    const to = isoToday();
    const response = await agent
      .get(`/api/v1/accounting/reconciliation?propertyId=${propertyId}&from=${flowDate}&to=${to}`)
      .expect(200);
    expect(response.body.balanced).toBe(true);
    expect(response.body.revenue).toBeGreaterThan(0);
    expect(response.body.revenue).toBe(response.body.departmentTotal);
    expect(response.body.revenue).toBe(response.body.channelTotal);
    // POS direct sales never reach a folio, so folio revenue is a subset.
    expect(response.body.folioNet).toBeLessThanOrEqual(response.body.revenue);
    expect(response.body.checks.every((check: { ok: boolean }) => check.ok)).toBe(true);
    const fnb = response.body.byDepartment.find((row: { department: string }) => row.department === 'FNB');
    expect(fnb.amount).toBeGreaterThan(0);
  });

  it('prevents double booking under 10 concurrent requests for the last room', async () => {
    const stamp = Date.now().toString().slice(-6);
    const type = await prisma.roomType.create({
      data: {
        propertyId,
        code: `TS${stamp}`,
        name: 'Test Overbooking',
        description: 'single room type',
        baseRate: 1_000_000,
        maxAdults: 2,
        maxChildren: 0,
        maxOccupancy: 2,
        sizeSqm: 25,
        bedType: 'King',
      },
    });
    const room = await prisma.room.create({
      data: { propertyId, roomTypeId: type.id, number: `TST${stamp}`, status: 'CLEAN', isActive: true },
    });
    const raceStart = '2027-02-01';
    const raceEnd = '2027-02-03';
    await prisma.nightAudit.deleteMany({
      where: { propertyId, businessDate: new Date(`${raceStart}T00:00:00Z`) },
    });

    const { agent, csrf } = await login('frontdesk@grandsuite.vn', '10.30.0.7');
    const attempts = Array.from({ length: 10 }).map((_, index) =>
      agent
        .post('/api/v1/reservations')
        .set('x-csrf-token', csrf)
        .send({
          propertyId,
          checkIn: raceStart,
          checkOut: raceEnd,
          channelCode: 'DIRECT',
          guest: { firstName: 'Tranh', lastName: `Chỗ ${index}`, email: `race-${stamp}-${index}@example.com` },
          rooms: [{ roomTypeId: type.id, adults: 1 }],
        }),
    );
    const results = await Promise.all(attempts);
    const success = results.filter((result) => result.status === 201);
    expect(success).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(9);

    const overlapping = await prisma.reservationRoom.count({
      where: {
        roomId: room.id,
        status: { in: ['RESERVED', 'IN_HOUSE'] },
        checkIn: { lt: new Date(`${raceEnd}T00:00:00Z`) },
        checkOut: { gt: new Date(`${raceStart}T00:00:00Z`) },
      },
    });
    expect(overlapping).toBe(1);

    const createdId = success[0]!.body.id as string;
    cleanupReservationIds.push(createdId);
    await prisma.folio.deleteMany({ where: { reservationId: createdId } });
    await prisma.reservation.delete({ where: { id: createdId } });
    cleanupReservationIds.splice(cleanupReservationIds.indexOf(createdId), 1);
    await prisma.room.delete({ where: { id: room.id } });
    await prisma.roomType.delete({ where: { id: type.id } });
  }, 120_000);

  it('enforces RBAC on operational mutations', async () => {
    const { agent, csrf } = await login('housekeeping@grandsuite.vn', '10.30.0.8');
    await agent
      .post('/api/v1/reservations')
      .set('x-csrf-token', csrf)
      .send({
        propertyId,
        checkIn: '2026-12-01',
        checkOut: '2026-12-02',
        guest: { firstName: 'No', lastName: 'Access' },
        rooms: [{ roomTypeId: flowTypeId, adults: 1 }],
      })
      .expect(403);
    await agent.get(`/api/v1/night-audit/latest?propertyId=${propertyId}`).expect(403);
  });

  it('keeps the audit chain valid and invoices printable', async () => {
    const { agent } = await login('ceo@grandsuite.vn', '10.30.0.9');
    const verify = await agent.get('/api/v1/audit/verify').expect(200);
    expect(verify.body.valid).toBe(true);

    const html = await agent.get(`/api/v1/invoices/${invoiceId}/print`).expect(200);
    expect(html.headers['content-type']).toContain('text/html');
    expect(html.text).toContain('HOÁ ĐƠN GTGT');
    expect(html.text).toContain('EINV');
  });
});
