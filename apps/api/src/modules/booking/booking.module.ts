import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

@Module({
  imports: [ReservationsModule],
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
