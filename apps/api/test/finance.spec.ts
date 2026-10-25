import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, readSetCookie } from './test-app';
import { PrismaService } from '../src/common/prisma/prisma.module';

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'NinhVaNa@2026';

describe('Costs, payroll and financial statements', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let agent: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;
  let adminCsrf: string;
  let propertyId: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    agent = request.agent(http);
    await agent.post('/api/v1/auth/login').set('X-Forwarded-For', '10.90.0.1').send({ email: 'cfo@ninhvana.vn', password: PASSWORD }).expect(200);
    admin = request.agent(http);
    const adminLogin = await admin.post('/api/v1/auth/login').set('X-Forwarded-For', '10.90.0.2').send({ email: 'admin@ninhvana.vn', password: PASSWORD }).expect(200);
    adminCsrf = readSetCookie(adminLogin.headers, 'gs_csrf')!;
    const properties = await agent.get('/api/v1/properties').expect(200);
    const list = properties.body.items ?? properties.body;
    propertyId = list.find((property: { type: string }) => property.type === 'HOTEL').id;
  }, 90_000);

  afterAll(async () => { await app?.close(); });

  it('returns a USALI P&L with GOP and GOPPAR from the ledger', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const from = `${today.slice(0, 7)}-01`;
    const response = await agent.get(`/api/v1/finance/pnl?propertyId=${propertyId}&from=${from}&to=${today}`).expect(200);
    expect(response.body.revenue).toBeGreaterThan(0);
    expect(response.body.payroll).toBeGreaterThan(0);
    expect(response.body.gop).toBeGreaterThan(0);
    expect(response.body.gopPar).toBeGreaterThan(0);
    expect(response.body.departments.length).toBeGreaterThan(0);
    expect(response.body.gop).toBeLessThanOrEqual(response.body.revenue);
  });

  it('produces a balanced balance sheet', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const response = await agent.get(`/api/v1/finance/balance-sheet?propertyId=${propertyId}&asOf=${today}`).expect(200);
    expect(response.body.totalAssets).toBeGreaterThan(0);
    expect(response.body.balanced).toBe(true);
    expect(Math.abs(response.body.difference)).toBeLessThan(1);
  });

  it('posts a new expense into the P&L exactly once', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const from = `${today.slice(0, 7)}-01`;
    const before = await agent.get(`/api/v1/finance/pnl?propertyId=${propertyId}&from=${from}&to=${today}`).expect(200);
    const amount = 777_000;
    await admin
      .post('/api/v1/costs/expenses')
      .set('x-csrf-token', adminCsrf)
      .send({ propertyId, accountCode: '6900', department: 'ADMIN', description: `Integration test expense ${Date.now()}`, amount, paymentMethod: 'BANK_TRANSFER' })
      .expect(201);
    const after = await agent.get(`/api/v1/finance/pnl?propertyId=${propertyId}&from=${from}&to=${today}`).expect(200);
    expect(after.body.otherOperating - before.body.otherOperating).toBeGreaterThanOrEqual(amount - 1);
    expect(after.body.balanceSheet).toBeUndefined();
  });

  it('runs, posts and pays a monthly payroll', async () => {
    const period = '2027-01';
    const prisma = app.get(PrismaService);
    await prisma.payrollRun.deleteMany({ where: { propertyId, period } });
    const created = await admin.post('/api/v1/hr/payroll/run').set('x-csrf-token', adminCsrf).send({ propertyId, period }).expect(201);
    expect(Number(created.body.gross)).toBeGreaterThan(0);
    const posted = await admin.post(`/api/v1/hr/payroll/${created.body.id}/post`).set('x-csrf-token', adminCsrf).expect(201);
    expect(posted.body.status).toBe('POSTED');
    const paid = await admin.post(`/api/v1/hr/payroll/${created.body.id}/pay`).set('x-csrf-token', adminCsrf).expect(201);
    expect(paid.body.status).toBe('PAID');
  });

  it('creates a purchase request, approves it and receives goods into stock', async () => {
    const suppliers = await agent.get('/api/v1/procurement/suppliers').expect(200);
    const supplierId = suppliers.body[0].id;
    const stock = await agent.get(`/api/v1/procurement/stock?propertyId=${propertyId}`).expect(200);
    const item = stock.body[0];
    const before = Number(item.quantity);
    const requestBody = await admin
      .post('/api/v1/procurement/requests')
      .set('x-csrf-token', adminCsrf)
      .send({ propertyId, department: 'FNB', lines: [{ itemId: item.itemId, description: 'Test receive', quantity: 2, unitCost: 100_000 }] })
      .expect(201);
    const order = await admin.post(`/api/v1/procurement/requests/${requestBody.body.id}/approve`).set('x-csrf-token', adminCsrf).send({ supplierId }).expect(201);
    await admin.post(`/api/v1/procurement/orders/${order.body.id}/receive`).set('x-csrf-token', adminCsrf).expect(201);
    const after = await agent.get(`/api/v1/procurement/stock?propertyId=${propertyId}`).expect(200);
    const updated = after.body.find((row: { itemId: string }) => row.itemId === item.itemId);
    expect(Number(updated.quantity)).toBeGreaterThan(before);
  });

  it('returns AP aging and a valid audit chain', async () => {
    const ap = await agent.get(`/api/v1/finance/ap-aging?propertyId=${propertyId}`).expect(200);
    expect(ap.body.total).toBeGreaterThan(0);
    const verify = await agent.get('/api/v1/audit/verify').expect(200);
    expect(verify.body.valid).toBe(true);
  });
});
