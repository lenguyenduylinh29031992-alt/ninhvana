import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, paginationSchema } from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { Permissions } from '../auth/decorators';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.module';
import { AuditService } from './audit.service';

const auditQuerySchema = paginationSchema.extend({
  entityType: z.string().trim().max(60).optional(),
  action: z.string().trim().max(80).optional(),
  actorId: z.string().trim().max(64).optional(),
  propertyId: z.string().trim().max(64).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type AuditQuery = z.infer<typeof auditQuerySchema>;

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.AUDIT_VIEW)
  @ApiOkResponse({ description: 'Nhật ký kiểm toán (chỉ đọc)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery,
  ) {
    const where = {
      orgId: user.orgId,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.action ? { action: { startsWith: query.action } } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(user.orgWide ? {} : { propertyId: { in: this.scopedPropertyIds(user) } }),
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.q
        ? {
            OR: [
              { action: { contains: query.q, mode: 'insensitive' as const } },
              { entityType: { contains: query.q, mode: 'insensitive' as const } },
              { actorName: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        actorId: item.actorId,
        actorName: item.actorName,
        actorRole: item.actorRole,
        propertyId: item.propertyId,
        reason: item.reason,
        before: item.before,
        after: item.after,
        ip: item.ip,
        requestId: item.requestId,
        hashSelf: item.hashSelf,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  @Get('verify')
  @Permissions(PERMISSIONS.AUDIT_VIEW)
  async verify(@CurrentUser() user: AuthUser) {
    return this.audit.verifyChain(user.orgId);
  }

  private scopedPropertyIds(user: AuthUser): string[] {
    return [...new Set(user.roles.map((role) => role.propertyId).filter((id): id is string => Boolean(id)))];
  }
}
