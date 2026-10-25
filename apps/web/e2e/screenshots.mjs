import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.env.WEB_URL ?? 'http://127.0.0.1:3000';
const out = new URL('../../../docs/evidence/', import.meta.url);
const outPath = decodeURIComponent(out.pathname);
await mkdir(outPath, { recursive: true });

const browser = await chromium.launch();
const problems = [];

async function login(page, email = 'ceo@ninhvana.vn') {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', email);
  await page.fill('#password', 'NinhVaNa@2026');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('**/dashboard', { timeout: 20000 });
  await page.waitForTimeout(1500);
}

async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: `${outPath}${name}.png`, fullPage });
  console.info('captured', name);
}

// Desktop 1920 — executive portfolio
{
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'vi-VN' });
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`); });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));

  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await shot(page, 'login-1920');

  await login(page);
  await shot(page, 'dashboard-1920', true);

  for (const [path, name] of [
    ['/admin/users', 'users-1920'],
    ['/admin/roles', 'roles-1920'],
    ['/admin/audit', 'audit-1920'],
    ['/settings', 'settings-1920'],
    ['/settings/integrations', 'integrations-1920'],
    ['/profile', 'profile-1920'],
  ]) {
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await shot(page, name);
  }

  // Dark mode dashboard
  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.evaluate(() => { localStorage.setItem('gs_theme', 'dark'); document.documentElement.classList.add('dark'); });
  await page.waitForTimeout(500);
  await shot(page, 'dashboard-1920-dark', true);

  // Operations screens — property manager
  const ops = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'vi-VN' });
  const opsPage = await ops.newPage();
  opsPage.on('console', (msg) => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`); });
  opsPage.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  await login(opsPage, 'manager.hanoi@ninhvana.vn');
  for (const [path, name] of [
    ['/front-desk', 'front-desk-1920'],
    ['/pos', 'pos-1920'],
    ['/pos/kds', 'kds-1920'],
    ['/housekeeping', 'housekeeping-1920'],
    ['/night-audit', 'night-audit-1920'],
    ['/tape-chart', 'tape-chart-1920'],
    ['/reservations', 'reservations-1920'],
    ['/guests', 'guests-1920'],
    ['/channels', 'channels-1920'],
    ['/inbox', 'inbox-1920'],
  ]) {
    await opsPage.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    await opsPage.waitForTimeout(1200);
    await shot(opsPage, name);
  }

  const financeContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'vi-VN' });
  const financePage = await financeContext.newPage();
  financePage.on('console', (msg) => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`); });
  financePage.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  await login(financePage, 'cfo@ninhvana.vn');
  for (const [path, name] of [['/finance', 'finance-1920'], ['/costs', 'costs-1920'], ['/payroll', 'payroll-1920'], ['/analytics', 'analytics-1920'], ['/crm', 'crm-1920']]) {
    await financePage.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    await financePage.waitForTimeout(1200);
    await shot(financePage, name);
  }
  await financePage.goto(`${base}/reports`, { waitUntil: 'domcontentloaded' });
  await financePage.waitForTimeout(800);
  await financePage.getByRole('button', { name: 'Chạy báo cáo' }).click();
  await financePage.waitForTimeout(1200);
  await shot(financePage, 'reports-1920');
  await financeContext.close();

  const publicContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'vi-VN' });
  const publicPage = await publicContext.newPage();
  publicPage.on('console', (msg) => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`); });
  publicPage.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  await publicPage.goto(`${base}/book`, { waitUntil: 'domcontentloaded' });
  await publicPage.waitForTimeout(1500);
  await shot(publicPage, 'booking-engine-1920');
  await publicContext.close();

  const mobileOps = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN', isMobile: true, hasTouch: true });
  const mobileOpsPage = await mobileOps.newPage();
  await login(mobileOpsPage, 'manager.hanoi@ninhvana.vn');
  await mobileOpsPage.goto(`${base}/front-desk`, { waitUntil: 'domcontentloaded' });
  await mobileOpsPage.waitForTimeout(1200);
  await shot(mobileOpsPage, 'front-desk-390');
  await mobileOpsPage.goto(`${base}/housekeeping`, { waitUntil: 'domcontentloaded' });
  await mobileOpsPage.waitForTimeout(1200);
  await shot(mobileOpsPage, 'housekeeping-390', true);
  await mobileOps.close();
  await ops.close();

  // Tablet 768 — front desk scope
  const tablet = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    locale: 'vi-VN',
    storageState: await context.storageState(),
  });
  const tabletPage = await tablet.newPage();
  await tabletPage.addInitScript(() => localStorage.setItem('gs_theme', 'light'));
  await tabletPage.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
  await tabletPage.waitForTimeout(1500);
  await shot(tabletPage, 'dashboard-768');

  // Mobile 390 — housekeeping role
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN', isMobile: true, hasTouch: true });
  const mobilePage = await mobile.newPage();
  await login(mobilePage, 'housekeeping@ninhvana.vn');
  await shot(mobilePage, 'dashboard-390');
  await mobilePage.getByRole('button', { name: 'Menu', exact: true }).click();
  await mobilePage.waitForTimeout(500);
  await shot(mobilePage, 'nav-390');
  await mobile.close();
  await tablet.close();
  await context.close();
}

// Marketing workspace and property map — admin
{
  const adminContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'vi-VN' });
  const adminPage = await adminContext.newPage();
  adminPage.on('console', (msg) => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`); });
  adminPage.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  await login(adminPage, 'admin@ninhvana.vn');
  for (const [path, name] of [['/marketing', 'marketing-1920'], ['/property-map', 'property-map-1920']]) {
    await adminPage.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForTimeout(1400);
    await shot(adminPage, name, true);
  }
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.goto(`${base}/marketing`, { waitUntil: 'domcontentloaded' });
  await adminPage.waitForTimeout(1000);
  await shot(adminPage, 'marketing-390');
}

await browser.close();
console.info(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'No console/page errors.');
