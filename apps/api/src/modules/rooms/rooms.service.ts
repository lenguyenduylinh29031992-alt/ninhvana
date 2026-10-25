import { Injectable } from '@nestjs/common';
import type { RoomStatus } from '@prisma/client';
import { ERROR_CODES, AppError, parseIsoDate } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { PrismaService } from '../../common/prisma/prisma.module';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async roomTypes(actor: AuthUser, propertyId: string) {
    assertPropertyAccess(actor, propertyId);
    return this.prisma.roomType.findMany({
      where: { propertyId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        baseRate: true,
        maxOccupancy: true,
        maxAdults: true,
        maxChildren: true,
      },
    });
  }

  async tapeChart(actor: AuthUser, propertyId: string, from: string, to: string) {
    assertPropertyAccess(actor, propertyId);
    const [rooms, bookings] = await Promise.all([
      this.prisma.room.findMany({
        where: { propertyId, isActive: true },
        include: { roomType: true, floor: true },
        orderBy: [{ floor: { sortOrder: 'asc' } }, { number: 'asc' }],
      }),
      this.prisma.reservationRoom.findMany({
        where: {
          reservation: { propertyId, status: { in: ['PENDING', 'CONFIRMED', 'IN_HOUSE'] } },
          status: { in: ['RESERVED', 'IN_HOUSE'] },
          checkIn: { lt: parseIsoDate(to) },
          checkOut: { gt: parseIsoDate(from) },
        },
        include: {
          reservation: { include: { primaryGuest: true, channel: true } },
          roomType: true,
        },
        orderBy: { checkIn: 'asc' },
      }),
    ]);

    return {
      propertyId,
      from,
      to,
      roomTypes: [...new Map(rooms.map((room) => [room.roomTypeId, room.roomType])).values()],
      rooms: rooms.map((room) => ({
        id: room.id,
        number: room.number,
        floor: room.floor?.name ?? null,
        floorId: room.floorId,
        status: room.status,
        roomType: { id: room.roomType.id, name: room.roomType.name, code: room.roomType.code },
        bookings: bookings
          .filter((booking) => booking.roomId === room.id)
          .map((booking) => ({
            id: booking.id,
            reservationId: booking.reservationId,
            code: booking.reservation.code,
            status: booking.status,
            checkIn: booking.checkIn.toISOString().slice(0, 10),
            checkOut: booking.checkOut.toISOString().slice(0, 10),
            guest: booking.reservation.primaryGuest.fullName,
            vipLevel: booking.reservation.primaryGuest.vipLevel,
            channel: booking.reservation.channel?.code ?? 'DIRECT',
            nights: booking.reservation.nights,
            total: Number(booking.totalAmount),
          })),
      })),
    };
  }

  async updateStatus(actor: AuthUser, roomId: string, status: RoomStatus, reason?: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy phòng', 404);
    assertPropertyAccess(actor, room.propertyId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.room.update({ where: { id: roomId }, data: { status } });
      await tx.roomStatusLog.create({
        data: {
          roomId,
          fromStatus: room.status,
          toStatus: status,
          byId: actor.id,
          note: reason ?? null,
        },
      });
      return result;
    });
    await this.audit.record({
      orgId: actor.orgId,
      propertyId: room.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'room.status_changed',
      entityType: 'Room',
      entityId: roomId,
      reason,
      before: { status: room.status },
      after: { status },
    });
    this.realtime.emitToProperty(room.propertyId, 'room.status_changed', { roomId, status });
    return { id: updated.id, status: updated.status };
  }
}
