import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from './test-app';

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'GrandSuite@2026';

describe('Consolidated dashboard, forecast and report builder', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let agent: ReturnType<typeof request.agent>;
  let propertyId: string;

  beforeAll(async () => {
    app = await createTestApp(); http = app.getHttpServer(); agent = request.agent(http);
    await agent.post('/api/v1/auth/login').set('X-Forwarded-For', '10.95.0.1').send({ email: 'cfo@grandsuite.vn', password: PASSWORD }).expect(200);
    const properties = await agent.get('/api/v1/properties').expect(200);
    propertyId = (properties.body.items ?? properties.body).find((property: { type: string }) => property.type === 'HOTEL').id;
  }, 90_000);
  afterAll(async () => { await app?.close(); });

  it('returns 24 months of history and consolidated group metrics under 2 seconds', async () => {
    const response = await agent.get('/api/v1/dashboard/consolidated').expect(200);
    expect(response.body.monthly.length).toBeGreaterThanOrEqual(24);
    expect(response.body.metrics.revenue).toBeGreaterThan(0);
    expect(response.body.metrics.gop).toBeGreaterThan(0);
    expect(response.body.metrics.gopPar).toBeGreaterThan(0);
    expect(response.body.metrics.occupancy).toBeGreaterThan(0);
    expect(response.body.byProperty.length).toBeGreaterThan(0);
    const propertyRevenue = response.body.byProperty.reduce((sum: number, row: { revenue: number }) => sum + row.revenue, 0);
    expect(Math.abs(propertyRevenue - response.body.metrics.revenue)).toBeLessThan(1);
    expect(response.body.tookMs).toBeLessThan(2000);
    expect(response.body.forecast.points).toHaveLength(6);
    expect(response.body.forecast.backtestMonths).toBeGreaterThan(0);
    expect(response.body.forecast.mape).toBeTypeOf('number');
  });

  it('serves the second request from cache', async () => {
    await agent.get('/api/v1/dashboard/consolidated').expect(200);
    const second = await agent.get('/api/v1/dashboard/consolidated').expect(200);
    expect(second.body.cached).toBe(true);
  });

  it('lists report templates and runs a P&L report', async () => {
    const templates = await agent.get('/api/v1/reports/templates').expect(200);
    expect(templates.body.length).toBeGreaterThanOrEqual(6);
    const today = new Date().toISOString().slice(0, 10);
    const run = await agent.get(`/api/v1/reports/run?template=pnl&propertyId=${propertyId}&from=${today.slice(0, 7)}-01&to=${today}`).expect(200);
    expect(run.body.rows.length).toBe(7);
    expect(run.body.columns.length).toBe(2);
    expect(run.body.rows.some((row: { label: string }) => row.label === 'GOP')).toBe(true);
  });

  it('exports a UTF-8 CSV with a header row', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const response = await agent.get(`/api/v1/reports/export.csv?template=department&propertyId=${propertyId}&from=${today.slice(0, 7)}-01&to=${today}`).expect(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain('Bộ phận');
    expect(response.text.split('\r\n').length).toBeGreaterThan(1);
  });

  it('keeps the audit chain valid after report generation', async () => {
    const verify = await agent.get('/api/v1/audit/verify').expect(200);
    expect(verify.body.valid).toBe(true);
  });
});
