import { Injectable } from '@nestjs/common';
import { ERROR_CODES, AppError, isoToday } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { PrismaService } from '../../common/prisma/prisma.module';
import { AccountingService } from '../accounting/accounting.service';
import { FinanceService } from '../finance/finance.service';

export const REPORT_TEMPLATES = [
  { key: 'pnl', title: 'P&L theo USALI', description: 'Doanh thu, chi phí, GOP và lợi nhuận sau thuế.', columns: ['metric', 'value'] },
  { key: 'department', title: 'Hiệu quả bộ phận', description: 'Doanh thu, chi phí và lợi nhuận từng bộ phận.', columns: ['department', 'revenue', 'cost', 'profit', 'margin'] },
  { key: 'channel', title: 'Doanh thu theo kênh', description: 'Gross, hoa hồng và net revenue từng kênh.', columns: ['channel', 'revenue', 'commission', 'net', 'share'] },
  { key: 'occupancy', title: 'Công suất & ADR', description: 'Phòng bán, công suất, ADR theo cơ sở.', columns: ['property', 'rooms', 'sold', 'occupancy', 'adr'] },
  { key: 'payroll', title: 'Bảng lương', description: 'Tổng gross, khấu trừ, thực nhận theo kỳ.', columns: ['period', 'status', 'gross', 'deductions', 'net'] },
  { key: 'ap', title: 'Tuổi nợ nhà cung cấp', description: 'Số dư và số ngày quá hạn từng hoá đơn.', columns: ['supplier', 'number', 'dueDate', 'overdueDays', 'balance'] },
] as const;

