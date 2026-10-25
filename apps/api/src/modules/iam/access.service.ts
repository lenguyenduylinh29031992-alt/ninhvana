import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  AppError,
  type RoleAssignment,
  type SessionProperty,
  type SessionUser,
} from '@grand-suite/shared';
import { PrismaService } from '../../common/prisma/prisma.module';

export interface AccessSnapshot {
  user: SessionUser;
  orgWide: boolean;
  roles: RoleAssignment[];
  permissions: string[];
}

/**
 * Resolves a user's effective access from the database.
 * Permissions come from RolePermission rows (not the static catalogue) so an
 * administrator can adjust a role without redeploying.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async buildAccess(userId: string): Promise<AccessSnapshot> {
    const record = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: { select: { code: true } } } },
              },
            },
            property: {
              select: {
                id: true,
                code: true,
                name: true,
                type: true,
                city: true,
                country: true,
                starRating: true,
                roomCount: true,
                currency: true,
                timezone: true,
                businessDayCutoff: true,
              },
            },
          },
          orderBy: { role: { level: 'desc' } },
        },
      },
    });

    if (!record) throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Tài khoản không tồn tại', 401);
    if (!record.isActive) {
      throw new AppError(ERROR_CODES.ACCOUNT_DISABLED, undefined, 403);
    }

    const orgWide = record.roles.some((assignment) => assignment.role.scope === 'ORG');

    const orgProperties = await this.prisma.property.findMany({
      where: { orgId: record.orgId, isActive: true },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        city: true,
        country: true,
        starRating: true,
        roomCount: true,
        currency: true,
        timezone: true,
        businessDayCutoff: true,
      },
    });

    const roles: RoleAssignment[] = record.roles.map((assignment) => ({
      propertyId: assignment.propertyId,
      roleCode: assignment.role.code,
    }));

    const permissionSet = new Set<string>();
    for (const assignment of record.roles) {
      for (const rolePermission of assignment.role.permissions) {
        permissionSet.add(rolePermission.permission.code);
      }
    }

    const scopedProperties = new Map<string, SessionProperty>();
    for (const assignment of record.roles) {
      if (assignment.property) scopedProperties.set(assignment.property.id, assignment.property);
    }

    const properties: SessionProperty[] = orgWide
      ? orgProperties
      : [...scopedProperties.values()].sort((a, b) => a.code.localeCompare(b.code));

    const user: SessionUser = {
      id: record.id,
      email: record.email,
      fullName: record.fullName,
      departmentCode: record.departmentCode,
      orgId: record.orgId,
      locale: record.locale === 'en' ? 'en' : 'vi',
      avatarUrl: record.avatarUrl,
      orgWide,
      roles,
      permissions: [...permissionSet].sort(),
      properties,
      lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
      twoFactorEnabled: record.twoFactorEnabled,
    };

    return { user, orgWide, roles, permissions: user.permissions as string[] };
  }

  async roleLevels(roleCodes: string[]): Promise<Map<string, number>> {
    const roles = await this.prisma.role.findMany({
      where: { code: { in: roleCodes } },
      select: { code: true, level: true },
    });
    return new Map(roles.map((role) => [role.code, role.level]));
  }
}
