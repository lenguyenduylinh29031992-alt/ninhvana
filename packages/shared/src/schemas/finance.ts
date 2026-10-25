import { z } from 'zod';
import { isoDateSchema, optionalText } from './common';

export const supplierSchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(200),
  taxCode: z.string().trim().max(20).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  category: z.string().max(40).optional(),
  termsDays: z.coerce.number().int().min(0).max(180).optional(),
});

export const purchaseRequestSchema = z.object({
  propertyId: z.string().min(1),
  department: z.string().min(1).max(40),
  neededBy: isoDateSchema.optional(),
  notes: optionalText(500),
  lines: z.array(z.object({
    itemId: z.string().optional(),
    description: z.string().trim().min(1).max(200),
    quantity: z.coerce.number().positive(),
    unitCost: z.coerce.number().nonnegative(),
  })).min(1).max(50),
});

export const purchaseApproveSchema = z.object({ supplierId: z.string().min(1) });
export const purchaseReceiveSchema = z.object({ notes: optionalText(500) });

export const supplierInvoiceSchema = z.object({
  propertyId: z.string().min(1),
  supplierId: z.string().min(1),
  number: z.string().trim().min(1).max(50),
  invoiceDate: isoDateSchema,
  dueDate: isoDateSchema,
  subtotal: z.coerce.number().nonnegative(),
  vatAmount: z.coerce.number().nonnegative().default(0),
  accountCode: z.string().min(3).max(10),
  description: z.string().trim().min(1).max(200),
});

export const supplierPaymentSchema = z.object({ method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD']).default('BANK_TRANSFER') });

export const stockIssueSchema = z.object({
  propertyId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  accountCode: z.string().min(3).max(10),
  department: z.string().min(1).max(40),
  notes: optionalText(300),
});

export const expenseCreateSchema = z.object({
  propertyId: z.string().min(1),
  accountCode: z.string().min(3).max(10),
  department: z.string().min(1).max(40),
  description: z.string().trim().min(1).max(300),
  amount: z.coerce.number().positive(),
  vatAmount: z.coerce.number().nonnegative().default(0),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER']).default('BANK_TRANSFER'),
});

export const employeeSchema = z.object({
  propertyId: z.string().optional(),
  code: z.string().trim().min(1).max(30),
  fullName: z.string().trim().min(1).max(120),
  position: z.string().trim().min(1).max(80),
  department: z.string().trim().min(1).max(40),
  hireDate: isoDateSchema,
  baseSalary: z.coerce.number().nonnegative(),
  allowances: z.coerce.number().nonnegative().default(0),
  dependents: z.coerce.number().int().min(0).max(10).default(0),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
});

export const attendanceSchema = z.object({
  date: isoDateSchema,
  records: z.array(z.object({
    employeeId: z.string().min(1),
    hours: z.coerce.number().min(0).max(24),
    overtimeHours: z.coerce.number().min(0).max(12).default(0),
    status: z.string().max(20).optional(),
    notes: optionalText(200),
  })).min(1).max(500),
});

export const payrollRunSchema = z.object({
  propertyId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/),
});