type TemplateKey = (typeof REPORT_TEMPLATES)[number]['key'];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly accounting: AccountingService,
    private readonly audit: AuditService,
  ) {}

  templates() {
    return REPORT_TEMPLATES;
  }

  async run(actor: AuthUser, templateKey: TemplateKey, propertyId: string, from: string, to: string) {
    assertPropertyAccess(actor, propertyId);
    const template = REPORT_TEMPLATES.find((item) => item.key === templateKey);
    if (!template) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy mẫu báo cáo', 404);
    let columns: Array<{ key: string; label: string; type?: 'money' | 'number' | 'percent' | 'text' }> = [];
    let rows: Array<Record<string, string | number>> = [];
    const title = template.title;

    if (templateKey === 'pnl') {
      const pnl = await this.finance.profitAndLoss(actor, propertyId, from, to);
      columns = [{ key: 'label', label: 'Chỉ tiêu' }, { key: 'value', label: 'Giá trị', type: 'money' }];
      rows = [
        { label: 'Doanh thu', value: pnl.revenue }, { label: 'Giá vốn', value: pnl.costOfSales },
        { label: 'Lương & phúc lợi', value: pnl.payroll }, { label: 'Chi phí vận hành', value: pnl.otherOperating },
        { label: 'Chi phí cố định', value: pnl.fixedCharges }, { label: 'GOP', value: pnl.gop },
        { label: 'Lợi nhuận sau thuế', value: pnl.netProfit },
      ];
    } else if (templateKey === 'department') {
      const pnl = await this.finance.profitAndLoss(actor, propertyId, from, to);
      columns = [{ key: 'department', label: 'Bộ phận' }, { key: 'revenue', label: 'Doanh thu', type: 'money' }, { key: 'cost', label: 'Chi phí', type: 'money' }, { key: 'profit', label: 'Lợi nhuận', type: 'money' }, { key: 'margin', label: 'Biên', type: 'percent' }];
      rows = pnl.departments.map((row) => ({ department: row.label, revenue: row.revenue, cost: row.cost, profit: row.profit, margin: row.margin }));
    } else if (templateKey === 'channel') {
      const summary = await this.accounting.revenueSummary(propertyId, from, to);
      const total = summary.total;
      columns = [{ key: 'channel', label: 'Kênh' }, { key: 'revenue', label: 'Doanh thu', type: 'money' }, { key: 'commission', label: 'Hoa hồng', type: 'money' }, { key: 'net', label: 'Net', type: 'money' }, { key: 'share', label: 'Tỷ trọng', type: 'percent' }];
      rows = summary.byChannel.map((row) => ({ channel: row.channelName, revenue: row.amount, commission: row.commission, net: row.netAmount, share: total > 0 ? Number(((row.amount / total) * 100).toFixed(1)) : 0 }));
    } else if (templateKey === 'occupancy') {
      const properties = await this.prisma.property.findMany({ where: { id: propertyId } });
      const rooms = await this.prisma.room.count({ where: { propertyId, isActive: true } });
      const nights = await this.prisma.reservationNight.findMany({
        where: { businessDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) }, reservationRoom: { reservation: { propertyId, status: { in: ['IN_HOUSE', 'CHECKED_OUT'] } } } },
        select: { rate: true },
      });
      const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1);
      const sold = nights.length;
      const available = rooms * days;
      columns = [{ key: 'property', label: 'Cơ sở' }, { key: 'rooms', label: 'Phòng', type: 'number' }, { key: 'sold', label: 'Đã bán', type: 'number' }, { key: 'occupancy', label: 'Công suất', type: 'percent' }, { key: 'adr', label: 'ADR', type: 'money' }];
      rows = [{ property: properties[0]?.name ?? 'Cơ sở', rooms, sold, occupancy: available ? Number(((sold / available) * 100).toFixed(1)) : 0, adr: sold > 0 ? Math.round(nights.reduce((sum, night) => sum + Number(night.rate), 0) / sold) : 0 }];
    } else if (templateKey === 'payroll') {
      const runs = await this.prisma.payrollRun.findMany({ where: { propertyId, period: { gte: from.slice(0, 7), lte: to.slice(0, 7) } }, orderBy: { period: 'asc' } });
      columns = [{ key: 'period', label: 'Kỳ' }, { key: 'status', label: 'Trạng thái' }, { key: 'gross', label: 'Gross', type: 'money' }, { key: 'deductions', label: 'Khấu trừ', type: 'money' }, { key: 'net', label: 'Thực nhận', type: 'money' }];
      rows = runs.map((run) => ({ period: run.period, status: run.status, gross: Number(run.gross), deductions: Number(run.deductions), net: Number(run.net) }));
    } else {
      const aging = await this.finance.apAging(actor, propertyId, to);
      columns = [{ key: 'supplier', label: 'Nhà cung cấp' }, { key: 'number', label: 'Hoá đơn' }, { key: 'dueDate', label: 'Đến hạn' }, { key: 'overdueDays', label: 'Quá hạn', type: 'number' }, { key: 'balance', label: 'Số dư', type: 'money' }];
      rows = aging.rows.map((row) => ({ supplier: row.supplier, number: row.number, dueDate: row.dueDate, overdueDays: row.overdueDays, balance: row.balance }));
    }

    const totals = rows.reduce<Record<string, number>>((acc, row) => {
      for (const column of columns) {
        if (column.type === 'money' || column.type === 'number') acc[column.key] = (acc[column.key] ?? 0) + Number(row[column.key] ?? 0);
      }
      return acc;
    }, {});

    await this.audit.record({ orgId: actor.orgId, propertyId, actorId: actor.id, actorName: actor.fullName, actorRole: actor.roles[0]?.roleCode, action: 'report.generated', entityType: 'Report', entityId: templateKey, after: { from, to, rows: rows.length } });
    return { template: templateKey, title, propertyId, from, to, generatedAt: new Date().toISOString(), columns, rows, totals };
  }

  toCsv(report: Awaited<ReturnType<ReportsService['run']>>): string {
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const header = report.columns.map((column) => escape(column.label)).join(',');
    const lines = report.rows.map((row) => report.columns.map((column) => escape(row[column.key])).join(','));
    return `\uFEFF${[header, ...lines].join('\r\n')}`;
  }

  async export(actor: AuthUser, template: TemplateKey, propertyId: string, from: string, to: string) {
    const report = await this.run(actor, template, propertyId, from, to);
    return { csv: this.toCsv(report), filename: `${template}-${isoToday()}.csv` };
  }
}
