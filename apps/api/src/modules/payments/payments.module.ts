import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CashSessionsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AccountingModule, RealtimeModule],
  controllers: [PaymentsController, CashSessionsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
