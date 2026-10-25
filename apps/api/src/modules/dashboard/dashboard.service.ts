import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  AppError,
  addDays,
  addMonths,
  businessDateOf,
  parseIsoDate,
  percentChange,
  type DashboardOverview,
  type SystemStats,
} from '@grand-suite/shared';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.module';
import { AccountingService } from '../accounting/accounting.service';
import { HealthService } from '../health/health.service';
import { PropertiesService } from '../properties/properties.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly health: HealthService,
    private readonly accounting: AccountingService,
  ) {}

  async overview(actor: AuthUser, requestedPropertyId?: string | null): Promise<DashboardOverview> {
    const properties = await this.properties.list(actor, false);
    let selected = null as (typeof properties)[number] | null;

    if (requestedPropertyId) {
      selected = properties.find((property) => property.id === requestedPropertyId) ?? null;
      if (!selected) {
        throw new AppError(ERROR_CODES.PROPERTY_FORBIDDEN, 'Bạn không có quyền xem cơ sở này', 403);
      }
    } else if (!actor.orgWide) {
      selected = properties[0] ?? null;
    }

    const scope: DashboardOverview['scope'] = selected ? 'property' : 'portfolio';
    const propertyIds = selected ? [selected.id] : properties.map((property) => property.id);
    const timezone = selected?.timezone ?? 'Asia/Ho_Chi_Minh';
    const cutoffHour = selected?.businessDayCutoff ?? 6;
    const businessDate = businessDateOf(new Date(), { timeZone: timezone, cutoffHour });
    const yesterday = addDays(businessDate, -1);
    const monthStart = `${businessDate.slice(0, 7)}-01`;
    const prevMonthStart = addMonths(monthStart, -1);
    const prevMonthEnd = addDays(monthStart, -1);
    const trendStart = addDays(businessDate, -13);

    const inHouseWhere = {
      status: 'IN_HOUSE' as const,
      reservation: { propertyId: { in: propertyIds } },
    };

    const [
      rooms,
      inHouseRooms,
      arrivalsToday,
      departuresToday,
      dirtyRooms,
      openFolios,
      failedIntegrations,
      todayRevenue,
      monthRevenue,
      prevMonthRevenue,
      trend,
      activity,
      ratePlans,
      taxRates,
      health,
    ] = await Promise.all([
      this.prisma.room.findMany({
        where: { propertyId: { in: propertyIds }, isActive: true },
        select: { status: true },
      }),
      this.prisma.reservationRoom.findMany({
        where: inHouseWhere,
        include: { reservation: { select: { nights: true, adults: true, children: true } } },
      }),
      this.prisma.reservation.count({
        where: { propertyId: { in: propertyIds }, status: { in: ['CONFIRMED', 'PENDING', 'IN_HOUSE'] }, checkIn: parseIsoDate(businessDate) },
      }),
      this.prisma.reservation.count({
        where: { propertyId: { in: propertyIds }, status: 'IN_HOUSE', checkOut: parseIsoDate(businessDate) },
      }),
      this.prisma.room.count({ where: { propertyId: { in: propertyIds }, status: 'DIRTY' } }),
      this.prisma.folio.count({ where: { propertyId: { in: propertyIds }, balance: { gt: 0 }, status: 'OPEN' } }),
      this.prisma.integrationConfig.count({ where: { orgId: actor.orgId, status: 'ERROR' } }),
      this.accounting.revenueSummary(propertyIds[0]!, businessDate, businessDate),
      this.accounting.revenueSummary(propertyIds[0]!, monthStart, businessDate),
      this.accounting.revenueSummary(propertyIds[0]!, prevMonthStart, prevMonthEnd),
      this.accounting.revenueTrend(propertyIds, trendStart, businessDate),
      this.prisma.auditLog.findMany({
        where: {
          orgId: actor.orgId,
          NOT: { action: { startsWith: 'auth.login' } },
          ...(selected
            ? { OR: [{ propertyId: selected.id }, { propertyId: null }] }
            : { OR: [{ propertyId: { in: propertyIds } }, { propertyId: null }] }),
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          actorName: true,
          propertyId: true,
          reason: true,
          createdAt: true,
        },
      }),
      this.prisma.ratePlan.count({ where: { propertyId: { in: propertyIds }, isActive: true } }),
      this.prisma.taxRate.count({ where: { orgId: actor.orgId, isActive: true } }),
      this.health.check(),
    ]);

    // Portfolio totals must aggregate every property, not just the first one.
    const portfolioRevenue = async (from: string, to: string) => {
      if (propertyIds.length <= 1) return null;
      const summaries = await Promise.all(
        propertyIds.map((propertyId) => this.accounting.revenueSummary(propertyId, from, to)),
      );
      const departmentTotals = new Map<string, number>();
      const channelTotals = new Map<string, { channelId: string | null; channelCode: string; channelName: string; amount: number }>();
      let total = 0;
      let taxes = 0;
      let serviceCharge = 0;
      let commissions = 0;
      for (const summary of summaries) {
        total += summary.total;
        taxes += summary.taxes;
        serviceCharge += summary.serviceCharge;
        commissions += summary.commissions;
        for (const row of summary.byDepartment) {
          departmentTotals.set(row.department, (departmentTotals.get(row.department) ?? 0) + row.amount);
        }
        for (const row of summary.byChannel) {
          const current = channelTotals.get(row.channelCode) ?? { ...row, amount: 0 };
          current.amount += row.amount;
          channelTotals.set(row.channelCode, current);
        }
      }
      return {
        total,
        taxes,
        serviceCharge,
        commissions,
        byDepartment: [...departmentTotals.entries()].map(([department, amount]) => ({ department, amount })),
        byChannel: [...channelTotals.values()],
      };
    };

    const monthForScope =
      (await portfolioRevenue(monthStart, businessDate)) ??
      monthRevenue;
    const todayForScope =
      (await portfolioRevenue(businessDate, businessDate)) ??
      todayRevenue;
    const prevMonthForScope =
      (await portfolioRevenue(prevMonthStart, prevMonthEnd)) ??
      prevMonthRevenue;
    const availableRooms = rooms.filter((room) => !['OUT_OF_ORDER', 'OUT_OF_SERVICE'].includes(room.status)).length;
    const roomsSold = inHouseRooms.length;
    const inHouseGuests = inHouseRooms.reduce(
      (acc, room) => acc + (room.reservation?.adults ?? 0) + (room.reservation?.children ?? 0),
      0,
    );
    const projectedRoomRevenue = inHouseRooms.reduce((acc, room) => acc + Number(room.nightlyRate), 0);
    const occupancy = availableRooms > 0 ? Number(((roomsSold / availableRooms) * 100).toFixed(2)) : 0;
    const adr = roomsSold > 0 ? Number((projectedRoomRevenue / roomsSold).toFixed(2)) : 0;
    const revpar = availableRooms > 0 ? Number((projectedRoomRevenue / availableRooms).toFixed(2)) : 0;
    const trevpar = availableRooms > 0 ? Number((todayForScope.total / availableRooms).toFixed(2)) : 0;
    const alos =
      inHouseRooms.length > 0
        ? Number(
            (
              inHouseRooms.reduce((acc, room) => acc + (room.reservation?.nights ?? 1), 0) / inHouseRooms.length
            ).toFixed(2),
          )
        : 0;

    const yesterdayNights = await this.prisma.reservationNight.findMany({
      where: {
        businessDate: parseIsoDate(yesterday),
        reservationRoom: {
          reservation: { propertyId: { in: propertyIds }, status: { in: ['IN_HOUSE', 'CHECKED_OUT'] } },
        },
      },
      select: { rate: true },
    });
    const yesterdayRoomsSold = yesterdayNights.length;
    const yesterdayRoomRevenue = yesterdayNights.reduce((acc, night) => acc + Number(night.rate), 0);
    const yesterdayOccupancy = availableRooms > 0 ? (yesterdayRoomsSold / availableRooms) * 100 : 0;
    const yesterdayAdr = yesterdayRoomsSold > 0 ? yesterdayRoomRevenue / yesterdayRoomsSold : 0;

    const departmentMap = new Map<string, number>();
    for (const row of monthForScope.byDepartment) {
      departmentMap.set(row.department, (departmentMap.get(row.department) ?? 0) + row.amount);
    }
    const channelMap = new Map<string, { channelCode: string; channelName: string; amount: number }>();
    for (const row of monthForScope.byChannel) {
      const current = channelMap.get(row.channelCode) ?? {
        channelCode: row.channelCode,
        channelName: row.channelName,
        amount: 0,
      };
      current.amount += row.amount;
      channelMap.set(row.channelCode, current);
    }

    const propertyCards = await Promise.all(
      properties.map(async (property) => {
        const [month, today, house, propertyRooms] = await Promise.all([
          this.accounting.revenueSummary(property.id, monthStart, businessDate),
          this.accounting.revenueSummary(property.id, businessDate, businessDate),
          this.prisma.reservationRoom.count({
            where: { status: 'IN_HOUSE', reservation: { propertyId: property.id } },
          }),
          this.prisma.room.count({
            where: {
              propertyId: property.id,
              isActive: true,
              status: { notIn: ['OUT_OF_ORDER', 'OUT_OF_SERVICE'] },
            },
          }),
        ]);
        return {
          id: property.id,
          code: property.code,
          name: property.name,
          type: property.type,
          city: property.city,
          country: property.country,
          starRating: property.starRating,
          roomCount: property.roomCount,
          currency: property.currency,
          timezone: property.timezone,
          businessDayCutoff: property.businessDayCutoff,
          isActive: property.isActive,
          logoUrl: property.logoUrl,
          rooms: property.rooms,
          activeUsers: property.activeUsers,
          revenueMonth: month.total,
          revenueToday: today.total,
          occupancy: propertyRooms > 0 ? Number(((house / propertyRooms) * 100).toFixed(2)) : 0,
          inHouse: house,
        };
      }),
    );

    const pendingTasks: DashboardOverview['pendingTasks'] = [];
    if (ratePlans === 0) {
      pendingTasks.push({ key: 'setup.ratePlans', label: 'Chưa cấu hình gói giá', count: 1, href: '/settings' });
    }
    if (taxRates === 0) {
      pendingTasks.push({ key: 'setup.taxRates', label: 'Chưa cấu hình biểu thuế', count: 1, href: '/settings' });
    }
    if (failedIntegrations > 0) {
      pendingTasks.push({
        key: 'integration.errors',
        label: 'Kết nối tích hợp đang lỗi',
        count: failedIntegrations,
        href: '/settings/integrations',
      });
    }
    if (arrivalsToday > 0) {
      pendingTasks.push({ key: 'frontdesk.arrivals', label: 'Khách chờ nhận phòng', count: arrivalsToday, href: '/front-desk' });
    }
    if (departuresToday > 0) {
      pendingTasks.push({ key: 'frontdesk.departures', label: 'Khách dự kiến trả phòng', count: departuresToday, href: '/front-desk' });
    }
    if (openFolios > 0) {
      pendingTasks.push({ key: 'cashier.openFolios', label: 'Folio còn số dư', count: openFolios, href: '/front-desk' });
    }
    if (dirtyRooms > 0) {
      pendingTasks.push({ key: 'housekeeping.dirty', label: 'Phòng cần dọn', count: dirtyRooms, href: '/housekeeping' });
    }

    return {
      businessDate,
      generatedAt: new Date().toISOString(),
      property: selected
        ? {
            id: selected.id,
            code: selected.code,
            name: selected.name,
            type: selected.type,
            city: selected.city,
            country: selected.country,
            starRating: selected.starRating,
            roomCount: selected.roomCount,
            currency: selected.currency,
            timezone: selected.timezone,
            businessDayCutoff: selected.businessDayCutoff,
            isActive: selected.isActive,
            logoUrl: selected.logoUrl,
          }
        : null,
      scope,
      metrics: {
        roomsAvailable: availableRooms,
        roomsSold,
        occupancy,
        occupancyChangePct: percentChange(occupancy, yesterdayOccupancy),
        revenueToday: todayForScope.total,
        revenueMonth: monthForScope.total,
        revenuePrevMonth: prevMonthForScope.total,
        revenueChangePct: percentChange(monthForScope.total, prevMonthForScope.total),
        adr,
        adrChangePct: percentChange(adr, yesterdayAdr),
        revpar,
        trevpar,
        alos,
        inHouseGuests,
        arrivalsToday,
        departuresToday,
        staffOnDuty: 0,
      },
      properties: propertyCards,
      byDepartment: [...departmentMap.entries()]
        .map(([department, amount]) => ({ department, amount: Number(amount.toFixed(2)) }))
        .sort((a, b) => b.amount - a.amount),
      byChannel: [...channelMap.values()]
        .map((row) => ({ ...row, amount: Number(row.amount.toFixed(2)) }))
        .sort((a, b) => b.amount - a.amount),
      trend: trend.map((point) => ({ date: point.date, revenue: point.amount })),
      hasRevenueData: monthForScope.total > 0 || todayForScope.total > 0,
      hasStaffData: false,
      activity: activity.map((item) => ({
        id: item.id,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        actorName: item.actorName,
        propertyId: item.propertyId,
        reason: item.reason,
        createdAt: item.createdAt.toISOString(),
      })),
      health,
      pendingTasks,
    };
  }

  async stats(actor: AuthUser): Promise<SystemStats> {
    const properties = await this.properties.list(actor, false);
    const propertyIds = properties.map((property) => property.id);

    const [rooms, users, roles, auditEvents, currencies, taxRates, ratePlans, outlets] =
      await Promise.all([
        this.prisma.room.count({ where: { propertyId: { in: propertyIds }, isActive: true } }),
        this.prisma.user.count({ where: { orgId: actor.orgId, isActive: true } }),
        this.prisma.role.count(),
        this.prisma.auditLog.count({
          where: {
            orgId: actor.orgId,
            ...(actor.orgWide ? {} : { propertyId: { in: propertyIds } }),
          },
        }),
        this.prisma.currency.count(),
        this.prisma.taxRate.count({ where: { orgId: actor.orgId } }),
        this.prisma.ratePlan.count({ where: { propertyId: { in: propertyIds } } }),
        this.prisma.outlet.count({ where: { propertyId: { in: propertyIds } } }),
      ]);

    return {
      properties: properties.length,
      rooms,
      users,
      roles,
      auditEvents,
      currencies,
      taxRates,
      ratePlans,
      outlets,
    };
  }
}
