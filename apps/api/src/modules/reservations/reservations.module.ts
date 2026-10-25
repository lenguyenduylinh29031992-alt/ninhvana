import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { FrontOfficeController, ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [AccountingModule, RealtimeModule],
  controllers: [ReservationsController, FrontOfficeController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
