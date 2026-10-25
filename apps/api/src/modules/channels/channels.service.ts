import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ChannelDirection, ChannelJobStatus, ChannelSyncKind, Prisma } from '@prisma/client';
import {
  ERROR_CODES,
  AppError,
  addDays,
  isoToday,
  parseIsoDate,
  stayNights,
} from '@grand-suite/shared';
import type { z } from 'zod';
import type {
  channelJobTestSchema,
  channelMappingSchema,
  channelPushSchema,
  channelWebhookSchema,
} from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { buildSystemActor } from '../../common/auth/system-actor';
import { PrismaService } from '../../common/prisma/prisma.module';
import { RealtimeService } from '../realtime/realtime.service';
import { ReservationsService } from '../reservations/reservations.service';
import { ChannelAdapterRegistry } from './adapters/registry';

type PushInput = z.infer<typeof channelPushSchema>;
type MappingInput = z.infer<typeof channelMappingSchema>;
type WebhookInput = z.infer<typeof channelWebhookSchema>;
type JobTestInput = z.infer<typeof channelJobTestSchema>;

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly adapters: ChannelAdapterRegistry,
    private readonly reservations: ReservationsService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(actor: AuthUser) {
    const channels = await this.prisma.channel.findMany({
      where: { orgId: actor.orgId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    const propertyIds = await this.accessiblePropertyIds(actor);
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [mappings, jobs, logs, bookings, integrations] = await Promise.all([
      this.prisma.channelRoomMapping.groupBy({ by: ['channelId'], _count: { _all: true } }),
      this.prisma.channelSyncJob.groupBy({
        by: ['channelId', 'status'],
        where: { propertyId: { in: propertyIds } },
        _count: { _all: true },
      }),
      this.prisma.channelSyncLog.findMany({
        where: { channelId: { in: channels.map((channel) => channel.id) } },
        orderBy: { createdAt: 'desc' },
        take: 60,
        include: { channel: { select: { code: true, name: true } } },
      }),
      this.prisma.reservation.groupBy({
        by: ['channelId'],
        where: { propertyId: { in: propertyIds }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.integrationConfig.findMany({ where: { orgId: actor.orgId } }),
    ]);

    const mappingMap = new Map(mappings.map((row) => [row.channelId, row._count._all]));
    const bookingMap = new Map(bookings.map((row) => [row.channelId, row._count._all]));
    const jobMap = new Map<string, { pending: number; dlq: number; failed: number; success: number }>();
    for (const row of jobs) {
      const current = jobMap.get(row.channelId) ?? { pending: 0, dlq: 0, failed: 0, success: 0 };
      if (row.status === 'PENDING' || row.status === 'PROCESSING') current.pending += row._count._all;
      if (row.status === 'DLQ') current.dlq += row._count._all;
      if (row.status === 'FAILED') current.failed += row._count._all;
      if (row.status === 'SUCCESS') current.success += row._count._all;
      jobMap.set(row.channelId, current);
    }
    const integrationMap = new Map(integrations.map((row) => [row.provider, row]));
    const logMap = new Map<string, (typeof logs)[number]>();
    for (const log of logs) if (!logMap.has(log.channelId)) logMap.set(log.channelId, log);

    return {
      totals: {
        channels: channels.length,
        ota: channels.filter((channel) => channel.type === 'OTA').length,
        social: channels.filter((channel) => channel.type === 'SOCIAL').length,
        mappings: mappings.reduce((acc, row) => acc + row._count._all, 0),
        bookings30d: bookings.reduce((acc, row) => acc + row._count._all, 0),
        dlq: [...jobMap.values()].reduce((acc, row) => acc + row.dlq, 0),
      },
      channels: channels.map((channel) => {
        const integration = integrationMap.get(channel.code);
        return {
          id: channel.id,
          code: channel.code,
          name: channel.name,
          type: channel.type,
          commissionPct: Number(channel.commissionPct),
          isActive: channel.isActive,
          adapter: this.adapters.codes().includes(channel.code),
          integrationStatus: integration?.status ?? 'SANDBOX',
          hasCredentials: Boolean(integration?.credentialsEnc),
          mappings: mappingMap.get(channel.id) ?? 0,
          bookings30d: bookingMap.get(channel.id) ?? 0,
          jobs: jobMap.get(channel.id) ?? { pending: 0, dlq: 0, failed: 0, success: 0 },
          lastSyncAt: logMap.get(channel.id)?.createdAt.toISOString() ?? null,
          lastSyncStatus: logMap.get(channel.id)?.status ?? null,
        };
      }),
      logs: logs.map((log) => ({
        id: log.id,
        channelCode: log.channel.code,
        channelName: log.channel.name,
        direction: log.direction,
        kind: log.kind,
        status: log.status,
        error: log.error,
        durationMs: log.durationMs,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  async mappings(actor: AuthUser, channelCode: string) {
    const channel = await this.channelOrThrow(actor.orgId, channelCode);
    const property = await this.primaryProperty(actor);
    const roomTypes = await this.prisma.roomType.findMany({
      where: { propertyId: property.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const existing = await this.prisma.channelRoomMapping.findMany({
      where: { channelId: channel.id, roomTypeId: { in: roomTypes.map((roomType) => roomType.id) } },
    });
    const map = new Map(existing.map((mapping) => [mapping.roomTypeId, mapping]));
    return roomTypes.map((roomType) => ({
      roomTypeId: roomType.id,
      code: roomType.code,
      name: roomType.name,
      baseRate: Number(roomType.baseRate),
      mapping: map.get(roomType.id)
        ? {
            id: map.get(roomType.id)!.id,
            externalRoomTypeId: map.get(roomType.id)!.externalRoomTypeId,
            externalRatePlanId: map.get(roomType.id)!.externalRatePlanId,
            isActive: map.get(roomType.id)!.isActive,
          }
        : null,
    }));
  }

  async upsertMapping(actor: AuthUser, channelCode: string, input: MappingInput) {
    const channel = await this.channelOrThrow(actor.orgId, channelCode);
    const property = await this.primaryProperty(actor);
    const roomType = await this.prisma.roomType.findFirst({
      where: { id: input.roomTypeId, propertyId: property.id },
    });
    if (!roomType) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy hạng phòng', 404);
    const mapping = await this.prisma.channelRoomMapping.upsert({
      where: { channelId_roomTypeId: { channelId: channel.id, roomTypeId: roomType.id } },
      update: {
        externalRoomTypeId: input.externalRoomTypeId,
        externalRatePlanId: input.externalRatePlanId,
        isActive: true,
      },
      create: {
        channelId: channel.id,
        roomTypeId: roomType.id,
        externalRoomTypeId: input.externalRoomTypeId,
        externalRatePlanId: input.externalRatePlanId,
      },
    });
    await this.audit.record({
      orgId: actor.orgId,
      propertyId: property.id,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'channel.mapping_updated',
      entityType: 'ChannelRoomMapping',
      entityId: mapping.id,
      after: { channel: channel.code, roomType: roomType.code, externalRoomTypeId: mapping.externalRoomTypeId },
    });
    return { id: mapping.id };
  }

  async pushAri(actor: AuthUser, channelCode: string, input: PushInput) {
    const channel = await this.channelOrThrow(actor.orgId, channelCode);
    const property = await this.primaryProperty(actor, input.propertyId);
    assertPropertyAccess(actor, property.id);
    const days = input.days;
    const from = isoToday();
    const to = addDays(from, days);

    await this.ensureMappings(channel.id, property.id);
    const mappings = await this.prisma.channelRoomMapping.findMany({
      where: { channelId: channel.id, isActive: true, roomType: { isActive: true } },
      include: { roomType: true },
    });
    if (mappings.length === 0) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Chưa cấu hình mapping hạng phòng cho kênh này', 409);
    }

    const plan = await this.prisma.ratePlan.findFirst({ where: { propertyId: property.id, code: 'BAR' } });
    const rates = await this.prisma.ratePlanRate.findMany({
      where: { ratePlanId: plan?.id, date: { gte: parseIsoDate(from), lte: parseIsoDate(to) } },
    });
    const rateMap = new Map(rates.map((rate) => [`${rate.roomTypeId}|${rate.date.toISOString().slice(0, 10)}`, Number(rate.amount)]));

    const bookings = await this.prisma.reservationRoom.findMany({
      where: {
        reservation: { propertyId: property.id, status: { in: ['PENDING', 'CONFIRMED', 'IN_HOUSE'] } },
        status: { in: ['RESERVED', 'IN_HOUSE'] },
        checkIn: { lt: parseIsoDate(to) },
        checkOut: { gt: parseIsoDate(from) },
      },
      select: { roomTypeId: true, checkIn: true, checkOut: true },
    });
    const rooms = await this.prisma.room.findMany({
      where: { propertyId: property.id, isActive: true, status: { notIn: ['OUT_OF_ORDER', 'OUT_OF_SERVICE'] } },
      select: { roomTypeId: true },
    });
    const physical = new Map<string, number>();
    for (const room of rooms) physical.set(room.roomTypeId, (physical.get(room.roomTypeId) ?? 0) + 1);

    const jobs: Prisma.ChannelSyncJobCreateManyInput[] = [];
    for (const mapping of mappings) {
      for (const date of stayNights(from, to)) {
        const occupied = bookings.filter(
          (booking) =>
            booking.roomTypeId === mapping.roomTypeId &&
            booking.checkIn.toISOString().slice(0, 10) <= date &&
            booking.checkOut.toISOString().slice(0, 10) > date,
        ).length;
        const available = Math.max(0, (physical.get(mapping.roomTypeId) ?? 0) - occupied);
        const rate = rateMap.get(`${mapping.roomTypeId}|${date}`) ?? Number(mapping.roomType.baseRate);
        jobs.push({
          orgId: actor.orgId,
          propertyId: property.id,
          channelId: channel.id,
          kind: ChannelSyncKind.AVAILABILITY,
          status: ChannelJobStatus.PENDING,
          idempotencyKey: `ari:${date}:${mapping.id}`,
          payload: {
            date,
            roomTypeCode: mapping.roomType.code,
            externalRoomTypeId: mapping.externalRoomTypeId,
            available,
            rate,
            currency: property.currency,
            ...(input.simulateFailure ? { simulateFailure: true } : {}),
          } as Prisma.InputJsonValue,
        });
        jobs.push({
          orgId: actor.orgId,
          propertyId: property.id,
          channelId: channel.id,
          kind: ChannelSyncKind.RATES,
          status: ChannelJobStatus.PENDING,
          idempotencyKey: `rate:${date}:${mapping.id}`,
          payload: {
            roomTypeCode: mapping.roomType.code,
            externalRoomTypeId: mapping.externalRoomTypeId,
            externalRatePlanId: mapping.externalRatePlanId ?? `${channel.code}-BAR`,
            from,
            to,
            amounts: [{ date, amount: rate, currency: property.currency }],
            ...(input.simulateFailure ? { simulateFailure: true } : {}),
          } as Prisma.InputJsonValue,
        });
      }
    }

    const created = await this.prisma.channelSyncJob.createMany({ data: jobs, skipDuplicates: true });
    await this.log(channel.id, null, ChannelDirection.PUSH, 'ARI', 'QUEUED', {
      request: { days, mappings: mappings.length },
    });
    const summary = await this.processJobs(actor, channel.code, { force: true, limit: Math.max(100, jobs.length) });
    this.realtime.emitToProperty(property.id, 'channel.synced', { channel: channel.code, ...summary });
    return { enqueued: created.count, ...summary };
  }

  async processJobs(actor: AuthUser, channelCode: string, options: { force?: boolean; limit?: number } = {}) {
    const channel = await this.channelOrThrow(actor.orgId, channelCode);
    const adapter = this.adapters.get(channel.code);
    const now = new Date();
    const jobs = await this.prisma.channelSyncJob.findMany({
      where: {
        channelId: channel.id,
        status: { in: ['PENDING', 'FAILED'] },
        ...(options.force ? {} : { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }),
      },
      orderBy: { createdAt: 'asc' },
      take: options.limit ?? 100,
    });

    let succeeded = 0;
    let failed = 0;
    let dlq = 0;
    for (const job of jobs) {
      const started = Date.now();
      await this.prisma.channelSyncJob.update({
        where: { id: job.id },
        data: { status: 'PROCESSING' },
      });
      try {
        const payload = job.payload as Record<string, unknown>;
        if (payload.simulateFailure === true) throw new Error('Kênh từ chối tạm thời (mô phỏng lỗi đồng bộ)');
        const result =
          job.kind === 'RATES'
            ? await adapter.pushRates([payload as never])
            : await adapter.pushAvailability([payload as never]);
        if (!result.ok) throw new Error(result.message ?? 'Adapter trả về lỗi');
        await this.prisma.channelSyncJob.update({
          where: { id: job.id },
          data: { status: 'SUCCESS', result: result as unknown as Prisma.InputJsonValue, lastError: null },
        });
        await this.log(channel.id, job.id, ChannelDirection.PUSH, job.kind, 'SUCCESS', {
          request: payload as Prisma.InputJsonValue,
          response: result as unknown as Prisma.InputJsonValue,
          durationMs: Date.now() - started,
        });
        succeeded += 1;
      } catch (error) {
        const attempts = job.attempts + 1;
        const isDlq = attempts >= job.maxAttempts;
        await this.prisma.channelSyncJob.update({
          where: { id: job.id },
          data: {
            status: isDlq ? 'DLQ' : 'FAILED',
            attempts,
            nextAttemptAt: isDlq ? null : new Date(Date.now() + 60_000 * 2 ** (attempts - 1)),
            lastError: error instanceof Error ? error.message.slice(0, 500) : 'Lỗi đồng bộ',
          },
        });
        await this.log(channel.id, job.id, ChannelDirection.PUSH, job.kind, isDlq ? 'DLQ' : 'FAILED', {
          request: job.payload as Prisma.InputJsonValue,
          error: error instanceof Error ? error.message : 'Lỗi đồng bộ',
          durationMs: Date.now() - started,
        });
        failed += 1;
        if (isDlq) dlq += 1;
      }
    }
    return { processed: jobs.length, succeeded, failed, dlq };
  }

  async enqueueTestJob(actor: AuthUser, channelCode: string, input: JobTestInput) {
    const channel = await this.channelOrThrow(actor.orgId, channelCode);
    const property = await this.primaryProperty(actor);
    const job = await this.prisma.channelSyncJob.create({
      data: {
        orgId: actor.orgId,
        propertyId: property.id,
        channelId: channel.id,
        kind: ChannelSyncKind.AVAILABILITY,
        idempotencyKey: `test:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        payload: { simulateFailure: input.fail, test: true },
      },
    });
    return { id: job.id };
  }

  async retryJob(actor: AuthUser, jobId: string) {
    const job = await this.prisma.channelSyncJob.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy job đồng bộ', 404);
    assertPropertyAccess(actor, job.propertyId);
    const payload = { ...(job.payload as Record<string, unknown>), simulateFailure: false };
    await this.prisma.channelSyncJob.update({
      where: { id: jobId },
      data: {
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: null,
        lastError: null,
        payload: payload as Prisma.InputJsonValue,
      },
    });
    return { id: jobId, status: 'PENDING' };
  }

  async pull(actor: AuthUser, channelCode: string, count = 2) {
    const channel = await this.channelOrThrow(actor.orgId, channelCode);
    const property = await this.primaryProperty(actor);
    const mappings = await this.prisma.channelRoomMapping.findMany({
      where: { channelId: channel.id, isActive: true },
      include: { roomType: true },
    });
    const roomTypes = mappings.length
      ? mappings.map((mapping) => mapping.roomType)
      : await this.prisma.roomType.findMany({ where: { propertyId: property.id, isActive: true }, take: 3 });
    if (roomTypes.length === 0) throw new AppError(ERROR_CODES.INVALID_STATE, 'Cơ sở chưa có hạng phòng', 409);

    const adapter = this.adapters.get(channel.code);
    const start = Date.now();
    const inbound = await adapter.pullReservations({
      channelCode: channel.code,
      propertyCode: property.code,
      roomTypeCodes: roomTypes.map((roomType) => roomType.code),
      startDate: addDays(isoToday(), 21),
      count,
    });
    const roomTypeByCode = new Map(roomTypes.map((roomType) => [roomType.code, roomType]));
    const created: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const external of inbound) {
      const existing = await this.prisma.externalReservation.findUnique({
        where: { channelId_externalId: { channelId: channel.id, externalId: external.externalId } },
      });
      if (existing) {
        skipped.push(external.externalId);
        continue;
      }
      if (external.status === 'CANCELLED') {
        await this.prisma.externalReservation.create({
          data: { channelId: channel.id, externalId: external.externalId, status: 'CANCELLED', raw: external.raw as Prisma.InputJsonValue },
        });
        skipped.push(external.externalId);
        continue;
      }
      const roomType = roomTypeByCode.get(external.roomTypeCode) ?? roomTypes[0]!;
      try {
        const reservation = await this.reservations.create(actor, {
          propertyId: property.id,
          checkIn: external.checkIn,
          checkOut: external.checkOut,
          channelCode: channel.code,
          guest: external.guest,
          rooms: [{ roomTypeId: roomType.id, adults: external.adults, children: external.children }],
          source: 'CHANNEL_PULL',
          specialRequests: external.specialRequests,
        });
        await this.prisma.externalReservation.create({
          data: {
            channelId: channel.id,
            externalId: external.externalId,
            reservationId: reservation.id,
            status: 'CONFIRMED',
            raw: external.raw as Prisma.InputJsonValue,
          },
        });
        created.push(reservation.code);
      } catch (error) {
        errors.push(`${external.externalId}: ${error instanceof Error ? error.message : 'lỗi'}`);
      }
    }

    await this.log(channel.id, null, ChannelDirection.PULL, 'RESERVATIONS', errors.length ? 'PARTIAL' : 'SUCCESS', {
      request: { count, channel: channel.code },
      response: { created, skipped } as Prisma.InputJsonValue,
      durationMs: Date.now() - start,
      ...(errors.length ? { error: errors.join('; ').slice(0, 500) } : {}),
    });
    this.realtime.emitToProperty(property.id, 'channel.reservations_pulled', { channel: channel.code, created: created.length });
    return { created, skipped, errors, channel: channel.code, adapter: adapter.code };
  }

  async webhook(
    provider: string,
    payload: WebhookInput,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    const channel = await this.prisma.channel.findFirst({ where: { code: provider } });
    if (!channel) throw new AppError(ERROR_CODES.NOT_FOUND, 'Kênh không tồn tại', 404);
    this.verifySignature(provider, payload, signature, timestamp);
    const adapter = this.adapters.get(channel.code);
    const mappedStatus = adapter.mapStatus(payload.status);
    const existing = await this.prisma.externalReservation.findUnique({
      where: { channelId_externalId: { channelId: channel.id, externalId: payload.externalId } },
    });
    if (existing) {
      return { duplicate: true, status: mappedStatus, reservationId: existing.reservationId };
    }
    if (mappedStatus !== 'CONFIRMED') {
      await this.prisma.externalReservation.create({
        data: { channelId: channel.id, externalId: payload.externalId, status: mappedStatus, raw: payload as unknown as Prisma.InputJsonValue },
      });
      return { duplicate: false, status: mappedStatus, reservationId: null };
    }

    const property = await this.prisma.property.findFirst({ where: { orgId: channel.orgId, code: payload.propertyCode } });
    if (!property) throw new AppError(ERROR_CODES.NOT_FOUND, 'Cơ sở không tồn tại', 404);
    const roomType = await this.prisma.roomType.findFirst({
      where: { propertyId: property.id, code: payload.roomTypeCode },
    });
    if (!roomType) throw new AppError(ERROR_CODES.NOT_FOUND, 'Hạng phòng không tồn tại', 404);

    const system = await buildSystemActor(this.prisma, channel.orgId, `Kênh ${channel.name}`);
    const reservation = await this.reservations.create(system, {
      propertyId: property.id,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      channelCode: channel.code,
      guest: payload.guest,
      rooms: [{ roomTypeId: roomType.id, adults: payload.adults, children: payload.children }],
      source: 'CHANNEL_WEBHOOK',
      specialRequests: payload.specialRequests,
    });
    await this.prisma.externalReservation.create({
      data: {
        channelId: channel.id,
        externalId: payload.externalId,
        reservationId: reservation.id,
        status: 'CONFIRMED',
        raw: payload as unknown as Prisma.InputJsonValue,
      },
    });
    await this.log(channel.id, null, ChannelDirection.WEBHOOK, 'RESERVATION', 'SUCCESS', {
      request: payload as unknown as Prisma.InputJsonValue,
      response: { reservationCode: reservation.code } as Prisma.InputJsonValue,
    });
    this.realtime.emitToProperty(property.id, 'channel.webhook_received', { channel: channel.code, code: reservation.code });
    return { duplicate: false, status: mappedStatus, reservationId: reservation.id, reservationCode: reservation.code };
  }

  async bookingsByChannel(propertyIds: string[], from: string, to: string) {
    if (propertyIds.length === 0) return [] as Array<{ channelId: string | null; code: string; name: string; bookings: number }>;
    const rows = await this.prisma.reservation.groupBy({
      by: ['channelId'],
      where: {
        propertyId: { in: propertyIds },
        checkIn: { gte: parseIsoDate(from), lte: parseIsoDate(to) },
        status: { notIn: ['CANCELLED'] },
      },
      _count: { _all: true },
    });
    const channels = await this.prisma.channel.findMany({
      where: { id: { in: rows.map((row) => row.channelId).filter((id): id is string => Boolean(id)) } },
    });
    const map = new Map(channels.map((channel) => [channel.id, channel]));
    return rows.map((row) => ({
      channelId: row.channelId,
      code: row.channelId ? map.get(row.channelId)?.code ?? 'DIRECT' : 'DIRECT',
      name: row.channelId ? map.get(row.channelId)?.name ?? 'Trực tiếp' : 'Trực tiếp',
      bookings: row._count._all,
    }));
  }

  private async ensureMappings(channelId: string, propertyId: string) {
    const roomTypes = await this.prisma.roomType.findMany({ where: { propertyId, isActive: true } });
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return;
    await this.prisma.channelRoomMapping.createMany({
      data: roomTypes.map((roomType) => ({
        channelId,
        roomTypeId: roomType.id,
        externalRoomTypeId: `${channel.code}-${roomType.code}`,
        externalRatePlanId: `${channel.code}-BAR`,
      })),
      skipDuplicates: true,
    });
  }

  private async channelOrThrow(orgId: string, code: string) {
    const channel = await this.prisma.channel.findFirst({ where: { orgId, code } });
    if (!channel) throw new AppError(ERROR_CODES.NOT_FOUND, `Không tìm thấy kênh ${code}`, 404);
    return channel;
  }

  private async primaryProperty(actor: AuthUser, requested?: string) {
    if (requested) {
      assertPropertyAccess(actor, requested);
      const property = await this.prisma.property.findUnique({ where: { id: requested } });
      if (!property) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy cơ sở', 404);
      return property;
    }
    const property = actor.orgWide
      ? await this.prisma.property.findFirst({ where: { orgId: actor.orgId, type: 'HOTEL', isActive: true } })
      : await this.prisma.property.findFirst({
          where: {
            id: { in: actor.roles.map((role) => role.propertyId).filter((id): id is string => Boolean(id)) },
            isActive: true,
          },
        });
    if (!property) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy cơ sở hoạt động', 404);
    return property;
  }

  private async accessiblePropertyIds(actor: AuthUser) {
    if (actor.orgWide) {
      return (await this.prisma.property.findMany({ where: { orgId: actor.orgId }, select: { id: true } })).map(
        (property) => property.id,
      );
    }
    return [...new Set(actor.roles.map((role) => role.propertyId).filter((id): id is string => Boolean(id)))];
  }

  private verifySignature(provider: string, payload: WebhookInput, signature?: string, timestamp?: string) {
    if (!signature || !timestamp) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Thiếu chữ ký webhook', 401);
    }
    const timestampNumber = Number(timestamp);
    if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() - timestampNumber) > 5 * 60_000) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Webhook đã hết hạn', 401);
    }
    const secret = this.config.get<string>('CHANNEL_WEBHOOK_SECRET') ?? 'dev-channel-webhook-secret';
    const expected = createHmac('sha256', secret)
      .update(`${provider}.${timestamp}.${JSON.stringify(payload)}`)
      .digest('hex');
    const provided = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Chữ ký webhook không hợp lệ', 401);
    }
  }

  private async log(
    channelId: string,
    jobId: string | null,
    direction: ChannelDirection,
    kind: string,
    status: string,
    data: { request?: Prisma.InputJsonValue; response?: Prisma.InputJsonValue; error?: string; durationMs?: number },
  ) {
    await this.prisma.channelSyncLog.create({
      data: {
        channelId,
        jobId,
        direction,
        kind,
        status,
        request: data.request,
        response: data.response,
        error: data.error,
        durationMs: data.durationMs,
      },
    });
  }
}
