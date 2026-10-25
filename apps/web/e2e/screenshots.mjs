import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.env.WEB_URL ?? 'http://127.0.0.1:3000';
const out = new URL('../../../docs/evidence/', import.meta.url);
const outPath = decodeURIComponent(out.pathname);
await mkdir(outPath, { recursive: true });

const browser = await chromium.launch();
const problems = [];

async function login(page, email = 'ceo@grandsuite.vn') {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', email);
  await page.fill('#password', 'GrandSuite@2026');
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
  await login(mobilePage, 'housekeeping@grandsuite.vn');
  await shot(mobilePage, 'dashboard-390');
  await mobilePage.getByRole('button', { name: 'Menu', exact: true }).click();
  await mobilePage.waitForTimeout(500);
  await shot(mobilePage, 'nav-390');
  await mobile.close();
  await tablet.close();
  await context.close();
}

await browser.close();
console.info(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'No console/page errors.');
