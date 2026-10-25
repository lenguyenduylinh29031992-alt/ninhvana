/**
 * API test bootstrap.
 * Loads .env.local from the repo root, then falls back to the test database.
 * Integration suites skip themselves when no database is reachable.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const candidates = ['../../.env.test', '../../.env.local', '.env.test', '.env.local', '.env'];
for (const candidate of candidates) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) {
    try {
      process.loadEnvFile(path);
    } catch {
      // ignore malformed env files in CI; defaults below still apply
    }
  }
}

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://grandsuite:grandsuite@127.0.0.1:55432/grandsuite_test?schema=public';
