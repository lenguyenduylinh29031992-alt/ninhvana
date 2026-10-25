import { Injectable } from '@nestjs/common';
import {
  FolioItemType,
  HousekeepingStatus,
  HousekeepingType,
  JournalSource,
  Prisma,
  ReservationRoomStatus,
  ReservationStatus,
  type FolioItem,
  type Property,
  type Reservation,
} from '@prisma/client';
import {
  ERROR_CODES,
  AppError,
  businessDateOf,
  commissionFor,
  moneyToJson,
  parseIsoDate,
  priceStay,
  stayNights,
  type TaxRuleSet,
} from '@grand-suite/shared';
import type {
  CreateReservationInput,
  availabilityQuerySchema,
  cancelReservationSchema,
  moveReservationRoomSchema,
  reservationQuerySchema,
} from '@grand-suite/shared';
import type { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { LockService } from '../../common/locks/lock.module';
import { PrismaService } from '../../common/prisma/prisma.module';
import { SequenceService } from '../../common/sequence/sequence.module';
import { PostingService } from '../accounting/posting.service';
import { RealtimeService } from '../realtime/realtime.service';

type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
type ReservationQuery = z.infer<typeof reservationQuerySchema>;
type CancelInput = z.infer<typeof cancelReservationSchema>;
type MoveInput = z.infer<typeof moveReservationRoomSchema>;

const ACTIVE_ROOM_STATUSES: ReservationRoomStatus[] = ['RESERVED', 'IN_HOUSE'];

interface PricedRoomPlan {
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  roomId: string;
  roomNumber: string;
  ratePlanId: string;
  adults: number;
  children: number;
  nights: Array<{ date: string; rate: Prisma.Decimal; serviceCharge: Prisma.Decimal; vat: Prisma.Decimal; total: Prisma.Decimal }>;
  net: Prisma.Decimal;
  serviceCharge: Prisma.Decimal;
  vat: Prisma.Decimal;
  total: Prisma.Decimal;
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: LockService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  // ───────────────────────────── availability ─────────────────────────────

  async availability(actor: AuthUser, query: AvailabilityQuery) {
    assertPropertyAccess(actor, query.propertyId);
    const property = await this.property(query.propertyId);
    const nights = stayNights(query.checkIn, query.checkOut);
    if (nights.length === 0) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Khoảng lưu trú không hợp lệ', 422);

    const roomTypes = await this.prisma.roomType.findMany({
      where: { propertyId: property.id, isActive: true },
      include: { rooms: { where: { isActive: true }, select: { status: true } } },
      orderBy: { sortOrder: 'asc' },
    });

    const bookings = await this.prisma.reservationRoom.findMany({
      where: {
        reservation: {
          propertyId: property.id,
          status: { in: ['PENDING', 'CONFIRMED', 'IN_HOUSE'] },
        },
        status: { in: ACTIVE_ROOM_STATUSES },
        checkIn: { lt: parseIsoDate(query.checkOut) },
        checkOut: { gt: parseIsoDate(query.checkIn) },
      },
      select: { roomTypeId: true, checkIn: true, checkOut: true },
    });

    const { rules } = await this.taxRules(property);
    const plan = await this.resolveRatePlan(property.id, query.ratePlanId);
    const rateRows = plan
      ? await this.prisma.ratePlanRate.findMany({
          where: {
            ratePlanId: plan.id,
            roomTypeId: { in: roomTypes.map((type) => type.id) },
            date: { gte: parseIsoDate(query.checkIn), lt: parseIsoDate(query.checkOut) },
          },
        })
      : [];
    const rateMap = new Map(rateRows.map((rate) => [`${rate.roomTypeId}|${rate.date.toISOString().slice(0, 10)}`, rate.amount]));

    return roomTypes.map((roomType) => {
      const physical = roomType.rooms.filter(
        (room) => room.status !== 'OUT_OF_ORDER' && room.status !== 'OUT_OF_SERVICE',
      ).length;

      let minAvailable = physical;
      for (const date of nights) {
        const occupied = bookings.filter(
          (booking) =>
            booking.roomTypeId === roomType.id &&
            booking.checkIn.toISOString().slice(0, 10) <= date &&
            booking.checkOut.toISOString().slice(0, 10) > date,
        ).length;
        minAvailable = Math.min(minAvailable, Math.max(0, physical - occupied));
      }

      const priced = priceStay(
        nights.map((date) => ({
          date,
          rate: rateMap.get(`${roomType.id}|${date}`) ?? roomType.baseRate,
        })),
        rules,
      );

      return {
        roomTypeId: roomType.id,
        code: roomType.code,
        name: roomType.name,
        description: roomType.description,
        maxAdults: roomType.maxAdults,
        maxChildren: roomType.maxChildren,
        maxOccupancy: roomType.maxOccupancy,
        sizeSqm: roomType.sizeSqm,
        bedType: roomType.bedType,
        roomCount: physical,
        available: Math.max(0, minAvailable),
        ratePlanId: plan?.id ?? null,
        ratePlanName: plan?.name ?? null,
        averageNightly: moneyToJson(priced.averageNightlyRate),
        net: moneyToJson(priced.net),
        serviceCharge: moneyToJson(priced.serviceCharge),
        vat: moneyToJson(priced.vat),
        total: moneyToJson(priced.total),
        currency: property.currency,
        nights: priced.nights.map((night) => ({
          date: night.date,
          rate: moneyToJson(night.rate),
          total: moneyToJson(night.total),
        })),
      };
    });
  }

  // ───────────────────────────── create ─────────────────────────────

  async create(actor: AuthUser, input: CreateReservationInput) {
    assertPropertyAccess(actor, input.propertyId);
    const property = await this.property(input.propertyId);
    const nights = stayNights(input.checkIn, input.checkOut);
    if (nights.length === 0) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Ngày trả phòng phải sau ngày nhận phòng', 422);
    }

    const { rules } = await this.taxRules(property);
    const channel = input.channelCode
      ? await this.prisma.channel.findFirst({ where: { orgId: property.orgId, code: input.channelCode } })
      : await this.prisma.channel.findFirst({ where: { orgId: property.orgId, code: 'DIRECT' } });

    if (input.companyId) {
      const company = await this.prisma.company.findFirst({
        where: { id: input.companyId, orgId: property.orgId },
      });
      if (!company) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy công ty', 404);
    }

    const lockKeys: string[] = [];
    for (const room of input.rooms) {
      for (const date of nights) {
        lockKeys.push(`avail:${property.id}:${room.roomTypeId}:${date}`);
      }
    }

    return this.locks.withLocks(lockKeys, async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const reservationId = await this.prisma.$transaction(
            async (tx) => {
              await this.locks.advisoryLocks(tx, lockKeys);

              const guest = await this.resolveGuest(tx, property, input);
              const plans: PricedRoomPlan[] = [];
              const usedRoomIds: string[] = [];

              for (const roomInput of input.rooms) {
                const roomType = await tx.roomType.findFirst({
                  where: { id: roomInput.roomTypeId, propertyId: property.id, isActive: true },
                });
                if (!roomType) {
                  throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Hạng phòng không hợp lệ', 422);
                }
                const plan = await this.resolveRatePlanTx(tx, property.id, roomInput.ratePlanId ?? input.ratePlanId);
                if (!plan) {
                  throw new AppError(ERROR_CODES.INVALID_STATE, 'Cơ sở chưa cấu hình gói giá', 409);
                }

                const rates = await tx.ratePlanRate.findMany({
                  where: {
                    ratePlanId: plan.id,
                    roomTypeId: roomType.id,
                    date: { gte: parseIsoDate(input.checkIn), lt: parseIsoDate(input.checkOut) },
                  },
                });
                const rateMap = new Map(rates.map((rate) => [rate.date.toISOString().slice(0, 10), rate.amount]));
                const pricing = priceStay(
                  nights.map((date) => ({ date, rate: rateMap.get(date) ?? roomType.baseRate })),
                  rules,
                );

                const candidates = await tx.room.findMany({
                  where: {
                    propertyId: property.id,
                    roomTypeId: roomType.id,
                    isActive: true,
                    status: { notIn: ['OUT_OF_ORDER', 'OUT_OF_SERVICE'] },
                    id: { notIn: usedRoomIds },
                    NOT: {
                      reservationRooms: {
                        some: {
                          status: { in: ACTIVE_ROOM_STATUSES },
                          checkIn: { lt: parseIsoDate(input.checkOut) },
                          checkOut: { gt: parseIsoDate(input.checkIn) },
                        },
                      },
                    },
                  },
                  orderBy: { number: 'asc' },
                  take: 1,
                });
                const room = candidates[0];
                if (!room) {
                  throw new AppError(
                    ERROR_CODES.OVERBOOKING,
                    `Hết phòng ${roomType.name} cho khoảng ${input.checkIn} → ${input.checkOut}`,
                    409,
                    { roomTypeId: roomType.id },
                  );
                }
                usedRoomIds.push(room.id);

                plans.push({
                  roomTypeId: roomType.id,
                  roomTypeCode: roomType.code,
                  roomTypeName: roomType.name,
                  roomId: room.id,
                  roomNumber: room.number,
                  ratePlanId: plan.id,
                  adults: roomInput.adults,
                  children: roomInput.children,
                  nights: pricing.nights.map((night) => ({
                    date: night.date,
                    rate: night.rate,
                    serviceCharge: night.serviceCharge,
                    vat: night.vat,
                    total: night.total,
                  })),
                  net: pricing.net,
                  serviceCharge: pricing.serviceCharge,
                  vat: pricing.vat,
                  total: pricing.total,
                });
              }

              const totalNet = plans.reduce((acc, plan) => acc.plus(plan.net), new Prisma.Decimal(0));
              const totalServiceCharge = plans.reduce(
                (acc, plan) => acc.plus(plan.serviceCharge),
                new Prisma.Decimal(0),
              );
              const totalTax = plans.reduce((acc, plan) => acc.plus(plan.vat), new Prisma.Decimal(0));
              const totalAmount = plans.reduce((acc, plan) => acc.plus(plan.total), new Prisma.Decimal(0));
              const commissionAmount =
                channel && channel.commissionPct.gt(0)
                  ? commissionFor(totalAmount, channel.commissionPct)
                  : new Prisma.Decimal(0);

              const code = await this.sequence.next(tx, property.id, 'RESERVATION');
              const reservation = await tx.reservation.create({
                data: {
                  propertyId: property.id,
                  code,
                  status: ReservationStatus.CONFIRMED,
                  channelId: channel?.id ?? null,
                  companyId: input.companyId ?? null,
                  primaryGuestId: guest.id,
                  ratePlanId: plans[0]?.ratePlanId ?? null,
                  checkIn: parseIsoDate(input.checkIn),
                  checkOut: parseIsoDate(input.checkOut),
                  nights: nights.length,
                  adults: plans.reduce((acc, plan) => acc + plan.adults, 0),
                  children: plans.reduce((acc, plan) => acc + plan.children, 0),
                  roomsCount: plans.length,
                  totalNet,
                  totalServiceCharge,
                  totalTax,
                  totalAmount,
                  commissionAmount,
                  depositAmount: input.depositAmount ?? 0,
                  balance: totalAmount,
                  specialRequests: input.specialRequests,
                  notes: input.notes,
                  source: input.source,
                  createdById: actor.id,
                  rooms: {
                    create: plans.map((plan) => ({
                      roomTypeId: plan.roomTypeId,
                      roomId: plan.roomId,
                      guestId: guest.id,
                      checkIn: parseIsoDate(input.checkIn),
                      checkOut: parseIsoDate(input.checkOut),
                      adults: plan.adults,
                      children: plan.children,
                      status: ReservationRoomStatus.RESERVED,
                      nightlyRate: plan.nights[0]?.rate ?? 0,
                      totalNet: plan.net,
                      totalServiceCharge: plan.serviceCharge,
                      totalTax: plan.vat,
                      totalAmount: plan.total,
                      nights: {
                        create: plan.nights.map((night) => ({
                          businessDate: parseIsoDate(night.date),
                          rate: night.rate,
                          serviceCharge: night.serviceCharge,
                          taxAmount: night.vat,
                          total: night.total,
                        })),
                      },
                    })),
                  },
                },
              });

              const folio = await tx.folio.create({
                data: {
                  propertyId: property.id,
                  number: await this.sequence.next(tx, property.id, 'FOLIO'),
                  reservationId: reservation.id,
                  guestId: guest.id,
                  companyId: input.companyId ?? null,
                  currency: property.currency,
                  balance: 0,
                },
              });
              await tx.reservationRoom.updateMany({
                where: { reservationId: reservation.id },
                data: { folioId: folio.id },
              });

              return reservation.id;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000, maxWait: 10_000 },
          );

          const detail = await this.detail(actor, reservationId, { skipAccessCheck: true });
          await this.audit.record({
            orgId: actor.orgId,
            propertyId: property.id,
            actorId: actor.id,
            actorName: actor.fullName,
            actorRole: actor.roles[0]?.roleCode,
            action: 'reservation.created',
            entityType: 'Reservation',
            entityId: reservationId,
            after: {
              code: detail.code,
              checkIn: detail.checkIn,
              checkOut: detail.checkOut,
              rooms: detail.rooms.map((room) => room.roomNumber),
              channel: detail.channel?.code ?? 'DIRECT',
              total: detail.totals.total,
            },
          });
          this.realtime.emitToProperty(property.id, 'reservation.created', {
            id: reservationId,
            code: detail.code,
            guest: detail.guest.fullName,
            checkIn: detail.checkIn,
          });
          return detail;
        } catch (error) {
          if (this.isRoomOverlap(error) || (error instanceof AppError && error.code === ERROR_CODES.OVERBOOKING)) {
            if (error instanceof AppError) throw error;
            throw new AppError(
              ERROR_CODES.OVERBOOKING,
              'Phòng vừa được đặt bởi giao dịch khác. Vui lòng chọn phòng/khoảng ngày khác.',
              409,
            );
          }
          if (this.isRetryable(error) && attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 40 * attempt));
            continue;
          }
          throw error;
        }
      }
      throw new AppError(ERROR_CODES.CONFLICT, 'Không thể tạo đặt phòng, vui lòng thử lại', 409);
    });
  }

  // ───────────────────────────── read ─────────────────────────────

  async list(actor: AuthUser, query: ReservationQuery) {
    const accessible = actor.orgWide
      ? undefined
      : actor.roles.map((role) => role.propertyId).filter((id): id is string => Boolean(id));

    const where: Prisma.ReservationWhereInput = {
      property: actor.orgWide ? undefined : { id: { in: accessible ?? [] } },
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.from ? { checkOut: { gt: parseIsoDate(query.from) } } : {}),
      ...(query.to ? { checkIn: { lt: parseIsoDate(query.to) } } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { primaryGuest: { fullName: { contains: query.q, mode: 'insensitive' } } },
              { primaryGuest: { email: { contains: query.q, mode: 'insensitive' } } },
              { primaryGuest: { phone: { contains: query.q } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.reservation.findMany({
        where,
        include: {
          primaryGuest: true,
          channel: true,
          rooms: { include: { room: true, roomType: true } },
          folios: { include: { items: { where: { isVoid: false } } } },
        },
        orderBy: [{ checkIn: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return {
      items: items.map((reservation) => this.mapSummary(reservation)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async detail(actor: AuthUser, id: string, options: { skipAccessCheck?: boolean } = {}) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        property: true,
        primaryGuest: { include: { documents: true, preferences: true } },
        channel: true,
        company: true,
        ratePlan: true,
        rooms: { include: { room: true, roomType: true, nights: { orderBy: { businessDate: 'asc' } } } },
        folios: {
          include: {
            items: { orderBy: { createdAt: 'asc' } },
            payments: { orderBy: { paidAt: 'desc' } },
          },
        },
      },
    });
    if (!reservation) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy đặt phòng', 404);
    if (!options.skipAccessCheck) assertPropertyAccess(actor, reservation.propertyId);
    return this.mapDetail(reservation);
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  async checkIn(actor: AuthUser, id: string, notes?: string) {
    const reservation = await this.loadForMutation(actor, id);
    if (!['PENDING', 'CONFIRMED'].includes(reservation.status)) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Đặt phòng không ở trạng thái có thể nhận phòng', 409);
    }
    await this.prisma.$transaction([
      this.prisma.reservation.update({
        where: { id },
        data: { status: 'IN_HOUSE', checkedInAt: new Date(), notes: notes ?? reservation.notes },
      }),
      this.prisma.reservationRoom.updateMany({
        where: { reservationId: id, status: 'RESERVED' },
        data: { status: 'IN_HOUSE' },
      }),
    ]);
    await this.audit.record({
      orgId: actor.orgId,
      propertyId: reservation.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'reservation.checked_in',
      entityType: 'Reservation',
      entityId: id,
      after: { code: reservation.code, rooms: reservation.rooms.length },
    });
    this.realtime.emitToProperty(reservation.propertyId, 'reservation.checked_in', {
      id,
      code: reservation.code,
    });
    return this.detail(actor, id, { skipAccessCheck: true });
  }

  async checkOut(actor: AuthUser, id: string, notes?: string) {
    const reservation = await this.loadForMutation(actor, id);
    if (reservation.status !== 'IN_HOUSE') {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Đặt phòng chưa ở trạng thái lưu trú', 409);
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        const charged = await this.postStayCharges(tx, reservation, actor.id, JournalSource.CHECKOUT);
        await tx.reservation.update({
          where: { id },
          data: {
            status: 'CHECKED_OUT',
            checkedOutAt: new Date(),
            notes: notes ?? reservation.notes,
          },
        });
        await tx.reservationRoom.updateMany({
          where: { reservationId: id, status: 'IN_HOUSE' },
          data: { status: 'CHECKED_OUT' },
        });

        for (const room of reservation.rooms) {
          if (!room.roomId) continue;
          await tx.room.update({
            where: { id: room.roomId },
            data: { status: 'DIRTY' },
          });
          const existing = await tx.housekeepingTask.findFirst({
            where: { roomId: room.roomId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
          });
          if (!existing) {
            await tx.housekeepingTask.create({
              data: {
                propertyId: reservation.propertyId,
                roomId: room.roomId,
                type: HousekeepingType.CLEAN,
                status: HousekeepingStatus.PENDING,
                priority: 1,
                checklist: [
                  { item: 'Đổ rác & thay túi', done: false },
                  { item: 'Thay ga trải giường', done: false },
                  { item: 'Vệ sinh phòng tắm', done: false },
                  { item: 'Bổ sung minibar', done: false },
                  { item: 'Hút bụi & lau sàn', done: false },
                ],
              },
            });
          }
        }

        const balance = await this.recomputeFolioBalance(tx, reservation.folios[0]?.id ?? '');
        await tx.reservation.update({
          where: { id },
          data: { balance },
        });
        await tx.guest.update({
          where: { id: reservation.primaryGuestId },
          data: {
            totalStays: { increment: 1 },
            totalNights: { increment: reservation.nights },
            lastStayAt: new Date(),
          },
        });
        return { balance, charged };
      },
      { timeout: 20_000 },
    );

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: reservation.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'reservation.checked_out',
      entityType: 'Reservation',
      entityId: id,
      after: { code: reservation.code, balance: moneyToJson(result.balance) },
    });
    this.realtime.emitToProperty(reservation.propertyId, 'reservation.checked_out', { id });

    return { ...(await this.detail(actor, id, { skipAccessCheck: true })), checkoutBalance: moneyToJson(result.balance) };
  }

  async cancel(actor: AuthUser, id: string, input: CancelInput) {
    const reservation = await this.loadForMutation(actor, id);
    if (!['PENDING', 'CONFIRMED'].includes(reservation.status)) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Chỉ có thể huỷ đặt phòng chưa nhận phòng', 409);
    }
    await this.prisma.$transaction([
      this.prisma.reservation.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: actor.id,
          cancellationReason: input.reason,
          balance: 0,
        },
      }),
      this.prisma.reservationRoom.updateMany({
        where: { reservationId: id },
        data: { status: 'CANCELLED' },
      }),
    ]);
    await this.audit.record({
      orgId: actor.orgId,
      propertyId: reservation.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'reservation.cancelled',
      entityType: 'Reservation',
      entityId: id,
      reason: input.reason,
      after: { code: reservation.code, waiveFee: input.waiveFee },
    });
    this.realtime.emitToProperty(reservation.propertyId, 'reservation.cancelled', { id });
    return this.detail(actor, id, { skipAccessCheck: true });
  }

  async moveRoom(actor: AuthUser, reservationRoomId: string, input: MoveInput) {
    const room = await this.prisma.reservationRoom.findUnique({
      where: { id: reservationRoomId },
      include: { reservation: true, roomType: true },
    });
    if (!room) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy phòng của đặt phòng', 404);
    assertPropertyAccess(actor, room.reservation.propertyId);
    if (!['RESERVED', 'IN_HOUSE'].includes(room.status)) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Không thể đổi phòng ở trạng thái này', 409);
    }
    if (input.checkIn !== room.checkIn.toISOString().slice(0, 10) || input.checkOut !== room.checkOut.toISOString().slice(0, 10)) {
      throw new AppError(
        ERROR_CODES.UNPROCESSABLE,
        'Đổi ngày lưu trú cần tạo yêu cầu điều chỉnh giá; hiện chỉ hỗ trợ đổi phòng cùng ngày.',
        422,
      );
    }
    const target = await this.prisma.room.findFirst({
      where: { id: input.roomId, propertyId: room.reservation.propertyId, isActive: true },
    });
    if (!target) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy phòng đích', 404);

    const keys = [`room-move:${target.id}:${input.checkIn}`];
    await this.locks.withLocks(keys, async () => {
      await this.prisma.$transaction(
        async (tx) => {
          await this.locks.advisoryLocks(tx, keys);
          const overlap = await tx.reservationRoom.findFirst({
            where: {
              roomId: target.id,
              status: { in: ACTIVE_ROOM_STATUSES },
              id: { not: room.id },
              checkIn: { lt: room.checkOut },
              checkOut: { gt: room.checkIn },
            },
          });
          if (overlap) {
            throw new AppError(ERROR_CODES.OVERBOOKING, 'Phòng đích đã có khách trong khoảng ngày này', 409);
          }
          await tx.reservationRoom.update({ where: { id: room.id }, data: { roomId: target.id } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: room.reservation.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'reservation.room_moved',
      entityType: 'ReservationRoom',
      entityId: room.id,
      before: { roomId: room.roomId },
      after: { roomId: target.id, roomNumber: target.number },
    });
    return this.detail(actor, room.reservationId, { skipAccessCheck: true });
  }

  // ───────────────────────────── front office board ─────────────────────────────

  async board(actor: AuthUser, propertyId: string | undefined, date?: string) {
    const property = propertyId
      ? await this.property(propertyId)
      : actor.orgWide
        ? await this.prisma.property.findFirst({ where: { orgId: actor.orgId, type: 'HOTEL', isActive: true } })
        : await this.prisma.property.findFirst({
            where: { id: { in: actor.roles.map((role) => role.propertyId).filter(Boolean) as string[] } },
          });
    if (!property) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy cơ sở', 404);
    assertPropertyAccess(actor, property.id);
    const businessDate =
      date ??
      businessDateOf(new Date(), { timeZone: property.timezone, cutoffHour: property.businessDayCutoff });

    const baseInclude = {
      primaryGuest: true,
      channel: true,
      rooms: { include: { room: true, roomType: true } },
    } as const;

    const [arrivals, inHouse, departures, rooms] = await Promise.all([
      this.prisma.reservation.findMany({
        where: {
          propertyId: property.id,
          status: { in: ['CONFIRMED', 'PENDING'] },
          checkIn: parseIsoDate(businessDate),
        },
        include: baseInclude,
        orderBy: { code: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: { propertyId: property.id, status: 'IN_HOUSE' },
        include: baseInclude,
        orderBy: { checkIn: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: { propertyId: property.id, status: 'IN_HOUSE', checkOut: parseIsoDate(businessDate) },
        include: baseInclude,
        orderBy: { code: 'asc' },
      }),
      this.prisma.room.findMany({
        where: { propertyId: property.id, isActive: true },
        select: { status: true },
      }),
    ]);

    return {
      propertyId: property.id,
      businessDate,
      counts: {
        arrivals: arrivals.length,
        inHouse: inHouse.reduce((acc, reservation) => acc + reservation.rooms.length, 0),
        departures: departures.length,
        dirtyRooms: rooms.filter((room) => room.status === 'DIRTY').length,
        availableRooms: rooms.filter((room) => room.status === 'CLEAN' || room.status === 'INSPECTED').length,
      },
      arrivals: arrivals.map((reservation) => this.mapSummary(reservation)),
      inHouse: inHouse.map((reservation) => this.mapSummary(reservation)),
      departures: departures.map((reservation) => this.mapSummary(reservation)),
    };
  }

  // ───────────────────────────── internals ─────────────────────────────

  async postStayCharges(
    tx: Prisma.TransactionClient,
    reservation: Reservation & {
      rooms: Array<{
        id: string;
        roomId: string | null;
        room: { number: string } | null;
        nights: Array<{
          id: string;
          businessDate: Date;
          rate: Prisma.Decimal;
          serviceCharge: Prisma.Decimal;
          taxAmount: Prisma.Decimal;
          total: Prisma.Decimal;
          postedFolioItemId: string | null;
        }>;
      }>;
      folios: Array<{ id: string }>;
    },
    postedById: string,
    source: JournalSource,
    onlyDate?: string,
  ): Promise<number> {
    const folioId = reservation.folios[0]?.id;
    if (!folioId) throw new AppError(ERROR_CODES.INVALID_STATE, 'Đặt phòng chưa có folio', 409);

    const context = await tx.reservation.findUnique({
      where: { id: reservation.id },
      select: { channelId: true, property: { select: { orgId: true } } },
    });
    const created: FolioItem[] = [];

    for (const room of reservation.rooms) {
      for (const night of room.nights.filter(
        (entry) =>
          !entry.postedFolioItemId &&
          (!onlyDate || entry.businessDate.toISOString().slice(0, 10) === onlyDate),
      )) {
        const date = night.businessDate.toISOString().slice(0, 10);
        const item = await tx.folioItem.create({
          data: {
            folioId,
            propertyId: reservation.propertyId,
            businessDate: night.businessDate,
            type: FolioItemType.ROOM_CHARGE,
            department: 'ROOMS',
            description: `Tiền phòng ${room.room?.number ?? ''} · đêm ${date}`,
            quantity: 1,
            unitPrice: night.rate,
            amount: night.rate,
            serviceCharge: night.serviceCharge,
            taxAmount: night.taxAmount,
            total: night.total,
            channelId: context?.channelId ?? null,
            taxRateCode: 'VAT8',
            glAccountCode: '1000',
            sourceType: 'RESERVATION_NIGHT',
            sourceId: night.id,
            postedById,
            journalized: false,
          },
        });
        await tx.reservationNight.update({
          where: { id: night.id },
          data: { postedFolioItemId: item.id, journalized: true },
        });
        created.push(item);
      }
    }

    if (created.length > 0) {
      const byDate = new Map<string, FolioItem[]>();
      for (const item of created) {
        const key = item.businessDate.toISOString().slice(0, 10);
        byDate.set(key, [...(byDate.get(key) ?? []), item]);
      }
      for (const [date, items] of byDate) {
        await this.posting.postRevenueItems(tx, {
          orgId: context?.property.orgId ?? '',
          propertyId: reservation.propertyId,
          businessDate: parseIsoDate(date),
          items,
          sourceType: source,
          sourceId: reservation.id,
          postedById,
          memo: `Tiền phòng ${reservation.code} · ${date}`,
        });
      }
    }

    return created.length;
  }

  async recomputeFolioBalance(tx: Prisma.TransactionClient, folioId: string): Promise<Prisma.Decimal> {
    if (!folioId) return new Prisma.Decimal(0);
    const aggregate = await tx.folioItem.aggregate({
      where: { folioId, isVoid: false },
      _sum: { total: true },
    });
    const balance = aggregate._sum.total ?? new Prisma.Decimal(0);
    await tx.folio.update({ where: { id: folioId }, data: { balance } });
    return balance;
  }

  private async property(propertyId: string): Promise<Property> {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy cơ sở', 404);
    return property;
  }

  private async taxRules(property: Property): Promise<{ rules: TaxRuleSet; taxRateCode: string }> {
    const vat = await this.prisma.taxRate.findFirst({
      where: { orgId: property.orgId, code: 'VAT8', isActive: true },
    });
    return {
      rules: {
        vatPct: vat ? Number(vat.rate) : 8,
        serviceChargePct: Number(property.serviceChargePct),
        pricesIncludeTax: property.pricesIncludeTax,
      },
      taxRateCode: vat?.code ?? 'VAT8',
    };
  }

  private async resolveRatePlan(propertyId: string, ratePlanId?: string) {
    if (ratePlanId) {
      return this.prisma.ratePlan.findFirst({ where: { id: ratePlanId, propertyId, isActive: true } });
    }
    return (
      (await this.prisma.ratePlan.findFirst({ where: { propertyId, code: 'BAR', isActive: true } })) ??
      (await this.prisma.ratePlan.findFirst({ where: { propertyId, isActive: true }, orderBy: { sortOrder: 'asc' } }))
    );
  }

  private async resolveRatePlanTx(tx: Prisma.TransactionClient, propertyId: string, ratePlanId?: string) {
    if (ratePlanId) {
      return tx.ratePlan.findFirst({ where: { id: ratePlanId, propertyId, isActive: true } });
    }
    return (
      (await tx.ratePlan.findFirst({ where: { propertyId, code: 'BAR', isActive: true } })) ??
      (await tx.ratePlan.findFirst({ where: { propertyId, isActive: true }, orderBy: { sortOrder: 'asc' } }))
    );
  }

  private async resolveGuest(
    tx: Prisma.TransactionClient,
    property: Property,
    input: CreateReservationInput,
  ) {
    if (input.guestId) {
      const guest = await tx.guest.findFirst({ where: { id: input.guestId, orgId: property.orgId } });
      if (!guest) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy khách hàng', 404);
      return guest;
    }
    const firstName = input.guest.firstName ?? '';
    const lastName = input.guest.lastName ?? '';
    if (!firstName || !lastName) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Thiếu tên khách hàng', 422);
    }
    const code = await this.sequence.next(tx, property.id, 'GUEST');
    return tx.guest.create({
      data: {
        orgId: property.orgId,
        code,
        firstName,
        lastName,
        fullName: `${lastName} ${firstName}`.trim(),
        email: input.guest.email,
        phone: input.guest.phone,
        nationality: input.guest.nationality,
        country: input.guest.country,
        dob: input.guest.dob ? parseIsoDate(input.guest.dob) : null,
        vipLevel: input.guest.vipLevel ?? 0,
        notes: input.guest.notes,
      },
    });
  }

  private async loadForMutation(actor: AuthUser, id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        rooms: { include: { room: true, nights: { orderBy: { businessDate: 'asc' } } } },
        folios: { include: { items: true } },
      },
    });
    if (!reservation) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy đặt phòng', 404);
    assertPropertyAccess(actor, reservation.propertyId);
    return reservation;
  }

  private mapSummary(reservation: {
    id: string;
    code: string;
    status: string;
    checkIn: Date;
    checkOut: Date;
    nights: number;
    adults: number;
    children: number;
    roomsCount: number;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    balance: Prisma.Decimal;
    specialRequests: string | null;
    primaryGuest: { fullName: string; email: string | null; phone: string | null; vipLevel: number };
    channel: { code: string; name: string } | null;
    rooms: Array<{ id: string; roomId: string | null; room: { number: string } | null; roomType: { name: string } }>;
  }) {
    return {
      id: reservation.id,
      code: reservation.code,
      status: reservation.status,
      checkIn: reservation.checkIn.toISOString().slice(0, 10),
      checkOut: reservation.checkOut.toISOString().slice(0, 10),
      nights: reservation.nights,
      adults: reservation.adults,
      children: reservation.children,
      roomsCount: reservation.roomsCount,
      totalAmount: moneyToJson(reservation.totalAmount),
      paidAmount: moneyToJson(reservation.paidAmount),
      balance: moneyToJson(reservation.balance),
      specialRequests: reservation.specialRequests,
      guest: reservation.primaryGuest,
      channel: reservation.channel,
      rooms: reservation.rooms.map((room) => ({
        id: room.id,
        roomId: room.roomId,
        roomNumber: room.room?.number ?? null,
        roomType: room.roomType.name,
      })),
    };
  }

  private mapDetail(reservation: {
    id: string;
    propertyId: string;
    code: string;
    status: string;
    checkIn: Date;
    checkOut: Date;
    nights: number;
    adults: number;
    children: number;
    roomsCount: number;
    totalNet: Prisma.Decimal;
    totalServiceCharge: Prisma.Decimal;
    totalTax: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    commissionAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    balance: Prisma.Decimal;
    depositAmount: Prisma.Decimal;
    specialRequests: string | null;
    notes: string | null;
    checkedInAt: Date | null;
    checkedOutAt: Date | null;
    createdAt: Date;
    currency: string;
    primaryGuest: {
      id: string;
      fullName: string;
      email: string | null;
      phone: string | null;
      nationality: string | null;
      vipLevel: number;
      notes: string | null;
      documents: Array<{ id: string; type: string; numberLast4: string }>;
      preferences: Array<{ id: string; category: string; value: string }>;
    };
    channel: { code: string; name: string; commissionPct: Prisma.Decimal } | null;
    company: { id: string; name: string } | null;
    ratePlan: { id: string; name: string } | null;
    rooms: Array<{
      id: string;
      roomId: string | null;
      status: string;
      adults: number;
      children: number;
      nightlyRate: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
      folioId: string | null;
      room: { id: string; number: string } | null;
      roomType: { id: string; name: string; code: string };
      nights: Array<{ id: string; businessDate: Date; rate: Prisma.Decimal; total: Prisma.Decimal; postedFolioItemId: string | null; journalized: boolean }>;
    }>;
    folios: Array<{
      id: string;
      number: string;
      status: string;
      balance: Prisma.Decimal;
      items: Array<{
        id: string;
        businessDate: Date;
        type: string;
        department: string;
        description: string;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        amount: Prisma.Decimal;
        serviceCharge: Prisma.Decimal;
        taxAmount: Prisma.Decimal;
        total: Prisma.Decimal;
        isVoid: boolean;
        journalized: boolean;
        invoiceId: string | null;
        createdAt: Date;
      }>;
      payments: Array<{ id: string; method: string; amount: Prisma.Decimal; paidAt: Date; reference: string | null }>;
    }>;
  }) {
    return {
      id: reservation.id,
      propertyId: reservation.propertyId,
      code: reservation.code,
      status: reservation.status,
      checkIn: reservation.checkIn.toISOString().slice(0, 10),
      checkOut: reservation.checkOut.toISOString().slice(0, 10),
      nights: reservation.nights,
      adults: reservation.adults,
      children: reservation.children,
      roomsCount: reservation.roomsCount,
      currency: reservation.currency,
      totals: {
        net: moneyToJson(reservation.totalNet),
        serviceCharge: moneyToJson(reservation.totalServiceCharge),
        vat: moneyToJson(reservation.totalTax),
        total: moneyToJson(reservation.totalAmount),
        commission: moneyToJson(reservation.commissionAmount),
        paid: moneyToJson(reservation.paidAmount),
        balance: moneyToJson(reservation.balance),
        deposit: moneyToJson(reservation.depositAmount),
      },
      specialRequests: reservation.specialRequests,
      notes: reservation.notes,
      checkedInAt: reservation.checkedInAt?.toISOString() ?? null,
      checkedOutAt: reservation.checkedOutAt?.toISOString() ?? null,
      createdAt: reservation.createdAt.toISOString(),
      guest: reservation.primaryGuest,
      channel: reservation.channel
        ? { code: reservation.channel.code, name: reservation.channel.name, commissionPct: Number(reservation.channel.commissionPct) }
        : null,
      company: reservation.company,
      ratePlan: reservation.ratePlan,
      rooms: reservation.rooms.map((room) => ({
        id: room.id,
        roomId: room.roomId,
        roomNumber: room.room?.number ?? null,
        status: room.status,
        roomType: room.roomType,
        adults: room.adults,
        children: room.children,
        nightlyRate: moneyToJson(room.nightlyRate),
        totalAmount: moneyToJson(room.totalAmount),
        folioId: room.folioId,
        nights: room.nights.map((night) => ({
          id: night.id,
          date: night.businessDate.toISOString().slice(0, 10),
          rate: moneyToJson(night.rate),
          total: moneyToJson(night.total),
          posted: Boolean(night.postedFolioItemId),
          journalized: night.journalized,
        })),
      })),
      folios: reservation.folios.map((folio) => ({
        id: folio.id,
        number: folio.number,
        status: folio.status,
        balance: moneyToJson(folio.balance),
        items: folio.items.map((item) => ({
          id: item.id,
          businessDate: item.businessDate.toISOString().slice(0, 10),
          type: item.type,
          department: item.department,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: moneyToJson(item.unitPrice),
          amount: moneyToJson(item.amount),
          serviceCharge: moneyToJson(item.serviceCharge),
          taxAmount: moneyToJson(item.taxAmount),
          total: moneyToJson(item.total),
          isVoid: item.isVoid,
          journalized: item.journalized,
          invoiceId: item.invoiceId,
          createdAt: item.createdAt.toISOString(),
        })),
        payments: folio.payments.map((payment) => ({
          id: payment.id,
          method: payment.method,
          amount: moneyToJson(payment.amount),
          paidAt: payment.paidAt.toISOString(),
          reference: payment.reference,
        })),
      })),
    };
  }

  private isRoomOverlap(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('23P01') || message.includes('no_room_overlap');
  }

  private isRetryable(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
  }

  businessDateFor(property: Property, instant = new Date()): string {
    return businessDateOf(instant, {
      timeZone: property.timezone,
      cutoffHour: property.businessDayCutoff,
    });
  }
}
