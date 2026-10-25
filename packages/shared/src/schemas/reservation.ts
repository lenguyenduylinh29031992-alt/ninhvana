import { z } from 'zod';
import { isoDateSchema, optionalText } from './common';
import { DEPARTMENT_GROUPS } from '../ledger';

const guestFields = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().toLowerCase().email().max(190).optional(),
  phone: z.string().trim().max(20).optional(),
  nationality: z.string().trim().max(2).optional(),
  country: z.string().trim().max(2).optional(),
  dob: isoDateSchema.optional(),
  vipLevel: z.coerce.number().int().min(0).max(5).optional(),
  notes: optionalText(500),
});

export const reservationRoomInputSchema = z.object({
  roomTypeId: z.string().min(1),
  ratePlanId: z.string().min(1).optional(),
  guestId: z.string().min(1).optional(),
  adults: z.coerce.number().int().min(1).max(6).default(2),
  children: z.coerce.number().int().min(0).max(4).default(0),
});

export const createReservationSchema = z
  .object({
    propertyId: z.string().min(1),
    guestId: z.string().min(1).optional(),
    guest: guestFields.default({}),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    rooms: z.array(reservationRoomInputSchema).min(1).max(20),
    ratePlanId: z.string().min(1).optional(),
    channelCode: z.string().trim().max(40).optional(),
    companyId: z.string().min(1).optional(),
    specialRequests: optionalText(1000),
    notes: optionalText(1000),
    source: optionalText(60),
    depositAmount: z.coerce.number().min(0).max(10_000_000_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.checkOut <= value.checkIn) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ngày trả phòng phải sau ngày nhận phòng', path: ['checkOut'] });
    }
    if (!value.guestId && (!value.guest.firstName || !value.guest.lastName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cần chọn khách hàng hoặc nhập họ tên khách',
        path: ['guest', 'lastName'],
      });
    }
  });

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const availabilityQuerySchema = z
  .object({
    propertyId: z.string().min(1),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    adults: z.coerce.number().int().min(1).max(10).default(2),
    children: z.coerce.number().int().min(0).max(6).default(0),
    ratePlanId: z.string().min(1).optional(),
  })
  .refine((value) => value.checkOut > value.checkIn, {
    message: 'Ngày trả phòng phải sau ngày nhận phòng',
    path: ['checkOut'],
  });

export const reservationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: optionalText(120),
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_HOUSE', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW']).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  propertyId: z.string().optional(),
  channelId: z.string().optional(),
});

export const cancelReservationSchema = z.object({
  reason: z.string().trim().min(5, 'Vui lòng nhập lý do huỷ').max(300),
  waiveFee: z.boolean().default(false),
});

export const checkInSchema = z.object({
  notes: optionalText(500),
});

export const checkOutSchema = z.object({
  notes: optionalText(500),
  settleToCompanyId: z.string().optional(),
});

export const moveReservationRoomSchema = z.object({
  roomId: z.string().min(1),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
});

export const folioChargeSchema = z.object({
  type: z.enum(['ROOM_CHARGE', 'FNB_CHARGE', 'SPA_CHARGE', 'EVENT_CHARGE', 'OTHER_CHARGE', 'DISCOUNT', 'ADJUSTMENT']),
  description: z.string().trim().min(2).max(200),
  quantity: z.coerce.number().positive().max(10_000).default(1),
  unitPrice: z.coerce.number().min(-1_000_000_000).max(1_000_000_000),
  department: z.enum(DEPARTMENT_GROUPS).default('OTHER_OPERATED'),
  taxRateCode: z.string().trim().max(20).default('VAT8'),
  serviceChargePct: z.coerce.number().min(0).max(30).optional(),
  glAccountCode: z.string().trim().max(20).optional(),
  businessDate: isoDateSchema.optional(),
  sourceType: optionalText(40),
  sourceId: z.string().max(64).optional(),
});

export const folioPaymentSchema = z.object({
  amount: z.coerce.number().positive().max(10_000_000_000),
  method: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'VIETQR', 'VNPAY', 'MOMO', 'ZALO_PAY', 'STRIPE', 'COMPANY_AR']),
  reference: optionalText(120),
  businessDate: isoDateSchema.optional(),
  cashSessionId: z.string().optional(),
});

export const voidFolioItemSchema = z.object({
  reason: z.string().trim().min(5, 'Vui lòng nhập lý do huỷ').max(300),
});

export const refundSchema = z.object({
  amount: z.coerce.number().positive(),
  reason: z.string().trim().min(5).max(300),
});
