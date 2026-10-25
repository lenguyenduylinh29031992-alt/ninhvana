import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  bookingAvailabilityQuerySchema,
  publicBookingSchema,
} from '@grand-suite/shared';
import { z } from 'zod';
import { Public } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { BookingService } from './booking.service';

@ApiTags('booking-engine')
@Public()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('public/booking')
export class BookingController {
  constructor(private readonly booking: BookingService) {}

  @Get('properties')
  properties() {
    return this.booking.properties();
  }

  @Get('availability')
  availability(
    @Query(new ZodValidationPipe(bookingAvailabilityQuerySchema))
    query: z.infer<typeof bookingAvailabilityQuerySchema>,
  ) {
    return this.booking.availability(query);
  }

  @Post('reservations')
  create(@Body(new ZodValidationPipe(publicBookingSchema)) body: z.infer<typeof publicBookingSchema>) {
    return this.booking.create(body);
  }
}
