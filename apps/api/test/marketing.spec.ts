import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, readSetCookie } from './test-app';

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'NinhVaNa@2026';

describe('Marketing workspace, property map and exports', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let agent: ReturnType<typeof request.agent>;
  let csrf: string;
  let rootId: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    agent = request.agent(http);
    const login = await agent.post('/api/v1/auth/login').set('X-Forwarded-For', '10.95.0.1').send({ email: 'marketing@ninhvana.vn', password: PASSWORD }).expect(200);
    csrf = readSetCookie(login.headers, 'gs_csrf')!;
  }, 90_000);
  afterAll(async () => { await app?.close(); });

  it('returns the NinhVaNa zones and floor layout', async () => {
    const response = await agent.get('/api/v1/property-map').expect(200);
    const items = response.body.items;
    expect(items.find((item: { code: string }) => item.code === 'A1').description).toContain('dormitory');
    expect(items.find((item: { code: string }) => item.code === 'A2').features.connectingRooms).toBe(1);
    expect(items.find((item: { code: string }) => item.code === 'A3').features.familyMezzanineRooms).toBe(2);
  });

  it('creates a marketing root and a detailed child, then removes them', async () => {
    const root = await agent.post('/api/v1/marketing/items').set('x-csrf-token', csrf).send({ title: `Test pillar ${Date.now()}`, description: 'Kiểm thử mục lớn' }).expect(201);
    rootId = root.body.id;
    const child = await agent.post('/api/v1/marketing/items').set('x-csrf-token', csrf).send({ title: 'Mục con chi tiết', parentId: rootId, budget: 5000000, status: 'IN_PROGRESS' }).expect(201);
    expect(child.body.parentId).toBe(rootId);
    const tree = await agent.get('/api/v1/marketing/tree').expect(200);
    const node = tree.body.items.find((item: { id: string }) => item.id === rootId);
    expect(node.children).toHaveLength(1);
    await agent.delete(`/api/v1/marketing/items/${rootId}`).set('x-csrf-token', csrf).expect(200);
  });

  it('exports marketing to Excel, Word and Google Sheets TSV', async () => {
    const xlsx = await agent.get('/api/v1/exports/marketing?format=xlsx').expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect(Number(xlsx.headers['content-length'] ?? 0)).toBeGreaterThan(1000);
    const docx = await agent.get('/api/v1/exports/property-map?format=docx').expect(200);
    expect(docx.headers['content-type']).toContain('wordprocessingml');
    const tsv = await agent.get('/api/v1/exports/marketing?format=tsv').expect(200);
    expect(tsv.text).toContain('Mục');
  });
});
