/**
 * Creates .env.local from .env.example with strong random secrets.
 * Idempotent: never overwrites an existing file.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, '.env.local');
const template = resolve(root, '.env.example');

if (existsSync(target)) {
  console.log('• .env.local đã tồn tại — giữ nguyên.');
  process.exit(0);
}

const secret = () => randomBytes(48).toString('base64');
let env = readFileSync(template, 'utf8');
const replacements = {
  'JWT_ACCESS_SECRET="change-me-access-secret-at-least-32-characters-long"': `JWT_ACCESS_SECRET="${secret()}"`,
  'JWT_REFRESH_SECRET="change-me-refresh-secret-at-least-32-characters-long"': `JWT_REFRESH_SECRET="${secret()}"`,
  'COOKIE_SECRET="change-me-cookie-secret-at-least-32-characters-long"': `COOKIE_SECRET="${secret()}"`,
  'CSRF_SECRET="change-me-csrf-secret-at-least-32-characters-long"': `CSRF_SECRET="${secret()}"`,
  'APP_ENCRYPTION_KEY="MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="': `APP_ENCRYPTION_KEY="${randomBytes(32).toString('base64')}"`,
};

for (const [placeholder, value] of Object.entries(replacements)) {
  if (!env.includes(placeholder)) {
    console.warn(`⚠ Không tìm thấy placeholder: ${placeholder.slice(0, 40)}…`);
    continue;
  }
  env = env.replace(placeholder, value);
}

writeFileSync(target, env, { mode: 0o600 });
console.log('✔ Đã tạo .env.local với secret ngẫu nhiên (quyền 600).');
