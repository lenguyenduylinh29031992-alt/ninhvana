import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { FinanceModule } from '../finance/finance.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({ imports: [AccountingModule, FinanceModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
