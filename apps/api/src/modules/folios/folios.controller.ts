import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  folioChargeSchema,
  folioPaymentSchema,
  folioQuerySchema,
  voidFolioItemSchema,
  type folioChargeSchema as ChargeSchema,
  type folioPaymentSchema as PaymentSchema,
} from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { FoliosService } from './folios.service';

@ApiTags('folios')
@Controller('folios')
export class FoliosController {
  constructor(private readonly folios: FoliosService) {}

  @Get()
  @Permissions(PERMISSIONS.FOLIO_VIEW)
  list(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(folioQuerySchema)) query: z.infer<typeof folioQuerySchema>,
  ) {
    return this.folios.list(actor, query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.FOLIO_VIEW)
  detail(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.folios.detail(actor, id);
  }

  @Post(':id/charges')
  @Permissions(PERMISSIONS.FOLIO_POST)
  addCharge(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(folioChargeSchema)) body: z.infer<typeof ChargeSchema>,
  ) {
    return this.folios.addCharge(actor, id, body);
  }

  @Post(':id/payments')
  @Permissions(PERMISSIONS.FOLIO_SETTLE)
  addPayment(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(folioPaymentSchema)) body: z.infer<typeof PaymentSchema>,
  ) {
    return this.folios.addPayment(actor, id, body);
  }

  @Post('items/:itemId/void')
  @Permissions(PERMISSIONS.FOLIO_VOID)
  voidItem(
    @CurrentUser() actor: AuthUser,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(voidFolioItemSchema)) body: z.infer<typeof voidFolioItemSchema>,
  ) {
    return this.folios.voidItem(actor, itemId, body.reason);
  }
}
