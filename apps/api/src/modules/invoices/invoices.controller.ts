import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, createInvoiceSchema, voidFolioItemSchema } from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @Permissions(PERMISSIONS.INVOICE_VIEW)
  list(
    @CurrentUser() actor: AuthUser,
    @Query('propertyId') propertyId?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('status') status?: string,
  ) {
    return this.invoices.list(actor, {
      propertyId,
      status,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 25)),
    });
  }

  @Post('folio/:folioId')
  @Permissions(PERMISSIONS.INVOICE_ISSUE)
  create(
    @CurrentUser() actor: AuthUser,
    @Param('folioId') folioId: string,
    @Body(new ZodValidationPipe(createInvoiceSchema)) body: z.infer<typeof createInvoiceSchema>,
  ) {
    return this.invoices.create(actor, folioId, body);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.INVOICE_VIEW)
  detail(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.invoices.detail(actor, id);
  }

  @Get(':id/print')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Permissions(PERMISSIONS.INVOICE_VIEW)
  print(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.invoices.html(actor, id);
  }

  @Post(':id/void')
  @Permissions(PERMISSIONS.INVOICE_VOID)
  void(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(voidFolioItemSchema)) body: z.infer<typeof voidFolioItemSchema>,
  ) {
    return this.invoices.void(actor, id, body.reason);
  }
}
