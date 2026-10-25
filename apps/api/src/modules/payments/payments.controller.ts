import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  cashSessionCloseSchema,
  cashSessionOpenSchema,
  paymentIntentSchema,
  paymentQuerySchema,
  refundSchema,
} from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Permissions(PERMISSIONS.PAYMENT_MANAGE)
  list(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(paymentQuerySchema)) query: z.infer<typeof paymentQuerySchema>,
  ) {
    return this.payments.list(actor, query);
  }

  @Post(':id/refund')
  @Permissions(PERMISSIONS.PAYMENT_REFUND)
  refund(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(refundSchema)) body: z.infer<typeof refundSchema>,
  ) {
    return this.payments.refund(actor, id, body);
  }

  @Post('intents')
  @Permissions(PERMISSIONS.PAYMENT_MANAGE)
  intent(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(paymentIntentSchema)) body: z.infer<typeof paymentIntentSchema>,
  ) {
    return this.payments.createIntent(actor, body);
  }
}

@ApiTags('cash-sessions')
@Controller('cash-sessions')
export class CashSessionsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Permissions(PERMISSIONS.CASH_SESSION)
  list(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId?: string) {
    return this.payments.listCashSessions(actor, propertyId);
  }

  @Post()
  @Permissions(PERMISSIONS.CASH_SESSION)
  open(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(cashSessionOpenSchema)) body: z.infer<typeof cashSessionOpenSchema>,
  ) {
    return this.payments.openCashSession(actor, body);
  }

  @Post(':id/close')
  @Permissions(PERMISSIONS.CASH_SESSION)
  close(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cashSessionCloseSchema)) body: z.infer<typeof cashSessionCloseSchema>,
  ) {
    return this.payments.closeCashSession(actor, id, body);
  }
}
