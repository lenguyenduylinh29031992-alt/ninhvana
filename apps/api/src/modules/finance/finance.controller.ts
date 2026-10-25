import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@grand-suite/shared';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('pnl')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  pnl(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.finance.profitAndLoss(actor, propertyId, from, to);
  }

  @Get('balance-sheet')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  balanceSheet(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string, @Query('asOf') asOf: string) {
    return this.finance.balanceSheet(actor, propertyId, asOf);
  }

  @Get('cash-flow')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  cashFlow(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.finance.cashFlow(actor, propertyId, from, to);
  }

  @Get('ar-aging')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  ar(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string, @Query('asOf') asOf?: string) {
    return this.finance.arAging(actor, propertyId, asOf);
  }

  @Get('ap-aging')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  ap(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string, @Query('asOf') asOf?: string) {
    return this.finance.apAging(actor, propertyId, asOf);
  }
}
