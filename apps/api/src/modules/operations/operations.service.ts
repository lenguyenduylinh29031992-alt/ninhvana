import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, AppError } from '@grand-suite/shared';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.module';

function asDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Ngày không hợp lệ', 422);
  return date;
}

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async departmentScope(actor: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.id }, select: { departmentCode: true } });
    const elevated = actor.orgWide || actor.roles.some((role) => ['SUPER_ADMIN','CHAIRMAN','CEO','CFO','HR_MANAGER','PROPERTY_MANAGER'].includes(role.roleCode));
    return elevated ? undefined : user?.departmentCode ?? undefined;
  }

  private async propertyId(actor: AuthUser, requested?: string) {
    const property = await this.prisma.property.findFirst({
      where: { orgId: actor.orgId, ...(requested ? { id: requested } : {}) },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!property) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy cơ sở', 404);
    return property.id;
  }

  async budgets(actor: AuthUser, requested?: string, period?: string) {
    const propertyId = await this.propertyId(actor, requested);
    const department = await this.departmentScope(actor);
    const rows = await this.prisma.budgetLine.findMany({
      where: { orgId: actor.orgId, propertyId, ...(department ? { department } : {}), ...(period ? { period } : {}) },
      orderBy: [{ period: 'desc' }, { department: 'asc' }, { category: 'asc' }],
    });
    const summary = rows.reduce(
      (total, row) => ({
        planned: total.planned + Number(row.planned),
        actual: total.actual + Number(row.actual),
      }),
      { planned: 0, actual: 0 },
    );
    return { propertyId, rows: rows.map((row) => ({ ...row, planned: Number(row.planned), actual: Number(row.actual) })), summary };
  }

  async saveBudget(actor: AuthUser, input: { propertyId?: string; department: string; period: string; category: string; planned: number; actual?: number; notes?: string }) {
    const propertyId = await this.propertyId(actor, input.propertyId);
    const scope = await this.departmentScope(actor);
    if (scope && input.department !== scope) throw new AppError(ERROR_CODES.FORBIDDEN, 'Chỉ được lập ngân sách cho bộ phận của mình', 403);
    if (!input.department?.trim() || !/^\d{4}-\d{2}$/.test(input.period) || !input.category?.trim()) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Thiếu bộ phận, kỳ hoặc danh mục', 422);
    }
    return this.prisma.budgetLine.upsert({
      where: { propertyId_department_period_category: { propertyId, department: input.department.trim(), period: input.period, category: input.category.trim() } },
      update: { planned: new Prisma.Decimal(input.planned), actual: new Prisma.Decimal(input.actual ?? 0), notes: input.notes },
      create: { orgId: actor.orgId, propertyId, department: input.department.trim(), period: input.period, category: input.category.trim(), planned: new Prisma.Decimal(input.planned), actual: new Prisma.Decimal(input.actual ?? 0), notes: input.notes },
    });
  }

  async shifts(actor: AuthUser, requested?: string, from?: string, to?: string) {
    const propertyId = await this.propertyId(actor, requested);
    const department = await this.departmentScope(actor);
    const where: Prisma.ShiftAssignmentWhereInput = { orgId: actor.orgId, propertyId, ...(department ? { department } : {}) };
    if (from || to) where.date = { ...(from ? { gte: asDate(from) } : {}), ...(to ? { lte: asDate(to) } : {}) };
    const rows = await this.prisma.shiftAssignment.findMany({ where, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] });
    return { propertyId, rows };
  }

  async saveShift(actor: AuthUser, input: { propertyId?: string; department: string; employeeId?: string; employeeName: string; date: string; startTime: string; endTime: string; role?: string; notes?: string }) {
    const propertyId = await this.propertyId(actor, input.propertyId);
    const scope = await this.departmentScope(actor);
    if (scope && input.department !== scope) throw new AppError(ERROR_CODES.FORBIDDEN, 'Chỉ được xếp ca cho bộ phận của mình', 403);
    if (!input.employeeName?.trim() || !input.department?.trim() || !input.startTime || !input.endTime) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Thiếu nhân viên, bộ phận hoặc giờ ca', 422);
    }
    return this.prisma.shiftAssignment.create({
      data: { orgId: actor.orgId, propertyId, department: input.department.trim(), employeeId: input.employeeId, employeeName: input.employeeName.trim(), date: asDate(input.date), startTime: input.startTime, endTime: input.endTime, role: input.role, notes: input.notes },
    });
  }

  async updateShift(actor: AuthUser, id: string, input: { status?: string; notes?: string }) {
    const existing = await this.prisma.shiftAssignment.findFirst({ where: { id, orgId: actor.orgId } });
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy ca làm', 404);
    return this.prisma.shiftAssignment.update({ where: { id }, data: { ...(input.status ? { status: input.status } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}) } });
  }

  async deleteShift(actor: AuthUser, id: string) {
    const existing = await this.prisma.shiftAssignment.findFirst({ where: { id, orgId: actor.orgId } });
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy ca làm', 404);
    await this.prisma.shiftAssignment.delete({ where: { id } });
    return { deleted: true };
  }

  async events(actor: AuthUser, requested?: string) {
    const propertyId = await this.propertyId(actor, requested);
    const rows = await this.prisma.banquetEvent.findMany({ where: { orgId: actor.orgId, propertyId }, orderBy: [{ eventDate: 'asc' }, { startTime: 'asc' }] });
    const summary = rows.reduce((total, row) => ({ value: total.value + Number(row.contractValue), deposit: total.deposit + Number(row.deposit), guests: total.guests + row.guests }), { value: 0, deposit: 0, guests: 0 });
    return { propertyId, rows: rows.map((row) => ({ ...row, contractValue: Number(row.contractValue), deposit: Number(row.deposit) })), summary };
  }

  async saveEvent(actor: AuthUser, input: { propertyId?: string; code?: string; name: string; eventDate: string; startTime?: string; endTime?: string; venue?: string; guests?: number; status?: string; contractValue?: number; deposit?: number; contactName?: string; contactPhone?: string; notes?: string }) {
    const propertyId = await this.propertyId(actor, input.propertyId);
    if (!input.name?.trim()) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Thiếu tên sự kiện', 422);
    const code = input.code?.trim() || `EVT-${Date.now().toString().slice(-6)}`;
    return this.prisma.banquetEvent.upsert({
      where: { propertyId_code: { propertyId, code } },
      update: { name: input.name.trim(), eventDate: asDate(input.eventDate), startTime: input.startTime, endTime: input.endTime, venue: input.venue, guests: input.guests ?? 1, status: input.status ?? 'TENTATIVE', contractValue: new Prisma.Decimal(input.contractValue ?? 0), deposit: new Prisma.Decimal(input.deposit ?? 0), contactName: input.contactName, contactPhone: input.contactPhone, notes: input.notes },
      create: { orgId: actor.orgId, propertyId, code, name: input.name.trim(), eventDate: asDate(input.eventDate), startTime: input.startTime, endTime: input.endTime, venue: input.venue, guests: input.guests ?? 1, status: input.status ?? 'TENTATIVE', contractValue: new Prisma.Decimal(input.contractValue ?? 0), deposit: new Prisma.Decimal(input.deposit ?? 0), contactName: input.contactName, contactPhone: input.contactPhone, notes: input.notes },
    });
  }

  async updateEvent(actor: AuthUser, id: string, input: { status?: string; deposit?: number; notes?: string }) {
    const existing = await this.prisma.banquetEvent.findFirst({ where: { id, orgId: actor.orgId } });
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy sự kiện', 404);
    return this.prisma.banquetEvent.update({ where: { id }, data: { ...(input.status ? { status: input.status } : {}), ...(input.deposit !== undefined ? { deposit: new Prisma.Decimal(input.deposit) } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}) } });
  }

  async assistant(actor: AuthUser, question: string, requested?: string) {
    const propertyId = await this.propertyId(actor, requested);
    const lower = question.toLocaleLowerCase('vi');
    const [reservations, events, budgets, shifts] = await Promise.all([
      this.prisma.reservation.count({ where: { propertyId, status: { in: ['CONFIRMED', 'PENDING', 'IN_HOUSE'] } } }),
      this.prisma.banquetEvent.count({ where: { propertyId, eventDate: { gte: new Date() } } }),
      this.prisma.budgetLine.aggregate({ where: { propertyId }, _sum: { planned: true, actual: true } }),
      this.prisma.shiftAssignment.count({ where: { propertyId, date: { gte: new Date() } } }),
    ]);
    const planned = Number(budgets._sum.planned ?? 0);
    const actual = Number(budgets._sum.actual ?? 0);
    const bullets: string[] = [];
    if (lower.includes('ngân sách') || lower.includes('chi phí') || lower.includes('budget')) {
      bullets.push(`Ngân sách đã lập: ${planned.toLocaleString('vi-VN')} đ; thực chi: ${actual.toLocaleString('vi-VN')} đ; chênh lệch: ${(planned - actual).toLocaleString('vi-VN')} đ.`);
    }
    if (lower.includes('ca') || lower.includes('nhân sự') || lower.includes('shift')) bullets.push(`Có ${shifts} ca làm sắp tới đã xếp.`);
    if (lower.includes('tiệc') || lower.includes('sự kiện') || lower.includes('event')) bullets.push(`Có ${events} sự kiện/tiệc sắp tới trong hệ thống.`);
    if (lower.includes('buồng') || lower.includes('đặt phòng') || lower.includes('công suất') || lower.includes('reservation')) bullets.push(`Hiện có ${reservations} đặt phòng đang hoạt động/chờ.`);
    if (bullets.length === 0) bullets.push(`Tóm tắt nhanh: ${reservations} đặt phòng đang hoạt động, ${shifts} ca sắp tới, ${events} sự kiện sắp tới.`);
    bullets.push('Đây là trợ lý dựa trên dữ liệu vận hành hiện có; hãy kiểm tra lại trước khi ra quyết định.');
    return { answer: bullets.join(' '), bullets, generatedAt: new Date().toISOString() };
  }
}
