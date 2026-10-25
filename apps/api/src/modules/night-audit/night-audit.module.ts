import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { NightAuditController } from './night-audit.controller';
import { NightAuditService } from './night-audit.service';

@Module({
  imports: [AccountingModule, ReservationsModule, RealtimeModule],
  controllers: [NightAuditController],
  providers: [NightAuditService],
  exports: [NightAuditService],
})
export class NightAuditModule {}
