import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  availabilityQuerySchema,
  cancelReservationSchema,
  checkInSchema,
  checkOutSchema,
  createReservationSchema,
  moveReservationRoomSchema,
  reservationQuerySchema,
  type CreateReservationInput,
} from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { ReservationsService } from './reservations.service';

@ApiTags('reservations')
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get('availability')
  @Permissions(PERMISSIONS.RESERVATION_VIEW)
  availability(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(availabilityQuerySchema))
    query: z.infer<typeof availabilityQuerySchema>,
  ) {
    return this.reservations.availability(actor, query);
  }

  @Get()
  @Permissions(PERMISSIONS.RESERVATION_VIEW)
  list(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(reservationQuerySchema))
    query: z.infer<typeof reservationQuerySchema>,
  ) {
    return this.reservations.list(actor, query);
  }

  @Post()
  @Permissions(PERMISSIONS.RESERVATION_CREATE)
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createReservationSchema)) body: CreateReservationInput,
  ) {
    return this.reservations.create(actor, body);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.RESERVATION_VIEW)
  detail(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.reservations.detail(actor, id);
  }

  @Post(':id/cancel')
  @Permissions(PERMISSIONS.RESERVATION_CANCEL)
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelReservationSchema)) body: z.infer<typeof cancelReservationSchema>,
  ) {
    return this.reservations.cancel(actor, id, body);
  }

  @Post(':id/check-in')
  @Permissions(PERMISSIONS.RESERVATION_UPDATE)
  checkIn(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(checkInSchema)) body: z.infer<typeof checkInSchema>,
  ) {
    return this.reservations.checkIn(actor, id, body.notes);
  }

  @Post(':id/check-out')
  @Permissions(PERMISSIONS.RESERVATION_UPDATE)
  checkOut(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(checkOutSchema)) body: z.infer<typeof checkOutSchema>,
  ) {
    return this.reservations.checkOut(actor, id, body.notes);
  }

  @Patch('rooms/:roomId/move')
  @Permissions(PERMISSIONS.RESERVATION_UPDATE)
  move(
    @CurrentUser() actor: AuthUser,
    @Param('roomId') roomId: string,
    @Body(new ZodValidationPipe(moveReservationRoomSchema)) body: z.infer<typeof moveReservationRoomSchema>,
  ) {
    return this.reservations.moveRoom(actor, roomId, body);
  }
}

@ApiTags('front-office')
@Controller('front-office')
export class FrontOfficeController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get('board')
  @Permissions(PERMISSIONS.RESERVATION_VIEW)
  board(
    @CurrentUser() actor: AuthUser,
    @Query('propertyId') propertyId?: string,
    @Query('date') date?: string,
  ) {
    return this.reservations.board(actor, propertyId, date);
  }
}
