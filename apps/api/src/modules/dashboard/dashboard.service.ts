import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  AppError,
  businessDateOf,
  type DashboardOverview,
  type SystemStats,
} from '@grand-suite/shared';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.module';
import { HealthService } from '../health/health.service';
import { PropertiesService } from '../properties/properties.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly health: HealthService,
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

    const [rooms, activity, ratePlans, taxRates, failedIntegrations, health] = await Promise.all([
      this.prisma.room.findMany({
        where: { propertyId: { in: propertyIds }, isActive: true },
        select: { status: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          orgId: actor.orgId,
          // Routine sign-ins live in the audit log; the dashboard shows business events.
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
      this.prisma.integrationConfig.count({
        where: { orgId: actor.orgId, status: 'ERROR' },
      }),
      this.health.check(),
    ]);

    const roomsAvailable = rooms.filter((room) => room.status !== 'OUT_OF_ORDER').length;

    const pendingTasks: DashboardOverview['pendingTasks'] = [];
    if (ratePlans === 0) {
      pendingTasks.push({
        key: 'setup.ratePlans',
        label: 'Chưa cấu hình gói giá',
        count: 1,
        href: '/settings',
      });
    }
    if (taxRates === 0) {
      pendingTasks.push({
        key: 'setup.taxRates',
        label: 'Chưa cấu hình biểu thuế',
        count: 1,
        href: '/settings',
      });
    }
    if (failedIntegrations > 0) {
      pendingTasks.push({
        key: 'integration.errors',
        label: 'Kết nối tích hợp đang lỗi',
        count: failedIntegrations,
        href: '/settings/integrations',
      });
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
        roomsAvailable,
        roomsSold: 0,
        occupancy: 0,
        revenueToday: 0,
        revenueMonth: 0,
        adr: 0,
        revpar: 0,
        inHouseGuests: 0,
        arrivalsToday: 0,
        departuresToday: 0,
        staffOnDuty: 0,
      },
      properties: properties.map((property) => ({
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
      })),
      hasRevenueData: false,
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
