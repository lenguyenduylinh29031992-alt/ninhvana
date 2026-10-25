import { z } from 'zod';
import { PAGINATION } from '../constants';

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo định dạng YYYY-MM-DD');

export const idSchema = z.string().min(1).max(64);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.MAX_PAGE_SIZE)
    .default(PAGINATION.DEFAULT_PAGE_SIZE),
  q: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().trim().max(200).optional(),
  ),
  sort: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z
      .string()
      .max(64)
      .regex(/^[a-zA-Z][a-zA-Z0-9_.]*$/, 'Sắp xếp không hợp lệ')
      .optional(),
  ),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export const dateRangeSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
  })
  .refine((value) => value.from <= value.to, {
    message: '"Từ ngày" phải trước hoặc bằng "Đến ngày"',
    path: ['to'],
  });

export type DateRangeQuery = z.infer<typeof dateRangeSchema>;

export const optionalText = (max = 500) => z.string().trim().max(max).optional();

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email không hợp lệ')
  .max(190)
  .optional();

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{6,20}$/, 'Số điện thoại không hợp lệ');

export const localeSchema = z.enum(['vi', 'en']);

export const currencySchema = z.enum(['VND', 'USD', 'EUR', 'KRW', 'JPY', 'CNY']);

export const timezoneSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z_]+\/[A-Za-z_+-]+$/, 'Múi giờ không hợp lệ');
