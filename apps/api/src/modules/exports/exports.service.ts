import { Injectable } from '@nestjs/common';
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import ExcelJS from 'exceljs';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.module';

type Format = 'xlsx' | 'docx' | 'csv' | 'tsv';
interface DataSet { title: string; columns: string[]; rows: Array<Array<string | number | null>> }

const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Kế hoạch', IN_PROGRESS: 'Đang làm', DONE: 'Hoàn tất', PAUSED: 'Tạm dừng',
  PENDING: 'Chờ', CLEAN: 'Sạch', DIRTY: 'Cần dọn', INSPECTED: 'Đã kiểm', OUT_OF_ORDER: 'Khoá',
  CONFIRMED: 'Đã xác nhận', IN_HOUSE: 'Đang ở', CHECKED_OUT: 'Đã trả', CANCELLED: 'Đã huỷ',
};

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async data(actor: AuthUser, dataset: string): Promise<DataSet> {
    switch (dataset) {
      case 'marketing': {
        const items = await this.prisma.marketingItem.findMany({ where: { orgId: actor.orgId }, orderBy: [{ sortOrder: 'asc' }] });
        const byId = new Map(items.map((item) => [item.id, item.title]));
        return {
          title: 'Marketing NinhVaNa',
          columns: ['Mục', 'Mục cha', 'Trạng thái', 'Kênh', 'Ngân sách (VND)', 'Mô tả', 'Ghi chú'],
          rows: items.map((item) => [item.title, item.parentId ? byId.get(item.parentId) ?? '' : '', STATUS_LABELS[item.status] ?? item.status, item.channel ?? '', item.budget ? Number(item.budget) : null, item.description ?? '', item.notes ?? '']),
        };
      }
      case 'property-map': {
        const areas = await this.prisma.propertyArea.findMany({ where: { orgId: actor.orgId }, orderBy: [{ sortOrder: 'asc' }] });
        return {
          title: 'Sơ đồ khu vực NinhVaNa',
          columns: ['Mã khu', 'Tên khu', 'Thuộc khu', 'Loại', 'Tầng', 'Số phòng', 'Mô tả'],
          rows: areas.map((area) => [area.code, area.name, area.parentCode ?? '', area.kind, area.floorLabel ?? '', area.roomCount, area.description ?? '']),
        };
      }
      case 'reservations': {
        const reservations = await this.prisma.reservation.findMany({ where: { property: { orgId: actor.orgId } }, include: { primaryGuest: true, property: true }, orderBy: { checkIn: 'desc' }, take: 1000 });
        return {
          title: 'Danh sách đặt phòng',
          columns: ['Mã', 'Khách', 'Cơ sở', 'Nhận phòng', 'Trả phòng', 'Đêm', 'Trạng thái', 'Tổng tiền', 'Còn lại'],
          rows: reservations.map((item) => [item.code, item.primaryGuest.fullName, item.property.name, item.checkIn.toISOString().slice(0, 10), item.checkOut.toISOString().slice(0, 10), item.nights, STATUS_LABELS[item.status] ?? item.status, Number(item.totalAmount), Number(item.balance)]),
        };
      }
      case 'guests': {
        const guests = await this.prisma.guest.findMany({ where: { orgId: actor.orgId }, orderBy: { lifetimeValue: 'desc' }, take: 1000 });
        return {
          title: 'Khách hàng',
          columns: ['Mã', 'Họ tên', 'Email', 'Điện thoại', 'Quốc gia', 'Hạng', 'Lưu trú', 'Giá trị trọn đời'],
          rows: guests.map((guest) => [guest.code, guest.fullName, guest.email ?? '', guest.phone ?? '', guest.country ?? '', guest.vipLevel, guest.totalStays, Number(guest.lifetimeValue)]),
        };
      }
      case 'housekeeping': {
        const tasks = await this.prisma.housekeepingTask.findMany({ where: { property: { orgId: actor.orgId } }, include: { room: true, property: true }, orderBy: { createdAt: 'desc' }, take: 1000 });
        return {
          title: 'Buồng phòng',
          columns: ['Cơ sở', 'Phòng', 'Loại', 'Trạng thái', 'Ưu tiên', 'Ghi chú', 'Bắt đầu', 'Hoàn tất'],
          rows: tasks.map((task) => [task.property.name, task.room.number, task.type, STATUS_LABELS[task.status] ?? task.status, task.priority, task.notes ?? '', task.startedAt?.toISOString().slice(0, 16) ?? '', task.completedAt?.toISOString().slice(0, 16) ?? '']),
        };
      }
      case 'crm-reviews': {
        const reviews = await this.prisma.guestReview.findMany({ where: { orgId: actor.orgId }, orderBy: { reviewDate: 'desc' }, take: 1000 });
        const guests = await this.prisma.guest.findMany({ where: { id: { in: reviews.map((review) => review.guestId).filter((id): id is string => Boolean(id)) } }, select: { id: true, fullName: true } });
        const names = new Map(guests.map((guest) => [guest.id, guest.fullName]));
        return {
          title: 'Đánh giá khách hàng',
          columns: ['Ngày', 'Khách', 'Điểm', 'Tiêu đề', 'Nội dung', 'Phản hồi', 'Trạng thái'],
          rows: reviews.map((review) => [review.reviewDate.toISOString().slice(0, 10), review.guestId ? names.get(review.guestId) ?? '' : '', review.rating, review.title ?? '', review.comment ?? '', review.response ?? '', review.status]),
        };
      }
      case 'crm-campaigns': {
        const campaigns = await this.prisma.campaign.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: 'desc' } });
        return {
          title: 'Chiến dịch CRM',
          columns: ['Tên', 'Kênh', 'Phân khúc', 'Trạng thái', 'Người nhận', 'Gửi lúc'],
          rows: campaigns.map((campaign) => [campaign.name, campaign.channel, campaign.segment, campaign.status, campaign.recipientsCount, campaign.sentAt?.toISOString().slice(0, 16) ?? '']),
        };
      }
      case 'payroll': {
        const runs = await this.prisma.payrollRun.findMany({ where: { orgId: actor.orgId }, include: { lines: true }, orderBy: { period: 'desc' }, take: 24 });
        return {
          title: 'Bảng lương',
          columns: ['Kỳ', 'Trạng thái', 'Nhân viên', 'Tổng gross', 'Khấu trừ', 'Thực lĩnh'],
          rows: runs.map((run) => [run.period, run.status, run.lines.length, Number(run.gross), Number(run.deductions), Number(run.net)]),
        };
      }
      case 'channels': {
        const channels = await this.prisma.channel.findMany({ where: { orgId: actor.orgId }, orderBy: { name: 'asc' } });
        return {
          title: 'Kênh phân phối',
          columns: ['Mã', 'Tên', 'Loại', 'Trạng thái', 'Hoa hồng (%)'],
          rows: channels.map((channel) => [channel.code, channel.name, channel.type, channel.isActive ? 'ACTIVE' : 'INACTIVE', channel.commissionPct ? Number(channel.commissionPct) : '']),
        };
      }

      case 'finance': {
        const entries = await this.prisma.journalEntry.findMany({ where: { orgId: actor.orgId }, include: { lines: true }, orderBy: { businessDate: 'desc' }, take: 500 });
        return {
          title: 'Sổ nhật ký kế toán',
          columns: ['Ngày', 'Số chứng từ', 'Diễn giải', 'Tài khoản', 'Bộ phận', 'Nợ', 'Có', 'Người tạo'],
          rows: entries.flatMap((entry) => entry.lines.map((line) => [entry.businessDate.toISOString().slice(0, 10), entry.number, line.description, line.accountCode, line.department ?? '', Number(line.debit), Number(line.credit), ''])),
        };
      }
      case 'supplier-invoices': {
        const invoices = await this.prisma.supplierInvoice.findMany({ where: { orgId: actor.orgId }, include: { supplier: true }, orderBy: { invoiceDate: 'desc' }, take: 1000 });
        return {
          title: 'Hoá đơn nhà cung cấp',
          columns: ['Số hoá đơn', 'Nhà cung cấp', 'Ngày hoá đơn', 'Hạn thanh toán', 'Tổng tiền', 'Đã trả', 'Còn lại', 'Trạng thái'],
          rows: invoices.map((invoice) => [invoice.number, invoice.supplier.name, invoice.invoiceDate.toISOString().slice(0, 10), invoice.dueDate.toISOString().slice(0, 10), Number(invoice.total), Number(invoice.paidAmount), Number(invoice.balance), invoice.status]),
        };
      }
      case 'users': {
        const users = await this.prisma.user.findMany({ where: { orgId: actor.orgId }, include: { roles: { include: { role: true } } }, orderBy: { fullName: 'asc' } });
        return {
          title: 'Tài khoản người dùng',
          columns: ['Họ tên', 'Email', 'Vai trò', 'Trạng thái', 'Đăng nhập gần nhất'],
          rows: users.map((user) => [user.fullName, user.email, user.roles.map((role) => role.role.name).join(', '), user.isActive ? 'Hoạt động' : 'Tạm khoá', user.lastLoginAt?.toISOString().slice(0, 16) ?? '']),
        };
      }
      case 'employees': {
        const employees = await this.prisma.employee.findMany({ where: { orgId: actor.orgId }, orderBy: { code: 'asc' }, take: 1000 });
        return {
          title: 'Hồ sơ nhân sự',
          columns: ['Mã', 'Họ tên', 'Bộ phận', 'Chức danh', 'Trạng thái', 'Ngày vào làm'],
          rows: employees.map((employee) => [employee.code, employee.fullName, employee.department, employee.position, employee.status, employee.hireDate?.toISOString().slice(0, 10) ?? '']),
        };
      }
      default:
        throw new Error(`Unknown dataset: ${dataset}`);
    }
  }

  async export(actor: AuthUser, dataset: string, format: Format): Promise<{ filename: string; contentType: string; body: Buffer | string }> {
    const data = await this.data(actor, dataset);
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `ninhvana-${dataset}-${stamp}`;
    if (format === 'csv' || format === 'tsv') {
      const separator = format === 'tsv' ? '\t' : ',';
      const escape = (value: string | number | null) => {
        const text = String(value ?? '');
        if (format === 'tsv') return text.replace(/\t/g, ' ');
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const rows = [data.columns, ...data.rows].map((row) => row.map(escape).join(separator));
      return { filename: `${base}.${format}`, contentType: format === 'tsv' ? 'text/tab-separated-values; charset=utf-8' : 'text/csv; charset=utf-8', body: `\uFEFF${rows.join('\r\n')}` };
    }
    if (format === 'docx') {
      const doc = new Document({
        sections: [{ children: [
          new Paragraph({ text: data.title, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: `Xuất ngày ${stamp} · NinhVaNa Hospitality`, spacing: { after: 300 } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ children: data.columns.map((column) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: column, bold: true })] })] })) }),
              ...data.rows.map((row) => new TableRow({ children: row.map((value) => new TableCell({ children: [new Paragraph(String(value ?? ''))] })) }))],
          }),
        ] }],
      });
      return { filename: `${base}.docx`, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: await Packer.toBuffer(doc) };
    }
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NinhVaNa';
    const sheet = workbook.addWorksheet(data.title.slice(0, 28));
    sheet.columns = data.columns.map((header) => ({ header, key: header, width: Math.max(14, Math.min(34, header.length + 6)) }));
    data.rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6699' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, data.rows.length + 1), column: data.columns.length } };
    const buffer = await workbook.xlsx.writeBuffer();
    return { filename: `${base}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: Buffer.from(buffer) };
  }
}
