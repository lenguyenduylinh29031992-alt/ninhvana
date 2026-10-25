import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:3000';
const errors = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const results = [];
async function flow(name, run) {
  try { await run(); results.push({ name, ok: true }); console.info('PASS', name); }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.info('FAIL', name, error.message); }
}
await page.goto(`${base}/login`);
await page.fill('#email', 'manager.han@grandsuite.vn');
await page.fill('#password', 'GrandSuite@2026');
await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
await page.waitForURL('**/dashboard');

await flow('1. Dashboard điều hành tải KPI', async () => {
  await page.goto(`${base}/dashboard`);
  await page.getByText('Doanh thu hôm nay').first().waitFor({ timeout: 8000 });
  await page.getByText('Công suất').first().waitFor();
});

await flow('2. Lễ tân mở dialog đặt phòng', async () => {
  await page.goto(`${base}/front-desk`);
  await page.getByRole('button', { name: /Đặt phòng/ }).first().click();
  await page.getByText('Đặt phòng mới').waitFor({ timeout: 8000 });
  await page.keyboard.press('Escape');
});

await flow('3. POS mở bàn và thêm món', async () => {
  await page.goto(`${base}/pos`);
  await page.getByText('Sơ đồ bàn', { exact: true }).waitFor({ timeout: 8000 });
  await page.getByText('A01', { exact: true }).first().click();
  await page.getByText('Khai vị').waitFor({ timeout: 8000 });
  await page.getByText('Súp hành Pháp', { exact: true }).first().click();
  await page.getByText('Súp hành Pháp').nth(1).waitFor({ timeout: 8000 });
});

await flow('4. Buồng phòng cập nhật trạng thái', async () => {
  await page.goto(`${base}/housekeeping`);
  await page.getByText('Bảng công việc buồng phòng').waitFor({ timeout: 8000 });
  const start = page.getByRole('button', { name: 'Bắt đầu' }).first();
  if (await start.count()) await start.click();
  await page.waitForTimeout(700);
});

await flow('5. Report Builder chạy báo cáo', async () => {
  await page.goto(`${base}/reports`);
  await page.getByRole('button', { name: 'Chạy báo cáo' }).click();
  await page.getByText('P&L theo USALI').first().waitFor({ timeout: 8000 });
  await page.locator('table').first().waitFor();
});

await page.goto(`${base}/crm`);
await page.getByText('Guest Experience').waitFor({ timeout: 8000 });
await browser.close();
const failed = results.filter((result) => !result.ok);
console.info(JSON.stringify({ flows: results.length, passed: results.length - failed.length, failed: failed.length, consoleErrors: errors }, null, 2));
process.exit(failed.length || errors.length ? 1 : 0);
