import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  PERMISSIONS,
  ROLE_MAP,
  AppError,
  type Paginated,
  type UserRecord,
} from '@grand-suite/shared';
import type { CreateUserInput, UpdateUserInput } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import { hashPassword } from '../../common/auth/password';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.module';

interface ListUsersParams {
  page: number;
  pageSize: number;
  q?: string;
  roleCode?: string;
  propertyId?: string;
  isActive?: boolean;
}

interface RoleWithPermissions {
  code: string;
  name: string;
  nameEn: string;
  description: string | null;
  scope: string;
  level: number;
  permissions: Array<{ id: string; code: string; category: string }>;
  userCount: number;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthUser, params: ListUsersParams): Promise<Paginated<UserRecord>> {
    const accessible = actor.roles
      .map((role) => role.propertyId)
      .filter((id): id is string => Boolean(id));

    const where = {
      orgId: actor.orgId,
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.q
        ? {
            OR: [
              { fullName: { contains: params.q, mode: 'insensitive' as const } },
              { email: { contains: params.q, mode: 'insensitive' as const } },
              { phone: { contains: params.q } },
            ],
          }
        : {}),
      ...(params.roleCode ? { roles: { some: { role: { code: params.roleCode } } } } : {}),
      ...(params.propertyId
        ? { roles: { some: { propertyId: params.propertyId } } }
        : actor.orgWide
          ? {}
          : { roles: { some: { propertyId: { in: accessible } } } }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: {
          roles: { include: { role: true, property: { select: { name: true } } } },
        },
        orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: rows.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        locale: user.locale,
        avatarUrl: user.avatarUrl,
        isActive: user.isActive,
        twoFactorEnabled: user.twoFactorEnabled,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        roles: user.roles.map((assignment) => ({
          id: assignment.id,
          propertyId: assignment.propertyId,
          roleCode: assignment.role.code,
          propertyName: assignment.property?.name ?? null,
        })),
      })),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  async get(actor: AuthUser, id: string): Promise<UserRecord> {
    const user = await this.prisma.user.findFirst({
      where: { id, orgId: actor.orgId },
      include: { roles: { include: { role: true, property: { select: { name: true } } } } },
    });
    if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy người dùng', 404);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      locale: user.locale,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      twoFactorEnabled: user.twoFactorEnabled,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      roles: user.roles.map((assignment) => ({
        id: assignment.id,
        propertyId: assignment.propertyId,
        roleCode: assignment.role.code,
        propertyName: assignment.property?.name ?? null,
      })),
    };
  }

  async create(actor: AuthUser, input: CreateUserInput): Promise<UserRecord> {
    await this.assertRoleAuthority(actor, input.roles.map((role) => role.roleCode));
    await this.assertScopeAuthority(actor, input.roles.map((role) => role.propertyId ?? null));

    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Email này đã được sử dụng', 409);
    }

    const { roleIdByCode, propertyIds } = await this.resolveAssignments(actor.orgId, input.roles);
    const passwordHash = await hashPassword(input.password);

    const user = await this.prisma.user.create({
      data: {
        orgId: actor.orgId,
        email: input.email,
        fullName: input.fullName,
        phone: input.phone,
        locale: input.locale,
        avatarUrl: input.avatarUrl,
        isActive: input.isActive,
        passwordHash,
        roles: {
          create: input.roles.map((role) => ({
            roleId: roleIdByCode.get(role.roleCode)!,
            propertyId: role.propertyId ?? null,
            isPrimary: false,
          })),
        },
      },
      include: { roles: { include: { role: true, property: { select: { name: true } } } } },
    });

    await this.audit.record({
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'iam.user_created',
      entityType: 'User',
      entityId: user.id,
      after: {
        email: user.email,
        fullName: user.fullName,
        roles: user.roles.map((assignment) => ({
          role: assignment.role.code,
          propertyId: assignment.propertyId,
        })),
        propertyIds,
      },
    });

    return this.get(actor, user.id);
  }

  async update(actor: AuthUser, id: string, input: UpdateUserInput): Promise<UserRecord> {
    const target = await this.prisma.user.findFirst({
      where: { id, orgId: actor.orgId },
      include: { roles: { include: { role: true } } },
    });
    if (!target) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy người dùng', 404);
    await this.assertCanManageTarget(actor, target.roles.map((assignment) => assignment.role.level));

    if (input.roles) {
      await this.assertRoleAuthority(actor, input.roles.map((role) => role.roleCode));
      await this.assertScopeAuthority(actor, input.roles.map((role) => role.propertyId ?? null));
    }

    let roleIdByCode = new Map<string, string>();
    if (input.roles) {
      const resolved = await this.resolveAssignments(actor.orgId, input.roles);
      roleIdByCode = resolved.roleIdByCode;
    }

    const before = {
      fullName: target.fullName,
      phone: target.phone,
      locale: target.locale,
      isActive: target.isActive,
      roles: target.roles.map((assignment) => ({
        roleCode: assignment.role.code,
        propertyId: assignment.propertyId,
      })),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.locale !== undefined ? { locale: input.locale } : {}),
          ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      if (input.roles) {
        await tx.userPropertyRole.deleteMany({ where: { userId: id } });
        if (input.roles.length > 0) {
          await tx.userPropertyRole.createMany({
            data: input.roles.map((role) => ({
              userId: id,
              roleId: roleIdByCode.get(role.roleCode)!,
              propertyId: role.propertyId ?? null,
            })),
            skipDuplicates: true,
          });
        }
      }
      if (input.isActive === false) {
        // Deactivating a user must invalidate every live session immediately.
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id },
        include: { roles: { include: { role: true, property: { select: { name: true } } } } },
      });
    });

    await this.audit.record({
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'iam.user_updated',
      entityType: 'User',
      entityId: id,
      before,
      after: {
        fullName: updated.fullName,
        phone: updated.phone,
        locale: updated.locale,
        isActive: updated.isActive,
        roles: updated.roles.map((assignment) => ({
          roleCode: assignment.role.code,
          propertyId: assignment.propertyId,
        })),
      },
    });

    return this.get(actor, id);
  }

  async resetPassword(
    actor: AuthUser,
    id: string,
    newPassword: string,
    reason?: string,
  ): Promise<{ success: true }> {
    const target = await this.prisma.user.findFirst({
      where: { id, orgId: actor.orgId },
      include: { roles: { include: { role: true } } },
    });
    if (!target) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy người dùng', 404);
    await this.assertCanManageTarget(actor, target.roles.map((assignment) => assignment.role.level));

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'iam.password_reset',
      entityType: 'User',
      entityId: id,
      reason: reason ?? 'Đặt lại mật khẩu bởi quản trị viên',
      metadata: { targetEmail: target.email },
    });
    return { success: true };
  }

  async listRoles(actor: AuthUser): Promise<RoleWithPermissions[]> {
    const roles = await this.prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: [{ level: 'desc' }, { code: 'asc' }],
    });
    void actor;
    return roles.map((role) => ({
      code: role.code,
      name: role.name,
      nameEn: role.nameEn,
      description: role.description,
      scope: role.scope,
      level: role.level,
      permissions: role.permissions.map((rp) => ({
        id: rp.permission.id,
        code: rp.permission.code,
        category: rp.permission.category,
      })),
      userCount: role._count.assignments,
    }));
  }

  async listPermissions() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
    return permissions.map((permission) => ({
      code: permission.code,
      resource: permission.resource,
      action: permission.action,
      category: permission.category,
      description: permission.description,
    }));
  }

  async updateRolePermissions(
    actor: AuthUser,
    roleCode: string,
    permissionCodes: string[],
    reason: string,
  ) {
    const role = await this.prisma.role.findUnique({
      where: { code: roleCode },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy vai trò', 404);
    if (role.code === 'SUPER_ADMIN') {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        'Không thể thay đổi quyền của vai trò Quản trị hệ thống',
        403,
      );
    }
    if (!reason || reason.trim().length < 5) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Vui lòng nhập lý do thay đổi quyền', 422);
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
      select: { id: true, code: true },
    });
    if (permissions.length !== new Set(permissionCodes).size) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Một số quyền không tồn tại', 422);
    }

    const before = role.permissions.map((rp) => rp.permission.code).sort();
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
          })),
        });
      }
    });

    await this.audit.record({
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'iam.role_permissions_updated',
      entityType: 'Role',
      entityId: role.id,
      reason,
      before: { permissions: before },
      after: { permissions: [...new Set(permissionCodes)].sort() },
    });

    return { success: true, permissions: [...new Set(permissionCodes)].sort() };
  }

  private async resolveAssignments(
    orgId: string,
    assignments: Array<{ roleCode: string; propertyId?: string | null }>,
  ): Promise<{ roleIdByCode: Map<string, string>; propertyIds: string[] }> {
    const roleCodes = [...new Set(assignments.map((assignment) => assignment.roleCode))];
    const propertyIds = [
      ...new Set(
        assignments
          .map((assignment) => assignment.propertyId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const roles = await this.prisma.role.findMany({
      where: { code: { in: roleCodes } },
      select: { id: true, code: true },
    });
    if (roles.length !== roleCodes.length) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Vai trò không hợp lệ', 422);
    }

    if (propertyIds.length > 0) {
      const properties = await this.prisma.property.findMany({
        where: { orgId, id: { in: propertyIds } },
        select: { id: true },
      });
      if (properties.length !== propertyIds.length) {
        throw new AppError(ERROR_CODES.PROPERTY_FORBIDDEN, 'Cơ sở không hợp lệ', 403);
      }
    }

    return {
      roleIdByCode: new Map(roles.map((role) => [role.code, role.id])),
      propertyIds,
    };
  }

  private actorMaxLevel(actor: AuthUser): number {
    const levels = actor.roles
      .map((role) => ROLE_MAP[role.roleCode]?.level ?? 0)
      .filter((level) => Number.isFinite(level));
    return levels.length > 0 ? Math.max(...levels) : 0;
  }

  private async assertRoleAuthority(actor: AuthUser, roleCodes: string[]): Promise<void> {
    if (actor.permissions.includes(PERMISSIONS.ROLE_MANAGE)) return;
    const maxLevel = this.actorMaxLevel(actor);
    for (const code of roleCodes) {
      const level = ROLE_MAP[code]?.level ?? 99;
      if (level > maxLevel) {
        throw new AppError(
          ERROR_CODES.FORBIDDEN,
          `Bạn không thể gán vai trò ${code} (cao hơn quyền của bạn)`,
          403,
        );
      }
    }
  }

  private async assertCanManageTarget(actor: AuthUser, targetLevels: number[]): Promise<void> {
    if (actor.permissions.includes(PERMISSIONS.ROLE_MANAGE)) return;
    const maxLevel = this.actorMaxLevel(actor);
    if (Math.max(0, ...targetLevels) > maxLevel) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        'Bạn không thể thay đổi tài khoản có quyền cao hơn mình',
        403,
      );
    }
  }

  private async assertScopeAuthority(
    actor: AuthUser,
    propertyIds: Array<string | null>,
  ): Promise<void> {
    if (actor.orgWide) return;
    const allowed = new Set(
      actor.roles.map((role) => role.propertyId).filter((id): id is string => Boolean(id)),
    );
    for (const propertyId of propertyIds) {
      if (!propertyId || !allowed.has(propertyId)) {
        throw new AppError(
          ERROR_CODES.PROPERTY_FORBIDDEN,
          'Bạn chỉ có thể quản lý người dùng trong cơ sở của mình',
          403,
        );
      }
    }
  }
}
