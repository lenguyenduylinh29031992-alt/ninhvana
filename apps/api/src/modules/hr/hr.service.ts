import { Injectable } from '@nestjs/common';
import { JournalSource, Prisma, type DepartmentGroup } from '@prisma/client';
import { ERROR_CODES, AppError, calculatePayroll, finalizeJournal, isoToday, parseIsoDate } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { PrismaService } from '../../common/prisma/prisma.module';
import { SequenceService } from '../../common/sequence/sequence.module';
import { PostingService } from '../accounting/posting.service';


function dept(value: string): DepartmentGroup {
  const mapped = value === 'SPA' ? 'OTHER_OPERATED' : value;
  return (['ROOMS', 'FNB', 'OTHER_OPERATED', 'MISCELLANEOUS', 'UNDISTRIBUTED', 'ADMIN', 'SALES', 'PROPERTY_OPS', 'UTILITIES', 'MAINTENANCE', 'FIXED'].includes(mapped)
    ? mapped
    : 'MISCELLANEOUS') as DepartmentGroup;
}


type SimpleLine = { accountCode: string; description: string; debit: number; credit: number; department?: DepartmentGroup | null };
function journal(memo: string, lines: SimpleLine[]) {
  return finalizeJournal(
    memo,
    lines.map((line) => ({ ...line, debit: new Prisma.Decimal(line.debit), credit: new Prisma.Decimal(line.credit) })),
  );
}

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
  ) {}

  async attendanceRange(actor: AuthUser, propertyId: string, from: string, to: string) {
    assertPropertyAccess(actor, propertyId);
    if (!propertyId || !from || !to) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Thiếu cơ sở hoặc khoảng ngày', 422);
    return this.prisma.attendance.findMany({
      where: { employee: { propertyId }, date: { gte: parseIsoDate(from), lte: parseIsoDate(to) } },
      include: { employee: { select: { id: true, code: true, fullName: true, department: true, position: true } } },
      orderBy: [{ employee: { code: 'asc' } }, { date: 'asc' }],
    });
  }

  async employees(actor: AuthUser, propertyId?: string) {
    return this.prisma.employee.findMany({
      where: { orgId: actor.orgId, ...(propertyId ? { propertyId } : {}) },
      orderBy: [{ department: 'asc' }, { fullName: 'asc' }],
    });
  }

  async createEmployee(actor: AuthUser, input: { propertyId?: string; code: string; fullName: string; position: string; department: string; hireDate: string; baseSalary: number; allowances?: number; dependents?: number; email?: string; phone?: string }) {
    return this.prisma.employee.create({
      data: { orgId: actor.orgId, propertyId: input.propertyId ?? null, code: input.code, fullName: input.fullName, position: input.position, department: input.department, hireDate: parseIsoDate(input.hireDate), baseSalary: input.baseSalary, allowances: input.allowances ?? 0, dependents: input.dependents ?? 0, email: input.email, phone: input.phone },
    });
  }

  async recordAttendance(actor: AuthUser, input: { date: string; records: Array<{ employeeId: string; hours: number; overtimeHours?: number; status?: string; notes?: string }> }) {
    const date = parseIsoDate(input.date);
    return this.prisma.$transaction(async (tx) => {
      for (const record of input.records) {
        await tx.attendance.upsert({
          where: { employeeId_date: { employeeId: record.employeeId, date } },
          update: { hours: record.hours, overtimeHours: record.overtimeHours ?? 0, status: record.status ?? 'PRESENT', notes: record.notes },
          create: { employeeId: record.employeeId, date, hours: record.hours, overtimeHours: record.overtimeHours ?? 0, status: record.status ?? 'PRESENT', notes: record.notes },
        });
      }
      return { saved: input.records.length, date: input.date };
    });
  }

  async payrollRuns(actor: AuthUser, propertyId: string) {
    assertPropertyAccess(actor, propertyId);
    return this.prisma.payrollRun.findMany({ where: { propertyId }, include: { lines: true }, orderBy: { period: 'desc' }, take: 24 });
  }

  async runPayroll(actor: AuthUser, propertyId: string, period: string) {
    assertPropertyAccess(actor, propertyId);
    if (!/^\d{4}-\d{2}$/.test(period)) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Kỳ lương phải có dạng YYYY-MM', 422);
    const existing = await this.prisma.payrollRun.findUnique({ where: { propertyId_period: { propertyId, period } } });
    if (existing) throw new AppError(ERROR_CODES.INVALID_STATE, 'Kỳ lương đã tồn tại', 409);
    const [year, month] = period.split('-').map(Number) as [number, number];
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0));
    const employees = await this.prisma.employee.findMany({ where: { propertyId, status: 'ACTIVE' } });
    const attendance = await this.prisma.attendance.groupBy({
      by: ['employeeId'], where: { employeeId: { in: employees.map((employee) => employee.id) }, date: { gte: from, lte: to } },
      _sum: { overtimeHours: true },
    });
    const overtimeMap = new Map(attendance.map((row) => [row.employeeId, Number(row._sum.overtimeHours ?? 0)]));
    let gross = 0; let employeeCost = 0; let deductions = 0; let net = 0;
    const lines = employees.map((employee) => {
      const result = calculatePayroll({ baseSalary: Number(employee.baseSalary), allowances: Number(employee.allowances), overtimeHours: overtimeMap.get(employee.id) ?? 0, dependents: employee.dependents });
      gross += result.gross; employeeCost += result.totalCost; deductions += result.insuranceEmployee + result.unionFee + result.tax; net += result.net;
      const { taxableIncome: _taxableIncome, ...payroll } = result;
      return { employeeId: employee.id, employeeCode: employee.code, employeeName: employee.fullName, department: employee.department, ...payroll };
    });
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({ data: { orgId: actor.orgId, propertyId, period, status: 'DRAFT', gross, employeeCost, deductions, net, lines: { create: lines } }, include: { lines: true } });
      await this.audit.record({ orgId: actor.orgId, propertyId, actorId: actor.id, actorName: actor.fullName, actorRole: actor.roles[0]?.roleCode, action: 'payroll.prepared', entityType: 'PayrollRun', entityId: run.id, after: { period, employees: lines.length, gross } });
      return run;
    });
  }

  async postPayroll(actor: AuthUser, runId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId }, include: { lines: true } });
    if (!run) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy kỳ lương', 404);
    assertPropertyAccess(actor, run.propertyId);
    if (run.status !== 'DRAFT') throw new AppError(ERROR_CODES.INVALID_STATE, 'Kỳ lương đã hạch toán', 409);
    return this.prisma.$transaction(async (tx) => {
      const byDepartment = new Map<string, { gross: number; employer: number }>();
      for (const line of run.lines) {
        const entry = byDepartment.get(line.department) ?? { gross: 0, employer: 0 };
        entry.gross += Number(line.gross);
        entry.employer += Number(line.insuranceEmployer);
        byDepartment.set(line.department, entry);
      }
      const totalGross = run.lines.reduce((sum, line) => sum + Number(line.gross), 0);
      const totalEmployer = run.lines.reduce((sum, line) => sum + Number(line.insuranceEmployer), 0);
      const totalEmployeeInsurance = run.lines.reduce((sum, line) => sum + Number(line.insuranceEmployee), 0);
      const totalUnion = run.lines.reduce((sum, line) => sum + Number(line.unionFee), 0);
      const totalTax = run.lines.reduce((sum, line) => sum + Number(line.tax), 0);
      const totalNet = run.lines.reduce((sum, line) => sum + Number(line.net), 0);
      const rounding = Number((totalGross + totalEmployer - (totalNet + totalEmployeeInsurance + totalUnion + totalEmployer + totalTax)).toFixed(2));
      const draft = journal(`Lương kỳ ${run.period}`, [
        ...[...byDepartment.entries()].flatMap(([department, value]) => [
          { accountCode: '6000', description: `Lương ${department}`, debit: value.gross, credit: 0, department: dept(department) },
          { accountCode: '6010', description: `Bảo hiểm ${department}`, debit: value.employer, credit: 0, department: dept(department) },
        ]),
        { accountCode: '3340', description: 'Phải trả người lao động', debit: 0, credit: totalNet },
        { accountCode: '3380', description: 'BHXH/BHYT/BHTN/KPCĐ', debit: 0, credit: totalEmployeeInsurance + totalUnion + totalEmployer + rounding },
        { accountCode: '3335', description: 'Thuế TNCN', debit: 0, credit: totalTax },
      ]);
      void totalGross;
      const entry = await this.posting.createEntry(tx, { orgId: actor.orgId, propertyId: run.propertyId, businessDate: parseIsoDate(`${run.period}-28`), sourceType: JournalSource.PAYROLL, sourceId: run.id, memo: draft.memo, postedById: actor.id }, draft);
      return tx.payrollRun.update({ where: { id: run.id }, data: { status: 'POSTED', postedAt: new Date(), postedEntryId: entry.id } });
    });
  }

  async payPayroll(actor: AuthUser, runId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy kỳ lương', 404);
    assertPropertyAccess(actor, run.propertyId);
    if (run.status !== 'POSTED') throw new AppError(ERROR_CODES.INVALID_STATE, 'Kỳ lương chưa hạch toán', 409);
    return this.prisma.$transaction(async (tx) => {
      const draft = journal(`Chi lương kỳ ${run.period}`, [
        { accountCode: '3340', description: 'Chi lương', debit: Number(run.net), credit: 0 },
        { accountCode: '1120', description: 'Chuyển khoản lương', debit: 0, credit: Number(run.net) },
      ]);
      await this.posting.createEntry(tx, { orgId: actor.orgId, propertyId: run.propertyId, businessDate: parseIsoDate(isoToday()), sourceType: JournalSource.PAYMENT, sourceId: run.id, memo: draft.memo, postedById: actor.id }, draft);
      return tx.payrollRun.update({ where: { id: run.id }, data: { status: 'PAID', paidAt: new Date() } });
    });
  }
}
