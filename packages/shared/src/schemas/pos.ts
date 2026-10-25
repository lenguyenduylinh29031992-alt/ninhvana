import { z } from 'zod';
import { isoDateSchema, optionalText } from './common';

export const posOrderTypeSchema = z.enum(['DINE_IN', 'TAKEAWAY', 'ROOM_SERVICE', 'BANQUET']);
export const paymentMethodSchema = z.enum([
  'CASH',
  'CARD',
  'BANK_TRANSFER',
  'VIETQR',
  'VNPAY',
  'MOMO',
  'ZALO_PAY',
  'STRIPE',
  'COMPANY_AR',
]);

export const createPosOrderSchema = z.object({
  outletId: z.string().min(1),
  tableId: z.string().optional(),
  type: posOrderTypeSchema.default('DINE_IN'),
  reservationId: z.string().optional(),
  guestId: z.string().optional(),
  notes: optionalText(300),
});

export const posOrderItemInputSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.coerce.number().positive().max(99).default(1),
  notes: optionalText(200),
  modifiers: z
    .array(z.object({ name: z.string().min(1).max(60), priceDelta: z.coerce.number().default(0) }))
    .max(10)
    .optional(),
  seatNo: z.coerce.number().int().min(1).max(20).optional(),
  course: optionalText(40),
});

export const addPosItemsSchema = z.object({
  items: z.array(posOrderItemInputSchema).min(1).max(50),
});

export const posPaySchema = z.object({
  payments: z
    .array(
      z.object({
        method: paymentMethodSchema,
        amount: z.coerce.number().positive(),
        reference: optionalText(120),
      }),
    )
    .min(1)
    .max(4),
});

export const chargeToRoomSchema = z.object({
  reservationId: z.string().min(1),
});

export const posOrderQuerySchema = z.object({
  outletId: z.string().optional(),
  status: z.enum(['OPEN', 'SENT', 'SERVED', 'PAID', 'CHARGED_TO_ROOM', 'VOID']).optional(),
  businessDate: isoDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const kdsStatusSchema = z.object({
  status: z.enum(['QUEUED', 'PREPARING', 'READY', 'COMPLETED']),
});
