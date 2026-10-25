import { z } from 'zod';
import { isoDateSchema, optionalText } from './common';

export const housekeepingUpdateSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'VERIFIED', 'BLOCKED']).optional(),
  checklist: z
    .array(z.object({ item: z.string().max(120), done: z.boolean() }))
    .max(60)
    .optional(),
  notes: optionalText(500),
  assignedToId: z.string().optional(),
});

export const createHousekeepingTaskSchema = z.object({
  propertyId: z.string().min(1),
  roomId: z.string().min(1),
  type: z.enum(['CLEAN', 'DEEP_CLEAN', 'TURNDOWN', 'INSPECTION', 'MAINTENANCE']).default('CLEAN'),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  notes: optionalText(500),
});

export const maintenanceTicketSchema = z.object({
  propertyId: z.string().min(1),
  roomId: z.string().optional(),
  location: optionalText(120),
  category: z.string().trim().min(2).max(60),
  description: z.string().trim().min(5).max(1000),
  priority: z.coerce.number().int().min(1).max(3).default(2),
});

export const nightAuditSchema = z.object({
  propertyId: z.string().min(1),
  businessDate: isoDateSchema,
  dryRun: z.boolean().default(false),
});

export const cashSessionOpenSchema = z.object({
  propertyId: z.string().min(1),
  openingFloat: z.coerce.number().min(0).default(0),
});

export const cashSessionCloseSchema = z.object({
  countedCash: z.coerce.number().min(0),
  notes: optionalText(300),
});

export const createInvoiceSchema = z.object({
  buyerName: optionalText(200),
  buyerTaxCode: z.string().trim().max(20).optional(),
  buyerAddress: optionalText(300),
  notes: optionalText(500),
  dueDate: isoDateSchema.optional(),
});

export const paymentIntentSchema = z.object({
  propertyId: z.string().min(1),
  folioId: z.string().optional(),
  amount: z.coerce.number().positive(),
  method: z.enum(['VIETQR', 'VNPAY', 'MOMO', 'ZALO_PAY', 'STRIPE']),
});

export const folioQuerySchema = z.object({
  propertyId: z.string().optional(),
  status: z.enum(['OPEN', 'SETTLED', 'VOID']).optional(),
  q: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const paymentQuerySchema = z.object({
  propertyId: z.string().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
