import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { daysBetween, isoToday, parseIsoDate } from '@grand-suite/shared';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.module';
import { FinanceService } from '../finance/finance.service';
import { PropertiesService } from '../properties/properties.service';
import { forecastRevenue, type MonthlyPoint } from './forecast';

interface CacheEntry { expires: number; payload: Awaited<ReturnType<ConsolidatedService['build']>> }

@Injectable()
export class ConsolidatedService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly finance: FinanceService,
  ) {}

  async get(actor: AuthUser, requestedPropertyId?: string | null) {
    const key = `${actor.orgId}:${requestedPropertyId ?? 'ALL'}`;
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return { ...hit.payload, cached: true };
    const started = Date.now();
    const payload = await this.build(actor, requestedPropertyId);
    payload.tookMs = Date.now() - started;
    this.cache.set(key, { expires: Date.now() + 60_000, payload });
    return { ...payload, cached: false };
  }

  async build(actor: AuthUser, requestedPropertyId?: string | null) {
    const all = await this.properties.list(actor, false);
    const selected = requestedPropertyId ? all.filter((property) => property.id === requestedPropertyId) : all;
    const hotelIds = selected.filter((property) => property.type === 'HOTEL').map((property) => property.id);
    if (hotelIds.length === 0) throw new Error('Không có khách sạn trong phạm vi');
    const today = isoToday();
    const from = `${today.slice(0, 7)}-01`;
    const days = Math.max(1, daysBetween(from, today) + 1);

    const [rooms, nights, financeResults, ar, ap, revenueSummaries] = await Promise.all([
      this.prisma.room.findMany({ where: { propertyId: { in: hotelIds }, isActive: true }, select: { propertyId: true } }),
      this.prisma.reservationNight.findMany({
        where: { businessDate: { gte: parseIsoDate(from), lte: parseIsoDate(today) }, reservationRoom: { reservation: { propertyId: { in: hotelIds }, status: { in: ['IN_HOUSE', 'CHECKED_OUT'] } } } },
        select: { rate: true, reservationRoom: { select: { reservation: { select: { propertyId: true } } } } },
      }),
      Promise.all(hotelIds.map((propertyId) => this.finance.profitAndLoss(actor, propertyId, from, today))),
      Promise.all(hotelIds.map((propertyId) => this.finance.arAging(actor, propertyId, today))),
      Promise.all(hotelIds.map((propertyId) => this.finance.apAging(actor, propertyId, today))),
      Promise.all(hotelIds.map((propertyId) => this.prisma.$queryRaw<Array<{ channelCode: string | null; channelName: string | null; amount: Prisma.Decimal }>>`
        SELECT ch."code" AS "channelCode", ch."name" AS "channelName", SUM(jl."credit" - jl."debit") AS amount
          FROM "JournalLine" jl JOIN "JournalEntry" je ON je."id" = jl."entryId"
          JOIN "GlAccount" ga ON ga."orgId" = je."orgId" AND ga."code" = jl."accountCode"
          LEFT JOIN "Channel" ch ON ch."id" = jl."channelId"
         WHERE je."propertyId" = ${propertyId} AND je."businessDate" >= ${from}::date AND je."businessDate" <= ${today}::date AND ga."type" = 'REVENUE'
         GROUP BY ch."code", ch."name"
      `)),
    ]);

    const monthlyRows = await this.prisma.$queryRaw<Array<{ month: string; revenue: Prisma.Decimal; cost: Prisma.Decimal }>>`
      SELECT to_char(je."businessDate", 'YYYY-MM') AS month,
             SUM(CASE WHEN ga."type" = 'REVENUE' THEN jl."credit" - jl."debit" ELSE 0 END) AS revenue,
             SUM(CASE WHEN ga."type" IN ('COGS','EXPENSE') THEN jl."debit" - jl."credit" ELSE 0 END) AS cost
        FROM "JournalLine" jl JOIN "JournalEntry" je ON je."id" = jl."entryId"
        JOIN "GlAccount" ga ON ga."orgId" = je."orgId" AND ga."code" = jl."accountCode"
       WHERE je."propertyId" IN (${Prisma.join(hotelIds)})
       GROUP BY month ORDER BY month ASC
    `;
    const monthly: MonthlyPoint[] = monthlyRows.map((row) => ({ month: row.month, revenue: Number(row.revenue) }));
    const monthlyGop = monthlyRows.map((row) => ({ month: row.month, revenue: Number(row.revenue), gop: Number(row.revenue) - Number(row.cost) }));

    const revenue = financeResults.reduce((sum, row) => sum + row.revenue, 0);
    const gop = financeResults.reduce((sum, row) => sum + row.gop, 0);
    const payroll = financeResults.reduce((sum, row) => sum + row.payroll, 0);
    const netProfit = financeResults.reduce((sum, row) => sum + row.netProfit, 0);
    const roomCount = rooms.length;
    const available = roomCount * days;
    const sold = nights.length;
    const roomRevenue = Number(nights.reduce((sum, night) => sum + Number(night.rate), 0));
    const occupancy = available > 0 ? (sold / available) * 100 : 0;
    const adr = sold > 0 ? roomRevenue / sold : 0;
    const revPar = available > 0 ? roomRevenue / available : 0;
    const gopPar = available > 0 ? gop / available : 0;

    const channelMap = new Map<string, { code: string; name: string; amount: number }>();
    for (const rows of revenueSummaries) {
      for (const row of rows) {
        const key = row.channelCode ?? 'DIRECT';
        const current = channelMap.get(key) ?? { code: key, name: row.channelName ?? 'Trực tiếp', amount: 0 };
        current.amount += Number(row.amount);
        channelMap.set(key, current);
      }
    }

    const byProperty = await Promise.all(selected.filter((property) => property.type === 'HOTEL').map(async (property, index) => {
      const result = financeResults[index]!;
      const propertyNights = nights.filter((night) => night.reservationRoom.reservation.propertyId === property.id).length;
      const propertyRooms = rooms.filter((room) => room.propertyId === property.id).length;
      return {
        id: property.id, code: property.code, name: property.name, city: property.city,
        revenue: result.revenue, gop: result.gop, gopPar: result.gopPar,
        occupancy: propertyRooms > 0 ? Number(((propertyNights / (propertyRooms * days)) * 100).toFixed(1)) : 0,
        rooms: propertyRooms, sold: propertyNights,
      };
    }));

    const completeMonths = monthly.filter((point) => point.month < today.slice(0, 7));
    const forecast = forecastRevenue(completeMonths.slice(-24), 6);
    return {
      scope: requestedPropertyId ? all.find((property) => property.id === requestedPropertyId)?.name ?? 'Cơ sở' : 'Toàn tập đoàn',
      period: { from, to: today, days },
      generatedAt: new Date().toISOString(),
      tookMs: 0,
      cached: false,
      metrics: {
        revenue: Math.round(revenue), gop: Math.round(gop), gopPar: Math.round(gopPar), revPar: Math.round(revPar),
        netProfit: Math.round(netProfit), payroll: Math.round(payroll),
        occupancy: Number(occupancy.toFixed(1)), adr: Math.round(adr),
        roomsAvailable: available, roomsSold: sold, roomCount,
        ar: Math.round(ar.reduce((sum, row) => sum + row.total, 0)),
        ap: Math.round(ap.reduce((sum, row) => sum + row.total, 0)),
      },
      monthly: monthlyGop.slice(-24),
      forecast,
      channels: [...channelMap.values()].sort((a, b) => b.amount - a.amount),
      byProperty,
    };
  }
}
