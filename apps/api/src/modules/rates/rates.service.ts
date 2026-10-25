import { Injectable } from '@nestjs/common';
import { Prisma, type RateRequestStatus } from '@prisma/client';
import { ERROR_CODES, AppError } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { PrismaService } from '../../common/prisma/prisma.module';

const HIGH_LEVEL_ROLES = new Set(['SUPER_ADMIN', 'CHAIRMAN', 'CEO', 'CFO', 'REVENUE_DIRECTOR', 'PROPERTY_MANAGER']);
const DEFAULT_DEPARTMENTS = ['FINANCE', 'SALES', 'ADMIN'];

@Injectable()
export class RatesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private assertHighLevel(actor: AuthUser) {
    if (!actor.roles.some((assignment) => HIGH_LEVEL_ROLES.has(assignment.roleCode))) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Chỉ lãnh đạo cấp cao được thay đổi hoặc duyệt giá phòng.', 403);
    }
  }

  async list(actor: AuthUser, propertyId: string) {
    assertPropertyAccess(actor, propertyId);
    this.assertHighLevel(actor);
    return this.prisma.rateChangeRequest.findMany({
      where: { propertyId },
      include: { roomType: { select: { id: true, code: true, name: true, baseRate: true } }, approvals: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async create(actor: AuthUser, input: { propertyId: string; roomTypeId: string; proposedRate: number; effectiveFrom: string; effectiveTo?: string; reason: string; departments?: string[] }) {
    assertPropertyAccess(actor, input.propertyId);
    this.assertHighLevel(actor);
    const roomType = await this.prisma.roomType.findFirst({ where: { id: input.roomTypeId, propertyId: input.propertyId } });
    if (!roomType) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy loại phòng', 404);
    const codes = [...new Set(input.departments?.length ? input.departments : DEFAULT_DEPARTMENTS)];
    const departments = await this.prisma.department.findMany({ where: { property: { id: input.propertyId }, code: { in: codes } } });
    const byCode = new Map(departments.map((department) => [department.code, department.name]));
    const approvals = codes.map((code) => ({ departmentCode: code, departmentName: byCode.get(code) ?? code }));
    const request = await this.prisma.rateChangeRequest.create({
      data: {
        orgId: actor.orgId,
        propertyId: input.propertyId,
        roomTypeId: roomType.id,
        currentRate: roomType.baseRate,
        proposedRate: new Prisma.Decimal(input.proposedRate),
        effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00Z`),
        ...(input.effectiveTo ? { effectiveTo: new Date(`${input.effectiveTo}T00:00:00Z`) } : {}),
        reason: input.reason,
        requestedById: actor.id,
        requestedByName: actor.fullName,
        approvals: { create: approvals },
      },
      include: { roomType: true, approvals: true },
    });
    await this.audit.record({
      orgId: actor.orgId, propertyId: input.propertyId, actorId: actor.id, actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode, action: 'rate.requested', entityType: 'RateChangeRequest', entityId: request.id,
      after: { roomType: roomType.code, currentRate: Number(roomType.baseRate), proposedRate: input.proposedRate, departments: codes },
    });
    return request;
  }

  async decide(actor: AuthUser, id: string, action: 'approve' | 'reject', input: { departmentCode: string; signature: string; comment?: string }) {
    this.assertHighLevel(actor);
    const request = await this.prisma.rateChangeRequest.findUnique({ where: { id }, include: { roomType: true, approvals: true } });
    if (!request) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy yêu cầu giá', 404);
    assertPropertyAccess(actor, request.propertyId);
    if (request.status !== 'PENDING') throw new AppError(ERROR_CODES.INVALID_STATE, 'Yêu cầu đã được xử lý', 409);
    const approval = request.approvals.find((row) => row.departmentCode === input.departmentCode);
    if (!approval) throw new AppError(ERROR_CODES.NOT_FOUND, 'Bộ phận không thuộc yêu cầu này', 404);
    if (approval.status !== 'PENDING') throw new AppError(ERROR_CODES.INVALID_STATE, 'Bộ phận đã ký duyệt', 409);

    return this.prisma.$transaction(async (tx) => {
      await tx.rateApproval.update({
        where: { id: approval.id },
        data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED', approverId: actor.id, approverName: actor.fullName, signature: input.signature, comment: input.comment, decidedAt: new Date() },
      });
      const approvals = await tx.rateApproval.findMany({ where: { requestId: id } });
      const allApproved = approvals.every((row) => row.status === 'APPROVED');
      const rejected = approvals.some((row) => row.status === 'REJECTED');
      const status: RateRequestStatus = rejected ? 'REJECTED' : allApproved ? 'APPROVED' : 'PENDING';
      await tx.rateChangeRequest.update({ where: { id }, data: { status } });
      if (status === 'APPROVED') {
        await tx.roomType.update({ where: { id: request.roomTypeId }, data: { baseRate: request.proposedRate } });
        const bar = await tx.ratePlan.findFirst({ where: { propertyId: request.propertyId, code: 'BAR' } });
        if (bar) {
          await tx.ratePlanRate.updateMany({
            where: { roomTypeId: request.roomTypeId, ratePlanId: bar.id, date: { gte: request.effectiveFrom, ...(request.effectiveTo ? { lte: request.effectiveTo } : {}) } },
            data: { amount: request.proposedRate },
          });
        }
      }
      await this.audit.record({
        orgId: actor.orgId, propertyId: request.propertyId, actorId: actor.id, actorName: actor.fullName,
        actorRole: actor.roles[0]?.roleCode, action: `rate.${action}d`, entityType: 'RateChangeRequest', entityId: request.id,
        after: { departmentCode: input.departmentCode, signature: input.signature, status, proposedRate: Number(request.proposedRate) },
      });
      return tx.rateChangeRequest.findUniqueOrThrow({ where: { id }, include: { roomType: true, approvals: { orderBy: { createdAt: 'asc' } } } });
    });
  }
}
