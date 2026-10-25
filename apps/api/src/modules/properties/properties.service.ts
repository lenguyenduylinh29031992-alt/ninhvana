import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  AppError,
  type Paginated,
  type PropertySummary,
} from '@grand-suite/shared';
import type { CreatePropertyInput } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { accessiblePropertyIds, assertPropertyAccess } from '../../common/auth/property-access';
import { PrismaService } from '../../common/prisma/prisma.module';

export interface PropertyWithStats extends PropertySummary {
  rooms: number;
  activeUsers: number;
  departments: number;
  outlets: number;
}

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthUser, includeInactive = false): Promise<PropertyWithStats[]> {
    const scopedIds = accessiblePropertyIds(actor);
    const where = {
      orgId: actor.orgId,
      ...(includeInactive ? {} : { isActive: true }),
      ...(actor.orgWide ? {} : { id: { in: scopedIds } }),
    };

    const properties = await this.prisma.property.findMany({
      where,
      orderBy: [{ roomCount: 'desc' }, { code: 'asc' }],
      include: {
        _count: { select: { rooms: true, departments: true, outlets: true } },
      },
    });

    const activeAssignments = await this.prisma.userPropertyRole.findMany({
      where: { propertyId: { in: properties.map((property) => property.id) }, user: { isActive: true } },
      select: { propertyId: true, userId: true },
    });
    const activeUsersByProperty = new Map<string, Set<string>>();
    for (const assignment of activeAssignments) {
      if (!assignment.propertyId) continue;
      const set = activeUsersByProperty.get(assignment.propertyId) ?? new Set<string>();
      set.add(assignment.userId);
      activeUsersByProperty.set(assignment.propertyId, set);
    }

    return properties.map((property) => ({
      ...this.toSummary(property),
      rooms: property._count.rooms,
      departments: property._count.departments,
      outlets: property._count.outlets,
      activeUsers: activeUsersByProperty.get(property.id)?.size ?? 0,
    }));
  }

  async get(actor: AuthUser, id: string): Promise<PropertyWithStats> {
    const property = await this.prisma.property.findFirst({
      where: { id, orgId: actor.orgId },
      include: { _count: { select: { rooms: true, departments: true, outlets: true } } },
    });
    if (!property) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy cơ sở', 404);
    assertPropertyAccess(actor, property.id);
    const activeUsers = await this.prisma.userPropertyRole.findMany({
      where: { propertyId: id, user: { isActive: true } },
      select: { userId: true },
    });
    return {
      ...this.toSummary(property),
      rooms: property._count.rooms,
      departments: property._count.departments,
      outlets: property._count.outlets,
      activeUsers: new Set(activeUsers.map((row) => row.userId)).size,
    };
  }

  async create(actor: AuthUser, input: CreatePropertyInput): Promise<PropertyWithStats> {
    const existing = await this.prisma.property.findUnique({
      where: { orgId_code: { orgId: actor.orgId, code: input.code } },
    });
    if (existing) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Mã cơ sở đã tồn tại', 409);
    }

    const property = await this.prisma.property.create({
      data: {
        orgId: actor.orgId,
        code: input.code,
        name: input.name,
        legalName: input.legalName,
        type: input.type,
        starRating: input.starRating,
        address: input.address,
        city: input.city,
        country: input.country,
        phone: input.phone,
        email: input.email,
        timezone: input.timezone,
        currency: input.currency,
        roomCount: input.roomCount,
        checkInTime: input.checkInTime,
        checkOutTime: input.checkOutTime,
        businessDayCutoff: input.businessDayCutoff,
        pricesIncludeTax: input.pricesIncludeTax,
        serviceChargePct: input.serviceChargePct,
        taxCode: input.taxCode,
        isActive: input.isActive,
      },
      include: { _count: { select: { rooms: true, departments: true, outlets: true } } },
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: property.id,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'property.created',
      entityType: 'Property',
      entityId: property.id,
      after: { code: property.code, name: property.name, type: property.type },
    });

    return {
      ...this.toSummary(property),
      rooms: property._count.rooms,
      departments: property._count.departments,
      outlets: property._count.outlets,
      activeUsers: 0,
    };
  }

  async update(
    actor: AuthUser,
    id: string,
    input: Partial<Omit<CreatePropertyInput, 'code'>>,
  ): Promise<PropertyWithStats> {
    const existing = await this.prisma.property.findFirst({ where: { id, orgId: actor.orgId } });
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy cơ sở', 404);
    assertPropertyAccess(actor, existing.id);

    const unchanged = Object.entries(input).every(([key, value]) => {
      const current = (existing as unknown as Record<string, unknown>)[key];
      return value === undefined || String(current) === String(value);
    });
    if (unchanged) return this.get(actor, id);

    const updated = await this.prisma.property.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
        ...(input.starRating !== undefined ? { starRating: input.starRating } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.roomCount !== undefined ? { roomCount: input.roomCount } : {}),
        ...(input.checkInTime !== undefined ? { checkInTime: input.checkInTime } : {}),
        ...(input.checkOutTime !== undefined ? { checkOutTime: input.checkOutTime } : {}),
        ...(input.businessDayCutoff !== undefined
          ? { businessDayCutoff: input.businessDayCutoff }
          : {}),
        ...(input.pricesIncludeTax !== undefined
          ? { pricesIncludeTax: input.pricesIncludeTax }
          : {}),
        ...(input.serviceChargePct !== undefined
          ? { serviceChargePct: input.serviceChargePct }
          : {}),
        ...(input.taxCode !== undefined ? { taxCode: input.taxCode } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { _count: { select: { rooms: true, departments: true, outlets: true } } },
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: id,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'property.updated',
      entityType: 'Property',
      entityId: id,
      before: { name: existing.name, serviceChargePct: existing.serviceChargePct },
      after: { name: updated.name, serviceChargePct: updated.serviceChargePct },
    });

    return {
      ...this.toSummary(updated),
      rooms: updated._count.rooms,
      departments: updated._count.departments,
      outlets: updated._count.outlets,
      activeUsers: 0,
    };
  }

  private toSummary(property: {
    id: string;
    code: string;
    name: string;
    type: string;
    city: string;
    country: string;
    starRating: number | null;
    roomCount: number;
    currency: string;
    timezone: string;
    businessDayCutoff: number;
    isActive: boolean;
    logoUrl: string | null;
  }): PropertySummary {
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
    };
  }
}

export type { Paginated };
