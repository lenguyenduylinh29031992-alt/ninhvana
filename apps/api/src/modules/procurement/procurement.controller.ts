import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  expenseCreateSchema,
  purchaseApproveSchema,
  purchaseRequestSchema,
  stockIssueSchema,
  supplierInvoiceSchema,
  supplierPaymentSchema,
  supplierSchema,
} from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { ProcurementService } from './procurement.service';

@ApiTags('procurement')
@Controller('procurement')
export class ProcurementController {
  constructor(private readonly procurement: ProcurementService) {}

  @Get('suppliers') @Permissions(PERMISSIONS.PURCHASE_VIEW)
  suppliers(@CurrentUser() actor: AuthUser) { return this.procurement.listSuppliers(actor); }

  @Post('suppliers') @Permissions(PERMISSIONS.PURCHASE_CREATE)
  createSupplier(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(supplierSchema)) body: z.infer<typeof supplierSchema>) {
    return this.procurement.createSupplier(actor, body);
  }

  @Get('requests') @Permissions(PERMISSIONS.PURCHASE_VIEW)
  requests(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string) { return this.procurement.listRequests(actor, propertyId); }

  @Post('requests') @Permissions(PERMISSIONS.PURCHASE_CREATE)
  createRequest(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(purchaseRequestSchema)) body: z.infer<typeof purchaseRequestSchema>) {
    return this.procurement.createRequest(actor, body);
  }

  @Post('requests/:id/approve') @Permissions(PERMISSIONS.PURCHASE_APPROVE)
  approve(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(purchaseApproveSchema)) body: z.infer<typeof purchaseApproveSchema>) {
    return this.procurement.approveRequest(actor, id, body.supplierId);
  }

  @Get('orders') @Permissions(PERMISSIONS.PURCHASE_VIEW)
  orders(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string) { return this.procurement.listOrders(actor, propertyId); }

  @Post('orders/:id/receive') @Permissions(PERMISSIONS.PURCHASE_RECEIVE)
  receive(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.procurement.receive(actor, id); }

  @Get('invoices') @Permissions(PERMISSIONS.PURCHASE_VIEW)
  invoices(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string) { return this.procurement.listInvoices(actor, propertyId); }

  @Post('invoices') @Permissions(PERMISSIONS.PURCHASE_CREATE)
  createInvoice(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(supplierInvoiceSchema)) body: z.infer<typeof supplierInvoiceSchema>) {
    return this.procurement.createInvoice(actor, body);
  }

  @Post('invoices/:id/pay') @Permissions(PERMISSIONS.EXPENSE_PAY)
  pay(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(supplierPaymentSchema)) body: z.infer<typeof supplierPaymentSchema>) {
    return this.procurement.payInvoice(actor, id, body.method);
  }

  @Get('stock') @Permissions(PERMISSIONS.INVENTORY_VIEW)
  stock(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string) { return this.procurement.stock(actor, propertyId); }

  @Get('stock/movements') @Permissions(PERMISSIONS.INVENTORY_VIEW)
  movements(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string) { return this.procurement.movements(actor, propertyId); }

  @Post('stock/issue') @Permissions(PERMISSIONS.INVENTORY_MANAGE)
  issue(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(stockIssueSchema)) body: z.infer<typeof stockIssueSchema>) {
    return this.procurement.issueStock(actor, body);
  }
}

@ApiTags('costs')
@Controller('costs')
export class ExpenseController {
  constructor(private readonly procurement: ProcurementService) {}

  @Get('expenses') @Permissions(PERMISSIONS.EXPENSE_VIEW)
  list(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string, @Query('from') from?: string, @Query('to') to?: string) { return this.procurement.listExpenses(actor, propertyId, from, to); }

  @Post('expenses') @Permissions(PERMISSIONS.EXPENSE_CREATE)
  create(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(expenseCreateSchema)) body: z.infer<typeof expenseCreateSchema>) {
    return this.procurement.createExpense(actor, body);
  }
}
