import { Injectable } from '@nestjs/common';
import { ERROR_CODES, AppError } from '@grand-suite/shared';
import type { z } from 'zod';
import type { bookingAvailabilityQuerySchema, publicBookingSchema } from '@grand-suite/shared';
import { PrismaService } from '../../common/prisma/prisma.module';
import { buildSystemActor } from '../../common/auth/system-actor';
import { ReservationsService } from '../reservations/reservations.service';

type AvailabilityQuery = z.infer<typeof bookingAvailabilityQuerySchema>;
type BookingInput = z.infer<typeof publicBookingSchema>;

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
  ) {}

  async properties() {
    const properties = await this.prisma.property.findMany({
      where: { isActive: true, type: 'HOTEL' },
      include: { roomTypes: { where: { isActive: true }, select: { id: true, name: true, maxOccupancy: true } } },
      orderBy: { starRating: 'desc' },
    });
    return properties.map((property) => ({
      code: property.code,
      name: property.name,
      city: property.city,
      country: property.country,
      starRating: property.starRating,
      address: property.address,
      currency: property.currency,
      imageUrl: null,
      roomTypes: property.roomTypes.map((roomType) => roomType.name),
    }));
  }

  async availability(query: AvailabilityQuery) {
    const property = await this.propertyOrThrow(query.propertyCode);
    const actor = await buildSystemActor(this.prisma, property.orgId);
    const rooms = await this.reservations.availability(actor, {
      propertyId: property.id,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      adults: query.adults,
      children: query.children,
    });
    return {
      property: {
        code: property.code,
        name: property.name,
        city: property.city,
        starRating: property.starRating,
        currency: property.currency,
      },
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      nights: rooms[0]?.nights.length ?? 0,
      rooms: rooms.filter((room) => room.available > 0),
    };
  }

  async create(input: BookingInput) {
    const property = await this.propertyOrThrow(input.propertyCode);
    const roomType = await this.prisma.roomType.findFirst({
      where: { id: input.roomTypeId, propertyId: property.id, isActive: true },
    });
    if (!roomType) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy hạng phòng', 404);
    const actor = await buildSystemActor(this.prisma, property.orgId, 'Grand Suite · Website');
    const reservation = await this.reservations.create(actor, {
      propertyId: property.id,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      channelCode: 'DIRECT',
      guest: input.guest,
      rooms: [{ roomTypeId: roomType.id, adults: input.adults, children: input.children }],
      source: 'BOOKING_ENGINE',
      specialRequests: input.specialRequests,
    });
    return {
      code: reservation.code,
      reservationId: reservation.id,
      status: reservation.status,
      property: { name: property.name, city: property.city, address: property.address },
      roomType: roomType.name,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guest: reservation.guest.fullName,
      totals: reservation.totals,
      payment: { mode: 'PAY_AT_HOTEL', note: 'Thanh toán tại khách sạn khi nhận phòng' },
    };
  }

  private async propertyOrThrow(code: string) {
    const property = await this.prisma.property.findFirst({
      where: { code, isActive: true, type: 'HOTEL' },
    });
    if (!property) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy khách sạn', 404);
    return property;
  }
}
