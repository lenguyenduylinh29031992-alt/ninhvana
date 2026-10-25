import { Injectable } from '@nestjs/common';
import { JournalSource, Prisma } from '@prisma/client';
import {
  ERROR_CODES,
  AppError,
  businessDateOf,
  commissionFor,
  moneyToJson,
  parseIsoDate,
} from '@grand-suite/shared';
import type { z } from 'zod';
import type { nightAuditSchema } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { LockService } from '../../common/locks/lock.module';
import { PrismaService } from '../../common/prisma/prisma.module';
import { AccountingService } from '../accounting/accounting.service';
import { PostingService } from '../accounting/posting.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ReservationsService } from '../reservations/reservations.service';

type RunInput = z.infer<typeof nightAuditSchema>;

const CHARGE_TYPES = ['ROOM_CHARGE', 'FNB_CHARGE', 'SPA_CHARGE', 'EVENT_CHARGE', 'OTHER_CHARGE'];

@Injectable()
export class NightAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: LockService,
    private readonly posting: PostingService,
    private readonly reservations: ReservationsService,
    private readonly accounting: AccountingService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async run(actor: AuthUser, input: RunInput) {
    assertPropertyAccess(actor, input.propertyId);
    const property = await this.prisma.property.findUnique({ where: { id: input.propertyId } });
    if (!property) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy cơ sở', 404);
    const today = businessDateOf(new Date(), {
      timeZone: property.timezone,
      cutoffHour: property.businessDayCutoff,
    });
    if (input.businessDate > today) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Không thể chạy kiểm toán cho ngày tương lai', 422);
    }

    const existing = await this.prisma.nightAudit.findUnique({
      where: { propertyId_businessDate: { propertyId: input.propertyId, businessDate: parseIsoDate(input.businessDate) } },
    });
    if (existing?.status === 'COMPLETED') {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Ngày nghiệp vụ này đã được kiểm toán', 409);
    }
    if (existing?.status === 'RUNNING') {
      throw new AppError(ERROR_CODES.CONFLICT, 'Kiểm toán đang chạy cho ngày này', 409);
    }

    if (input.dryRun) {
      return this.preview(input.propertyId, input.businessDate);
    }

    return this.locks.withLocks([`audit:${input.propertyId}:${input.businessDate}`], async () => {
      const run = existing
        ? await this.prisma.nightAudit.update({
            where: { id: existing.id },
            data: { status: 'RUNNING', startedAt: new Date(), error: null, runById: actor.id },
          })
        : await this.prisma.nightAudit.create({
            data: {
              propertyId: input.propertyId,
              businessDate: parseIsoDate(input.businessDate),
              status: 'RUNNING',
              runById: actor.id,
            },
          });

      try {
        const stats = await this.prisma.$transaction(
          async (tx) => {
            const reservations = await tx.reservation.findMany({
              where: {
                propertyId: input.propertyId,
                status: { in: ['IN_HOUSE', 'CHECKED_OUT'] },
                rooms: { some: { nights: { some: { businessDate: parseIsoDate(input.businessDate) } } } },
              },
              include: {
                rooms: { include: { room: true, nights: { orderBy: { businessDate: 'asc' } } } },
                folios: true,
              },
            });

            let postedNights = 0;
            for (const reservation of reservations) {
              postedNights += await this.reservations.postStayCharges(
                tx,
                reservation,
                actor.id,
                JournalSource.NIGHT_AUDIT,
                input.businessDate,
              );
            }

            // Catch up any other unjournalised charge (manual postings, POS) dated on/before the audit date.
            const unposted = await tx.folioItem.findMany({
              where: {
                propertyId: input.propertyId,
                businessDate: { lte: parseIsoDate(input.businessDate) },
                journalized: false,
                isVoid: false,
                type: { in: CHARGE_TYPES as never },
              },
            });
            const byDate = new Map<string, typeof unposted>();
            for (const item of unposted) {
              const key = item.businessDate.toISOString().slice(0, 10);
              byDate.set(key, [...(byDate.get(key) ?? []), item]);
            }
            for (const [date, items] of byDate) {
              await this.posting.postRevenueItems(tx, {
                orgId: property.orgId,
                propertyId: property.id,
                businessDate: parseIsoDate(date),
                items,
                sourceType: JournalSource.NIGHT_AUDIT,
                sourceId: run.id,
                postedById: actor.id,
                memo: `Kết chuyển doanh thu ngày ${date}`,
              });
            }

            // OTA commission accrual for room nights closed on this date.
            const nights = await tx.reservationNight.findMany({
              where: {
                businessDate: parseIsoDate(input.businessDate),
                commissionPosted: false,
                reservationRoom: { reservation: { propertyId: property.id } },
              },
              include: {
                reservationRoom: {
                  include: { reservation: { include: { channel: true } } },
                },
              },
            });
            for (const night of nights) {
              const channel = night.reservationRoom.reservation.channel;
              if (channel && channel.commissionPct.gt(0)) {
                const commission = commissionFor(night.total, channel.commissionPct);
                await this.posting.postCommission(tx, {
                  orgId: property.orgId,
                  propertyId: property.id,
                  businessDate: night.businessDate,
                  amount: commission,
                  channelId: channel.id,
                  reservationId: night.reservationRoom.reservation.id,
                  memo: `Hoa hồng ${channel.name} · ${night.reservationRoom.reservation.code}`,
                });
              }
              await tx.reservationNight.update({
                where: { id: night.id },
                data: { commissionPosted: true },
              });
            }

            const counts = await this.counts(tx, property.id, input.businessDate);
            return { postedNights, ...counts };
          },
          { timeout: 60_000, maxWait: 10_000 },
        );

        const revenue = await this.accounting.revenueSummary(
          property.id,
          input.businessDate,
          input.businessDate,
        );
        const payments = await this.paymentTotals(property.id, input.businessDate);
        const fullStats = {
          ...stats,
          roomRevenue: revenue.byDepartment.find((row) => row.department === 'ROOMS')?.amount ?? 0,
          fnbRevenue: revenue.byDepartment.find((row) => row.department === 'FNB')?.amount ?? 0,
          totalRevenue: revenue.total,
          taxes: revenue.taxes,
          serviceCharge: revenue.serviceCharge,
          commissions: revenue.commissions,
          netAfterCommission: revenue.netAfterCommission,
          payments,
          byDepartment: revenue.byDepartment,
          byChannel: revenue.byChannel,
        };

        await this.prisma.nightAudit.update({
          where: { id: run.id },
          data: { status: 'COMPLETED', completedAt: new Date(), stats: fullStats as Prisma.InputJsonValue },
        });

        await this.audit.record({
          orgId: actor.orgId,
          propertyId: property.id,
          actorId: actor.id,
          actorName: actor.fullName,
          actorRole: actor.roles[0]?.roleCode,
          action: 'night_audit.completed',
          entityType: 'NightAudit',
          entityId: run.id,
          after: {
            businessDate: input.businessDate,
            revenue: revenue.total,
            payments: payments.total,
            postedNights: stats.postedNights,
          },
        });
        this.realtime.emitToProperty(property.id, 'night_audit.completed', {
          businessDate: input.businessDate,
        });

        return this.report(actor, property.id, input.businessDate);
      } catch (error) {
        await this.prisma.nightAudit.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message.slice(0, 1000) : 'Lỗi không xác định',
          },
        });
        throw error;
      }
    });
  }

  async preview(propertyId: string, businessDate: string) {
    const counts = await this.prisma.$transaction((tx) => this.counts(tx, propertyId, businessDate));
    return { preview: true, businessDate, ...counts };
  }

  async report(actor: AuthUser, propertyId: string, businessDate: string) {
    assertPropertyAccess(actor, propertyId);
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy cơ sở', 404);

    const [auditRun, revenue, payments, sessions, exceptions, ledger] = await Promise.all([
      this.prisma.nightAudit.findUnique({
        where: { propertyId_businessDate: { propertyId, businessDate: parseIsoDate(businessDate) } },
      }),
      this.accounting.revenueSummary(propertyId, businessDate, businessDate),
      this.paymentTotals(propertyId, businessDate),
      this.prisma.cashSession.findMany({
        where: { propertyId, openedAt: { lte: new Date(`${businessDate}T23:59:59Z`) } },
        orderBy: { openedAt: 'desc' },
        take: 10,
      }),
      this.exceptions(propertyId, businessDate),
      this.ledgerHealth(propertyId, businessDate),
    ]);

    return {
      property: { id: property.id, name: property.name, code: property.code, currency: property.currency },
      businessDate,
      audit: auditRun
        ? {
            id: auditRun.id,
            status: auditRun.status,
            startedAt: auditRun.startedAt.toISOString(),
            completedAt: auditRun.completedAt?.toISOString() ?? null,
            stats: auditRun.stats,
            error: auditRun.error,
          }
        : null,
      revenue,
      payments,
      cashSessions: sessions.map((session) => ({
        id: session.id,
        code: session.code,
        status: session.status,
        expectedCash: moneyToJson(session.expectedCash),
        countedCash: session.countedCash === null ? null : moneyToJson(session.countedCash),
        variance: session.variance === null ? null : moneyToJson(session.variance),
      })),
      exceptions,
      ledger,
    };
  }

  async latest(actor: AuthUser, propertyId: string) {
    assertPropertyAccess(actor, propertyId);
    const runs = await this.prisma.nightAudit.findMany({
      where: { propertyId },
      orderBy: { businessDate: 'desc' },
      take: 14,
    });
    return runs.map((run) => ({
      id: run.id,
      businessDate: run.businessDate.toISOString().slice(0, 10),
      status: run.status,
      completedAt: run.completedAt?.toISOString() ?? null,
      stats: run.stats,
      error: run.error,
    }));
  }

  async reopen(actor: AuthUser, id: string, reason: string) {
    const run = await this.prisma.nightAudit.findUnique({ where: { id } });
    if (!run) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy lần kiểm toán', 404);
    assertPropertyAccess(actor, run.propertyId);
    if (run.status !== 'COMPLETED') {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Chỉ mở lại được ngày đã hoàn tất', 409);
    }
    const updated = await this.prisma.nightAudit.update({
      where: { id },
      data: { status: 'REOPENED', error: reason },
    });
    await this.audit.record({
      orgId: actor.orgId,
      propertyId: run.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'night_audit.reopened',
      entityType: 'NightAudit',
      entityId: id,
      reason,
      before: { businessDate: run.businessDate.toISOString().slice(0, 10), status: run.status },
    });
    return { id: updated.id, status: updated.status };
  }

  private async counts(tx: Prisma.TransactionClient, propertyId: string, businessDate: string) {
    const date = parseIsoDate(businessDate);
    const [rooms, nights, inHouse, arrivals, departures, dirty] = await Promise.all([
      tx.room.count({ where: { propertyId, isActive: true, status: { notIn: ['OUT_OF_ORDER', 'OUT_OF_SERVICE'] } } }),
      tx.reservationNight.count({ where: { businessDate: date, reservationRoom: { reservation: { propertyId } } } }),
      tx.reservation.count({ where: { propertyId, status: 'IN_HOUSE' } }),
      tx.reservation.count({ where: { propertyId, status: { in: ['CONFIRMED', 'PENDING'] }, checkIn: date } }),
      tx.reservation.count({ where: { propertyId, status: 'IN_HOUSE', checkOut: date } }),
      tx.room.count({ where: { propertyId, status: 'DIRTY' } }),
    ]);
    return {
      roomsAvailable: rooms,
      roomsSold: nights,
      occupancy: rooms > 0 ? Number(((nights / rooms) * 100).toFixed(2)) : 0,
      inHouse: inHouse,
      pendingArrivals: arrivals,
      pendingDepartures: departures,
      dirtyRooms: dirty,
    };
  }

  private async paymentTotals(propertyId: string, businessDate: string) {
    const rows = await this.prisma.payment.groupBy({
      by: ['method'],
      where: { propertyId, businessDate: parseIsoDate(businessDate), status: 'SUCCESS' },
      _sum: { amount: true },
    });
    const byMethod = rows.map((row) => ({ method: row.method, amount: moneyToJson(row._sum?.amount ?? 0) }));
    return {
      byMethod,
      total: Number(byMethod.reduce((acc, row) => acc + row.amount, 0).toFixed(2)),
    };
  }

  private async exceptions(propertyId: string, businessDate: string) {
    const [openFolios, pendingArrivals, pendingDepartures, unpostedNights, dirtyRooms] = await Promise.all([
      this.prisma.folio.findMany({
        where: { propertyId, balance: { gt: 0 }, status: { in: ['OPEN', 'SETTLED'] } },
        include: { guest: { select: { fullName: true } }, reservation: { select: { code: true } } },
        orderBy: { balance: 'desc' },
        take: 10,
      }),
      this.prisma.reservation.count({
        where: { propertyId, status: { in: ['CONFIRMED', 'PENDING'] }, checkIn: parseIsoDate(businessDate) },
      }),
      this.prisma.reservation.count({
        where: { propertyId, status: 'IN_HOUSE', checkOut: parseIsoDate(businessDate) },
      }),
      this.prisma.reservationNight.count({
        where: {
          postedFolioItemId: null,
          businessDate: { lte: parseIsoDate(businessDate) },
          reservationRoom: { reservation: { propertyId } },
        },
      }),
      this.prisma.room.count({ where: { propertyId, status: 'DIRTY' } }),
    ]);
    return {
      openFolios: openFolios.map((folio) => ({
        id: folio.id,
        number: folio.number,
        guest: folio.guest.fullName,
        reservationCode: folio.reservation?.code ?? null,
        balance: moneyToJson(folio.balance),
      })),
      pendingArrivals,
      pendingDepartures,
      unpostedNights,
      dirtyRooms,
    };
  }

  private async ledgerHealth(propertyId: string, businessDate: string) {
    const rows = await this.prisma.$queryRaw<Array<{ debit: Prisma.Decimal | null; credit: Prisma.Decimal | null }>>`
      SELECT SUM(jl."debit") AS debit, SUM(jl."credit") AS credit
        FROM "JournalLine" jl
        JOIN "JournalEntry" je ON je."id" = jl."entryId"
       WHERE je."propertyId" = ${propertyId}
         AND je."businessDate" <= ${businessDate}::date
    `;
    const debit = moneyToJson(rows[0]?.debit ?? 0);
    const credit = moneyToJson(rows[0]?.credit ?? 0);
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.5 };
  }
}
