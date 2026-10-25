import { z } from 'zod';
import { isoDateSchema, optionalText } from './common';

export const channelPushSchema = z.object({
  propertyId: z.string().optional(),
  days: z.coerce.number().int().min(1).max(30).default(7),
  simulateFailure: z.boolean().default(false),
});

export const channelMappingSchema = z.object({
  roomTypeId: z.string().min(1),
  externalRoomTypeId: z.string().trim().min(1).max(80),
  externalRatePlanId: z.string().trim().max(80).optional(),
});

export const channelWebhookSchema = z.object({
  externalId: z.string().min(1).max(120),
  status: z.string().min(1).max(30),
  propertyCode: z.string().min(1),
  roomTypeCode: z.string().min(1),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  guest: z.object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    email: z.string().email().optional(),
    phone: z.string().max(20).optional(),
    nationality: z.string().max(2).optional(),
  }),
  adults: z.coerce.number().int().min(1).max(6).default(2),
  children: z.coerce.number().int().min(0).max(4).default(0),
  totalAmount: z.coerce.number().min(0).optional(),
  specialRequests: optionalText(500),
});

export const bookingAvailabilityQuerySchema = z
  .object({
    propertyCode: z.string().min(1),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    adults: z.coerce.number().int().min(1).max(6).default(2),
    children: z.coerce.number().int().min(0).max(4).default(0),
  })
  .refine((value) => value.checkOut > value.checkIn, { message: 'Ngày trả phòng phải sau ngày nhận phòng', path: ['checkOut'] });

export const publicBookingSchema = z
  .object({
    propertyCode: z.string().min(1),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    roomTypeId: z.string().min(1),
    adults: z.coerce.number().int().min(1).max(6).default(2),
    children: z.coerce.number().int().min(0).max(4).default(0),
    guest: z.object({
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80),
      email: z.string().trim().email().max(190),
      phone: z.string().trim().min(6).max(20),
      nationality: z.string().trim().max(2).optional(),
    }),
    specialRequests: optionalText(500),
  })
  .refine((value) => value.checkOut > value.checkIn, { message: 'Ngày trả phòng phải sau ngày nhận phòng', path: ['checkOut'] });

export const inboxQuerySchema = z.object({
  status: z.enum(['OPEN', 'PENDING', 'CLOSED']).optional(),
  channelCode: z.string().optional(),
  q: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export const inboxReplySchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const inboxUpdateSchema = z.object({
  status: z.enum(['OPEN', 'PENDING', 'CLOSED']).optional(),
  assignedToId: z.string().optional(),
  markRead: z.boolean().optional(),
});

export const channelJobTestSchema = z.object({
  fail: z.boolean().default(true),
});
