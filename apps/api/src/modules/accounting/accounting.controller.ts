import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, isoDateSchema } from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { AccountingService } from './accounting.service';

const rangeSchema = z.object({
  propertyId: z.string().min(1),
  from: isoDateSchema,
  to: isoDateSchema,
});
const balanceSchema = z.object({ propertyId: z.string().min(1), date: isoDateSchema });

@ApiTags('accounting')
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('revenue')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  revenue(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(rangeSchema)) query: z.infer<typeof rangeSchema>,
  ) {
    assertPropertyAccess(actor, query.propertyId);
    return this.accounting.revenueSummary(query.propertyId, query.from, query.to);
  }

  @Get('reconciliation')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  reconciliation(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(rangeSchema)) query: z.infer<typeof rangeSchema>,
  ) {
    assertPropertyAccess(actor, query.propertyId);
    return this.accounting.reconcile(query.propertyId, query.from, query.to);
  }

  @Get('trial-balance')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  trialBalance(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(balanceSchema)) query: z.infer<typeof balanceSchema>,
  ) {
    assertPropertyAccess(actor, query.propertyId);
    return this.accounting.trialBalance(query.propertyId, query.date);
  }

  @Get('journal')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  journal(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(rangeSchema)) query: z.infer<typeof rangeSchema>,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    assertPropertyAccess(actor, query.propertyId);
    return this.accounting.journal(
      query.propertyId,
      query.from,
      query.to,
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(pageSize) || 25)),
    );
  }
}
