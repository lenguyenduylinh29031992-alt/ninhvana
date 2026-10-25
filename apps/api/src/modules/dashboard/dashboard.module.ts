import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { AccountingModule } from '../accounting/accounting.module';
import { FinanceModule } from '../finance/finance.module';
import { PropertiesModule } from '../properties/properties.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ConsolidatedService } from './consolidated.service';

@Module({
  imports: [PropertiesModule, HealthModule, AccountingModule, FinanceModule],
  controllers: [DashboardController],
  providers: [DashboardService, ConsolidatedService],
})
export class DashboardModule {}
