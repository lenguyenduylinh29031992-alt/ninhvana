import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ExpenseController, ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

@Module({
  imports: [AccountingModule],
  controllers: [ProcurementController, ExpenseController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
