/**
 * Đồng bộ team Marketing TikTok từ 3 Google Sheet:
 * - Chấm công tháng 10/2026
 * - Bảng lương thực lãnh + tạm ứng tháng 10/2026
 * - Chi phí đi chợ tháng 11/2026 (nguồn tham chiếu)
 *
 * Script idempotent: nhân sự và chấm công được upsert, kỳ lương được dựng lại.
 * Chạy: pnpm --filter @grand-suite/api exec tsx prisma/import-marketing-sheets.ts
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

for (const candidate of ['../../.env.local', '../../.env', '.env.local', '.env']) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) { try { process.loadEnvFile(path); } catch { /* ignore */ } }
}

const prisma = new PrismaClient();

const TEAM = [
  { code: 'NV01', name: 'Thảo Như', workDays: [2, 6, 5, 6], advances: 1_600_000, net: 2_974_074 },
  { code: 'NV02', name: 'Tấn Việt', workDays: [2, 7, 6, 6], advances: 1_500_000, net: 3_555_556 },
  { code: 'NV03', name: 'Mỹ Uyên', workDays: [0, 5, 6, 6], advances: 0, net: 4_092_593 },
];

// 4 tuần đã có dữ liệu: 01–04, 05–11, 12–18, 19–25/10/2026.
const WEEKS = [
  ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
  ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'],
  ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'],
  ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'],
];

// P = đủ công, H = nửa công, O = nghỉ tuần, . = không có dữ liệu
const GRID: Record<string, string[]> = {
  NV01: ['POHH', 'POPPPPP', 'PPPOHPH', 'PPOPPPP'],
  NV02: ['POHH', 'PPPPPPP', 'PPPO PPP'.replace(' ', ''), 'PPOPPPP'],
  NV03: ['. . . .'.replaceAll(' ', ''), '..PPPPP', 'PPPO PPP'.replace(' ', ''), 'PPOPPPP'],
};

const STATUS: Record<string, { status: string; hours: number }> = {
  P: { status: 'PRESENT', hours: 8 },
  H: { status: 'HALF_DAY', hours: 4 },
  O: { status: 'WEEKLY_OFF', hours: 0 },
};

async function main() {
  const hotel = await prisma.property.findFirstOrThrow({ where: { code: 'NVN' } });
  const employeeIds = new Map<string, string>();
  for (const member of TEAM) {
    const employee = await prisma.employee.upsert({
      where: { orgId_code: { orgId: hotel.orgId, code: member.code } },
      update: { propertyId: hotel.id, fullName: member.name, position: 'Nhân viên Marketing TikTok', department: 'TIKTOK', baseSalary: 6_500_000, status: 'ACTIVE' },
      create: { orgId: hotel.orgId, propertyId: hotel.id, code: member.code, fullName: member.name, position: 'Nhân viên Marketing TikTok', department: 'TIKTOK', hireDate: new Date('2026-10-01T00:00:00Z'), baseSalary: 6_500_000, status: 'ACTIVE' },
    });
    employeeIds.set(member.code, employee.id);
    const codes = GRID[member.code]!;
    for (const [weekIndex, dates] of WEEKS.entries()) {
      const week = codes[weekIndex] ?? '';
      for (const [dayIndex, date] of dates.entries()) {
        const code = week[dayIndex];
        const meta = code ? STATUS[code] : undefined;
        if (!meta) continue;
        await prisma.attendance.upsert({
          where: { employeeId_date: { employeeId: employee.id, date: new Date(`${date}T00:00:00Z`) } },
          update: { hours: meta.hours, status: meta.status, notes: 'Đồng bộ Google Sheet chấm công 10/2026' },
          create: { employeeId: employee.id, date: new Date(`${date}T00:00:00Z`), hours: meta.hours, status: meta.status, notes: 'Đồng bộ Google Sheet chấm công 10/2026' },
        });
      }
    }
  }

  const existing = await prisma.payrollRun.findUnique({ where: { propertyId_period: { propertyId: hotel.id, period: '2026-10' } } });
  const lines = TEAM.map((member) => {
    const workDays = member.workDays.reduce((sum, days) => sum + days, 0);
    const base = 6_500_000;
    const gross = Math.round((base / 27) * workDays);
    return {
      employeeId: employeeIds.get(member.code)!, employeeCode: member.code, employeeName: member.name,
      department: 'TIKTOK', baseSalary: base, allowances: 0, overtimePay: 0, gross,
      insuranceEmployee: 0, unionFee: 0, tax: 0, net: member.net, advanceAmount: member.advances,
      insuranceEmployer: 0, totalCost: gross,
    };
  });
  const totals = lines.reduce((acc, line) => ({ gross: acc.gross + line.gross, net: acc.net + line.net, advance: acc.advance + line.advanceAmount }), { gross: 0, net: 0, advance: 0 });
  const run = existing
    ? await prisma.payrollRun.update({ where: { id: existing.id }, data: { gross: totals.gross, employeeCost: totals.gross, deductions: totals.advance, net: totals.net } })
    : await prisma.payrollRun.create({ data: { orgId: hotel.orgId, propertyId: hotel.id, period: '2026-10', status: 'DRAFT', gross: totals.gross, employeeCost: totals.gross, deductions: totals.advance, net: totals.net } });
  await prisma.payrollLine.deleteMany({ where: { payrollRunId: run.id } });
  await prisma.payrollLine.createMany({ data: lines.map((line) => ({ ...line, payrollRunId: run.id })) });
  console.info(`✓ Marketing TikTok: ${TEAM.length} nhân sự, ${await prisma.attendance.count({ where: { employee: { department: 'TIKTOK' } } })} bản ghi chấm công, kỳ lương 2026-10 (tạm ứng ${totals.advance.toLocaleString('vi-VN')} đ).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
