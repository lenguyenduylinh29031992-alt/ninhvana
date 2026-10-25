import { z } from 'zod';
import { currencySchema, isoDateSchema, optionalText } from './common';

export const settingKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*$/, 'Khoá cấu hình không hợp lệ');

export const upsertSettingSchema = z.object({
  key: settingKeySchema,
  value: z.unknown(),
  category: z.string().trim().max(40).default('general'),
  description: optionalText(300),
});

export const settingsQuerySchema = z.object({
  scope: z.string().trim().max(64).optional(),
  category: optionalText(40),
});

export const taxRateSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,20}$/, 'Mã thuế 2–20 ký tự'),
  name: z.string().trim().min(2).max(120),
  rate: z.coerce.number().min(0).max(100),
  type: z.enum(['VAT', 'SERVICE_CHARGE', 'LODGING', 'WITHHOLDING', 'OTHER']),
  isIncluded: z.boolean().default(false),
  glAccountCode: optionalText(20),
  isActive: z.boolean().default(true),
});

export const updateTaxRateSchema = taxRateSchema.partial().omit({ code: true });

export const exchangeRateSchema = z.object({
  base: currencySchema.default('USD'),
  quote: currencySchema.default('VND'),
  rate: z.coerce.number().positive('Tỷ giá phải lớn hơn 0').max(1_000_000),
  effectiveDate: isoDateSchema,
  source: optionalText(60),
});

export const exchangeRateQuerySchema = z.object({
  base: currencySchema.optional(),
  quote: currencySchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const documentTemplateSchema = z.object({
  type: z.enum(['FOLIO', 'INVOICE', 'REGISTRATION', 'BEO', 'PAYSLIP', 'RECEIPT']),
  name: z.string().trim().min(2).max(120),
  locale: z.enum(['vi', 'en']).default('vi'),
  contentHtml: z.string().min(20).max(200_000),
  isDefault: z.boolean().default(false),
});

export const integrationConfigSchema = z.object({
  provider: z.string().trim().min(2).max(60),
  category: z.enum(['OTA', 'SOCIAL', 'PAYMENT', 'EINVOICE', 'EMAIL', 'OCR', 'LOCK', 'OTHER']),
  displayName: z.string().trim().min(2).max(120),
  status: z.enum(['DISABLED', 'SANDBOX', 'ACTIVE', 'ERROR']).default('SANDBOX'),
  credentials: z.record(z.string(), z.string().max(2000)).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});
