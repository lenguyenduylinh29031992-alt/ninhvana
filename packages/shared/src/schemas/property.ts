import { z } from 'zod';
import { currencySchema, optionalEmail, optionalText, phoneSchema, timezoneSchema } from './common';

export const propertyTypeSchema = z.enum(['HOTEL', 'RESORT', 'RESTAURANT', 'SPA']);

export const createPropertySchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,11}$/, 'Mã cơ sở 2–12 ký tự, chỉ chữ, số và dấu gạch'),
  name: z.string().trim().min(2, 'Tên cơ sở quá ngắn').max(160),
  legalName: optionalText(200),
  type: propertyTypeSchema,
  starRating: z.coerce.number().int().min(1).max(5).optional(),
  address: z.string().trim().min(5, 'Vui lòng nhập địa chỉ').max(300),
  city: z.string().trim().min(1).max(80),
  country: z.string().trim().min(2).max(2).default('VN'),
  phone: phoneSchema.optional(),
  email: optionalEmail,
  timezone: timezoneSchema.default('Asia/Ho_Chi_Minh'),
  currency: currencySchema.default('VND'),
  roomCount: z.coerce.number().int().min(0).max(5000).default(0),
  checkInTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ nhận phòng dạng HH:mm')
    .default('14:00'),
  checkOutTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ trả phòng dạng HH:mm')
    .default('12:00'),
  businessDayCutoff: z.coerce.number().int().min(0).max(12).default(6),
  pricesIncludeTax: z.boolean().default(false),
  serviceChargePct: z.coerce.number().min(0).max(30).default(5),
  taxCode: optionalText(20),
  isActive: z.boolean().default(true),
});

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = createPropertySchema.partial().omit({ code: true });

export const propertyQuerySchema = z.object({
  includeInactive: z
    .preprocess((value) => value === 'true' || value === '1', z.boolean())
    .default(false),
});
