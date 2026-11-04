import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, AppError } from '@grand-suite/shared';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.module';

type CsvRow = string[];

const SOURCES = {
  attendance: { url: 'https://docs.google.com/spreadsheets/d/1jb5s3KvVwZJyDqTr4_QZI7gUeKJS9WAyM_9jz6blBLE/export?format=csv&gid=536156494', label: 'Chấm công TikTok 10/2026' },
  payroll: { url: 'https://docs.google.com/spreadsheets/d/1bBYbKMhKxJkMJxVV2boIrO4lPYnCHrC-RKTiMWpppVE/gviz/tq?tqx=out:csv&gid=0', label: 'Lương & tạm ứng TikTok 10/2026' },
  shopping: { url: 'https://docs.google.com/spreadsheets/d/15H1_7oQ28ejuHiIOXlmZeeZDpN02eajQGLynmPhxjM4/gviz/tq?tqx=out:csv&gid=1350094361', label: 'Chi phí đi chợ TikTok 11/2026' },
} as const;

type SourceKind = keyof typeof SOURCES;

function parseSourceKey(key: string): { kind: SourceKind; period: string | null; department: string | null } {
  const [kind, second, third] = key.split(':');
  const hasPeriod = Boolean(second && /^\d{4}-\d{2}$/.test(second));
  return {
    kind: kind as SourceKind,
    period: hasPeriod ? second : null,
    department: (hasPeriod ? third : second)?.trim().toUpperCase() || null,
  };
}

function extractGid(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('gid') ?? parsed.hash.match(/gid=(\d+)/)?.[1] ?? null;
  } catch { return null; }
}

