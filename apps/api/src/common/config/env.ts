import { z } from 'zod';

/**
 * Environment contract. The API refuses to boot with missing/weak secrets —
 * misconfiguration must never silently degrade authentication in production.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(20),
  REDIS_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET phải dài ít nhất 32 ký tự'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET phải dài ít nhất 32 ký tự'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET phải dài ít nhất 32 ký tự'),
  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET phải dài ít nhất 32 ký tự'),
  APP_ENCRYPTION_KEY: z.string().min(24, 'APP_ENCRYPTION_KEY phải là base64 32 byte'),

  SEED_ADMIN_PASSWORD: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),

  LLM_BASE_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),

  EINVOICE_PROVIDER: z.enum(['mock', 'vnpt', 'viettel', 'misa']).default('mock'),
  BACKUP_DIR: z.string().default('./backups'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n  - ');
    throw new Error(`Cấu hình môi trường không hợp lệ:\n  - ${details}`);
  }
  return parsed.data;
}