function withGid(url: string, gid?: string | null): string {
  const sheet = url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/?#]+)/);
  if (sheet && !/\/(export|gviz)(\/|\?|$)/.test(url)) {
    return `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv&gid=${encodeURIComponent(gid ?? '0')}`;
  }
  if (!gid) return url;
  if (/[?&]gid=/.test(url)) return url.replace(/([?&]gid=)[^&]*/, `$1${encodeURIComponent(gid)}`);
  return `${url}${url.includes('?') ? '&' : '?'}gid=${encodeURIComponent(gid)}`;
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function parseCsv(input: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function money(value: string | undefined): number {
  if (!value) return 0;
  const digits = value.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function normalize(value: string | undefined): string {
  return (value ?? '').normalize('NFC').trim().toLowerCase();
}

function statusOf(value: string): { status: string; hours: number } | null {
  const text = normalize(value);
  if (!text || text === '.' || text === '-' || text === '0') return null;
  if (text.includes('đủ công')) return { status: 'PRESENT', hours: 8 };
  if (text.includes('nửa công')) return { status: 'HALF_DAY', hours: 4 };
  if (text.includes('nghỉ tuần')) return { status: 'WEEKLY_OFF', hours: 0 };
  if (text.includes('nghỉ không lương')) return { status: 'UNPAID_LEAVE', hours: 0 };
  return null;
}

@Injectable()
export class GoogleSheetSyncService implements OnModuleInit {
  private readonly logger = new Logger(GoogleSheetSyncService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.GOOGLE_SHEET_SYNC_ENABLED === 'false') return;
    const timer = setInterval(() => { void this.syncAll('auto').catch((error) => this.logger.warn(error.message)); }, 15 * 60 * 1000);
    timer.unref();
    setTimeout(() => { void this.syncAll('auto').catch((error) => this.logger.warn(error.message)); }, 30_000).unref();
  }

  async status(actor: AuthUser, propertyId?: string) {
    if (propertyId) await this.assertProperty(actor, propertyId);
    return this.prisma.googleSheetSync.findMany({ orderBy: { key: 'asc' } });
  }

  async config(_actor: AuthUser) {
    const rows = await this.prisma.googleSheetSync.findMany({ orderBy: [{ period: 'asc' }, { key: 'asc' }] });
    const keys = Object.keys(SOURCES) as SourceKind[];
    const defaults = keys.map((key) => rows.find((row) => row.key === key) ?? { key, url: SOURCES[key].url, label: SOURCES[key].label, department: 'TIKTOK', enabled: true, period: null, gid: extractGid(SOURCES[key].url), status: 'IDLE', message: null, rows: 0, lastSyncedAt: null });
    return [...defaults, ...rows.filter((row) => !keys.includes(row.key as SourceKind))];
  }

  async updateConfig(actor: AuthUser, input: { key: string; url: string; label?: string; department?: string; enabled?: boolean; period?: string; gid?: string }) {
    const parsed = parseSourceKey(input.key);
    if (!(parsed.kind in SOURCES)) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Nguồn Google Sheet không hợp lệ', 422);
    if (parsed.period && !/^\d{4}-\d{2}$/.test(parsed.period)) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Kỳ phải có dạng YYYY-MM', 422);
    if (!/^https:\/\/docs\.google\.com\//.test(input.url)) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Liên kết phải là Google Sheets', 422);
    const normalizedGid = input.gid?.trim() || extractGid(input.url);
    const department = (input.department || parsed.department || 'TIKTOK').trim().toUpperCase();
    return this.prisma.googleSheetSync.upsert({
      where: { key: input.key },
      update: { url: input.url, label: input.label, department, enabled: input.enabled ?? true, period: parsed.period, gid: normalizedGid },
      create: { key: input.key, url: input.url, label: input.label, department, enabled: input.enabled ?? true, period: parsed.period, gid: normalizedGid },
    });
  }

  async sync(actor: AuthUser, propertyId?: string, key?: string, period?: string, department?: string, configKey?: string) {
    if (propertyId) await this.assertProperty(actor, propertyId);
    if (key) {
      const { kind } = parseSourceKey(key);
      if (!(kind in SOURCES)) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Nguồn Google Sheet không hợp lệ', 422);
    }
    return this.syncAll('manual', key ? key.split(':')[0] : undefined, period, department, configKey);
  }

  private async assertProperty(actor: AuthUser, propertyId: string) {
    const exists = await this.prisma.property.findFirst({ where: { id: propertyId, orgId: actor.orgId }, select: { id: true } });
    if (!exists) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy cơ sở', 404);
  }

  async syncAll(trigger: 'auto' | 'manual', onlyKey?: string, period?: string, department?: string, configKey?: string) {
    if (this.running) return { skipped: true, reason: 'Đang đồng bộ' };
    this.running = true;
    const property = await this.prisma.property.findFirstOrThrow({ where: { code: 'NVN' } });
    const result: Array<{ key: string; ok: boolean; rows: number; message?: string }> = [];
    try {
      for (const [key, source] of Object.entries(SOURCES)) {
        if (onlyKey && key !== onlyKey) continue;
        try {
          const targetPeriod = period || (trigger === 'auto' ? currentPeriod() : undefined);
          const targetDepartment = department?.trim().toUpperCase();
          const candidateKeys = targetDepartment
            ? [
                targetPeriod ? `${key}:${targetPeriod}:${targetDepartment}` : null,
                `${key}:${targetDepartment}`,
                ...(targetDepartment === 'TIKTOK' ? [targetPeriod ? `${key}:${targetPeriod}` : null, key] : []),
              ]
            : [
                targetPeriod ? `${key}:${targetPeriod}` : null,
                key,
              ];
          let configured: { url: string; gid: string | null; department: string; enabled: boolean } | null = null;
          let periodKey = key;
          if (configKey) {
            const requested = parseSourceKey(configKey);
            if (requested.kind !== key) throw new Error(`Cấu hình ${configKey} không thuộc nguồn ${key}`);
            const found = await this.prisma.googleSheetSync.findUnique({ where: { key: configKey } });
            if (!found) throw new Error(`Không tìm thấy cấu hình ${configKey}`);
            configured = found; periodKey = configKey;
          } else {
            for (const candidate of candidateKeys.filter((value): value is string => Boolean(value))) {
              const found = await this.prisma.googleSheetSync.findUnique({ where: { key: candidate } });
              if (found && (!targetDepartment || found.department.toUpperCase() === targetDepartment)) {
                configured = found; periodKey = candidate; break;
              }
            }
          }
          if (targetDepartment && !configured) {
            result.push({ key, ok: false, rows: 0, message: `Chưa cấu hình Google Sheet cho bộ phận ${targetDepartment}` });
            continue;
          }
          if (configured?.enabled === false) { result.push({ key, ok: true, rows: 0, message: 'Đang tắt' }); continue; }
          const sourceUrl = withGid(configured?.url || source.url, configured?.gid);
          const resolvedDepartment = (configured?.department || targetDepartment || 'TIKTOK').toUpperCase();
          const response = await fetch(sourceUrl, { headers: { 'user-agent': 'NinhVaNa-SheetSync/1.0' }, signal: AbortSignal.timeout(20_000) });
          if (!response.ok) throw new Error(`Google Sheet HTTP ${response.status}`);
          const rows = parseCsv(await response.text());
          let imported = rows.filter((row) => row.some((cell) => cell.trim())).length;
          const message = 'Đã tải dữ liệu nguồn';
          if (key === 'attendance') imported = await this.importAttendance(property, rows, resolvedDepartment);
          if (key === 'payroll') imported = await this.importPayroll(property, rows, resolvedDepartment);
          if (key === 'shopping') imported = await this.importShopping(property, rows, targetPeriod);
          await this.prisma.googleSheetSync.upsert({
            where: { key: periodKey }, update: { url: configured?.url || source.url, gid: configured?.gid, department: resolvedDepartment, period: targetPeriod ?? null, lastSyncedAt: new Date(), status: 'OK', message, rows: imported },
            create: { key: periodKey, url: configured?.url || source.url, gid: configured?.gid, department: resolvedDepartment, period: targetPeriod ?? null, lastSyncedAt: new Date(), status: 'OK', message, rows: imported },
          });
          result.push({ key, ok: true, rows: imported, message });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Lỗi đồng bộ';
          const targetPeriod = period || (trigger === 'auto' ? currentPeriod() : undefined);
          const targetDepartment = department?.trim().toUpperCase();
          const periodKey = targetPeriod ? `${key}:${targetPeriod}${targetDepartment ? `:${targetDepartment}` : ''}` : key;
          await this.prisma.googleSheetSync.upsert({
            where: { key: periodKey }, update: { url: source.url, department: targetDepartment ?? 'TIKTOK', period: targetPeriod ?? null, status: 'ERROR', message, lastSyncedAt: new Date() },
            create: { key: periodKey, url: source.url, department: targetDepartment ?? 'TIKTOK', period: targetPeriod ?? null, status: 'ERROR', message, lastSyncedAt: new Date() },
          });
          result.push({ key, ok: false, rows: 0, message });
        }
      }
      this.logger.log(`Google Sheet ${trigger}: ${result.filter((row) => row.ok).length}/${result.length} nguồn thành công`);
      return { trigger, sources: result };
    } finally { this.running = false; }
  }

  private async employee(orgId: string, propertyId: string, name: string, department: string, code?: string) {
    const fullName = name.trim();
    const existing = await this.prisma.employee.findFirst({ where: { orgId, fullName, department } });
    if (existing) {
      if (existing.source !== 'GOOGLE_SHEET') return this.prisma.employee.update({ where: { id: existing.id }, data: { source: 'GOOGLE_SHEET' } });
      return existing;
    }
    const employeeCode = code || `SHEET-${fullName.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    return this.prisma.employee.create({ data: {
      orgId, propertyId, code: employeeCode, fullName, position: 'Nhân viên', department, source: 'GOOGLE_SHEET',
      hireDate: new Date('2026-10-01T00:00:00Z'), baseSalary: new Prisma.Decimal(6_500_000), status: 'ACTIVE',
    } });
  }

  private async importAttendance(property: { id: string; orgId: string }, rows: CsvRow[], department: string) {
    const title = rows.flat().find((cell) => /THÁNG\s+\d{1,2}\/\d{4}/i.test(cell)) ?? '';
    const match = title.match(/THÁNG\s+(\d{1,2})\/(\d{4})/i);
    const month = match ? Number(match[1]) : 10;
    const year = match ? Number(match[2]) : 2026;
    let count = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const header = rows[index] ?? [];
      if (!header.some((cell) => normalize(cell) === 'họ và tên')) continue;
      const dateColumns = new Map<number, string>();
      for (const [column, cell] of header.entries()) {
        const date = cell.match(/\((\d{1,2})\/(\d{1,2})\)/);
        if (!date) continue;
        const day = Number(date[1]); const cellMonth = Number(date[2]);
        if (cellMonth !== month) continue;
        dateColumns.set(column, `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }
      if (dateColumns.size === 0) continue;
      let rowIndex = index + 1;
      while (rowIndex < rows.length) {
        const row = rows[rowIndex] ?? [];
        const name = (row[1] ?? '').trim();
        if (!name || normalize(name).startsWith('tổng công') || normalize(name).startsWith('số người') || normalize(name) === 'họ và tên') break;
        if (/^nhân viên\s+\d+$/i.test(name)) { rowIndex += 1; continue; }
        const employee = await this.employee(property.orgId, property.id, name, department);
        for (const [column, date] of dateColumns) {
          const meta = statusOf(row[column] ?? '');
          if (!meta) continue;
          await this.prisma.attendance.upsert({
            where: { employeeId_date: { employeeId: employee.id, date: new Date(`${date}T00:00:00Z`) } },
            update: { hours: new Prisma.Decimal(meta.hours), status: meta.status, notes: 'Đồng bộ Google Sheet chấm công' },
            create: { employeeId: employee.id, date: new Date(`${date}T00:00:00Z`), hours: new Prisma.Decimal(meta.hours), status: meta.status, notes: 'Đồng bộ Google Sheet chấm công' },
          });
          count += 1;
        }
        rowIndex += 1;
      }
      index = rowIndex;
    }
    return count;
  }

  private async importShopping(property: { id: string; orgId: string }, rows: CsvRow[], requestedPeriod?: string) {
    const headerIndex = rows.findIndex((row) => normalize(row[0] ?? '') === 'ngày');
    if (headerIndex < 0) return 0;
    const topHeader = rows[headerIndex] ?? [];
    const subHeader = rows[headerIndex + 1] ?? [];
    const top = topHeader.map((cell) => normalize(cell));
    const sub = subHeader.map((cell) => normalize(cell));
    const shopTop = top.findIndex((cell) => cell.includes('mua đồ chợ'));
    const onlineTop = top.findIndex((cell) => cell.includes('shopee'));
    const shopDescCol = shopTop;
    const shopAmountCol = shopTop + 1;
    const onlineDescCol = onlineTop;
    const onlineAmountCol = onlineTop + 1;
    const summaryIndex = rows.findIndex((row) => normalize(row[0] ?? '').startsWith('tổng chi tháng'));
    const summaryRow = summaryIndex >= 0 ? rows[summaryIndex] : null;
    if (shopTop < 0 && onlineTop < 0) return 0;

    // Employee blocks have the person on the top header row and
    // "Ứng Lương / Tên Đồ / Tiền Chợ" on the second header row.
    const employeeColumns: Array<{ name: string; itemCol: number; amountCol: number }> = [];
    for (let column = 0; column < topHeader.length; column += 1) {
      const employee = (topHeader[column] ?? '').trim();
      if (!employee) continue;
      if (sub[column] === 'ứng lương' && sub[column + 1] === 'tên đồ' && sub[column + 2]?.startsWith('tiền')) {
        employeeColumns.push({ name: employee, itemCol: column + 1, amountCol: column + 2 });
      }
    }

    const title = rows.flat().find((cell) => /THÁNG\s+\d{1,2}\/\d{4}/i.test(cell)) ?? '';
    const match = title.match(/THÁNG\s+(\d{1,2})\/(\d{4})/i);
    const month = match ? Number(match[1]) : new Date().getMonth() + 1;
    const year = match ? Number(match[2]) : new Date().getFullYear();
    const period = `${year}-${String(month).padStart(2, '0')}`;
    if (requestedPeriod && period !== requestedPeriod) {
      throw new Error(`Tab Google Sheet là tháng ${period}, không phải tháng ${requestedPeriod}; kiểm tra lại GID`);
    }

    const details: Array<{ employeeName: string | null; description: string; category: string; amount: number; itemDate: Date }> = [];
    const firstDataIndex = headerIndex + (subHeader.some((cell) => normalize(cell)) ? 2 : 1);
    for (const row of rows.slice(firstDataIndex, summaryIndex >= 0 ? summaryIndex : rows.length)) {
      const rawDate = (row[0] ?? '').trim();
      const date = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (!date) continue;
      const itemDate = new Date(`${date[3]}-${String(Number(date[2])).padStart(2, '0')}-${String(Number(date[1])).padStart(2, '0')}T00:00:00Z`);
      const shoppingDescription = (row[shopDescCol] ?? '').trim();
      const shoppingAmount = money(row[shopAmountCol]);
      if (shoppingAmount > 0) details.push({ employeeName: null, description: shoppingDescription || 'Mua đồ chợ', category: 'SHOPPING', amount: shoppingAmount, itemDate });
      const onlineDescription = (row[onlineDescCol] ?? '').trim();
      const onlineAmount = money(row[onlineAmountCol]);
      if (onlineAmount > 0) details.push({ employeeName: null, description: onlineDescription || 'Mua đồ Shopee/TikTok', category: 'ONLINE', amount: onlineAmount, itemDate });
      for (const employee of employeeColumns) {
        const description = (row[employee.itemCol] ?? '').trim();
        const amount = money(row[employee.amountCol]);
        if (!description || amount <= 0 || /^(off|-|0)$/i.test(description)) continue;
        details.push({ employeeName: employee.name, description, category: 'EMPLOYEE', amount, itemDate });
      }
    }

    const summaryTotal = summaryRow ? (money(summaryRow[3]) || money(summaryRow[1]) + money(summaryRow[2])) : 0;
    const total = summaryTotal || details.reduce((sum, item) => sum + item.amount, 0);
    if (total <= 0) return 0;
    const lastDay = new Date(year, month, 0).getDate();
    const summaryDate = new Date(`${period}-${String(lastDay).padStart(2, '0')}T00:00:00Z`);

    // Replace previous daily rows and the previous summary for this month.
    await this.prisma.expense.deleteMany({ where: { propertyId: property.id, number: { startsWith: 'SHOP-' } } });
    const expense = await this.prisma.expense.create({ data: {
      orgId: property.orgId, propertyId: property.id, number: `SHOP-SUMMARY-${period}`,
      accountCode: '6900', department: 'OTHER_OPS',
      description: `Bảng tổng hợp tiền chợ & mua sắm TikTok ${period}`,
      amount: new Prisma.Decimal(total), total: new Prisma.Decimal(total), status: 'APPROVED',
      expenseDate: summaryDate, paymentMethod: 'CASH',
      notes: 'Đồng bộ Google Sheet — bảng tổng hợp tiền chợ & mua sắm',
    } });
    if (details.length) {
      await this.prisma.expenseItem.createMany({ data: details.map((item) => ({
        expenseId: expense.id, employeeName: item.employeeName, description: item.description,
        category: item.category, amount: new Prisma.Decimal(item.amount), itemDate: item.itemDate,
      })) });
    }
    return details.length;
  }

  private async importPayroll(property: { id: string; orgId: string }, rows: CsvRow[], department: string) {
    const headerIndex = rows.findIndex((row) => {
      const cells = row.map((cell) => normalize(cell));
      return cells.includes('họ và tên') && cells.some((cell) => cell.startsWith('lương cơ bản'));
    });
    const header = rows[headerIndex >= 0 ? headerIndex : 0] ?? [];
    const title = rows.flat().find((cell) => /THÁNG\s+\d{1,2}\/\d{4}/i.test(cell)) ?? '';
    const match = title.match(/THÁNG\s+(\d{1,2})\/(\d{4})/i);
    const period = match ? `${match[2]}-${String(match[1]).padStart(2, '0')}` : '2026-10';
    const normalizedHeader = header.map((cell) => normalize(cell));
    const column = (needle: string) => {
      const wanted = normalize(needle);
      const exact = normalizedHeader.findIndex((cell) => cell === wanted);
      if (exact >= 0) return exact;
      return normalizedHeader.findIndex((cell) => cell.endsWith(wanted));
    };
    const nameCol = column('họ và tên'); const baseCol = column('lương cơ bản'); const workCol = column('tổng công thực tế'); const advanceCol = column('tạm ứng'); const netCol = column('lương thực lãnh'); const standardCol = column('công chuẩn');
    if (nameCol < 0 || baseCol < 0 || netCol < 0) throw new Error('Không tìm thấy cột lương trong Google Sheet');
    const runExisting = await this.prisma.payrollRun.findUnique({ where: { propertyId_period: { propertyId: property.id, period } } });
    const run = runExisting ?? await this.prisma.payrollRun.create({ data: { orgId: property.orgId, propertyId: property.id, period, status: 'DRAFT' } });
    await this.prisma.payrollLine.deleteMany({ where: { payrollRunId: run.id } });
    let count = 0;
    for (const row of rows.slice(headerIndex >= 0 ? headerIndex + 1 : 1)) {
      // A sheet tab can contain a second summary table below the payroll table.
      // Stop at its title OR its repeated "Họ và tên" header instead of parsing
      // its columns with the payroll header.
      const normalizedRow = row.map((cell) => normalize(cell));
      if (normalizedRow.some((cell) => cell.startsWith('bảng tổng hợp') || cell.startsWith('bảng lương')) || normalizedRow.includes('họ và tên')) break;
      const name = (row[nameCol] ?? '').trim();
      if (!name || /^nhân viên\s+\d+$/i.test(name) || normalize(name).startsWith('tổng')) continue;
      const base = money(row[baseCol]);
      const rawNet = money(row[netCol]);
      if (!base || (base < 100_000 && rawNet === 0)) continue;
      const employee = await this.employee(property.orgId, property.id, name, department);
      const standardDays = money(row[standardCol]) || 27;
      const workDays = money(row[workCol]);
      const gross = Math.round((base / standardDays) * workDays);
      const advance = money(row[advanceCol]);
      const net = rawNet;
      await this.prisma.employee.update({ where: { id: employee.id }, data: { baseSalary: new Prisma.Decimal(base) } });
      await this.prisma.payrollLine.create({ data: {
        payrollRunId: run.id, employeeId: employee.id, employeeCode: employee.code, employeeName: name,
        department, baseSalary: new Prisma.Decimal(base), gross: new Prisma.Decimal(gross),
        net: new Prisma.Decimal(net), advanceAmount: new Prisma.Decimal(advance), totalCost: new Prisma.Decimal(gross),
      } });
      count += 1;
    }
    const lines = await this.prisma.payrollLine.findMany({ where: { payrollRunId: run.id } });
    const totals = lines.reduce((sum, line) => ({ gross: sum.gross + Number(line.gross), net: sum.net + Number(line.net), advance: sum.advance + Number(line.advanceAmount) }), { gross: 0, net: 0, advance: 0 });
    await this.prisma.payrollRun.update({ where: { id: run.id }, data: { gross: new Prisma.Decimal(totals.gross), employeeCost: new Prisma.Decimal(totals.gross), deductions: new Prisma.Decimal(totals.advance), net: new Prisma.Decimal(totals.net) } });
    return count;
  }
}
