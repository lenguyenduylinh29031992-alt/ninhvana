import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const money = (value: number) => new Prisma.Decimal(value.toFixed(2));
const DAY = 86_400_000;

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(date: Date, days: number) { return new Date(date.getTime() + days * DAY); }

/** Deterministic pseudo-random so every rebuild produces the same demo. */
function rng(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const MONTH_FACTOR = [0.82, 0.86, 0.95, 1.02, 1.06, 1.18, 1.24, 1.2, 1.05, 1.12, 1.08, 1.25];

async function entry(input: {
  orgId: string; propertyId: string; businessDate: Date; number: string; sourceId: string;
  sourceType: 'NIGHT_AUDIT' | 'EXPENSE'; memo: string;
  lines: Array<{ accountCode: string; description: string; debit: number; credit: number; department?: string }>;
}) {
  const debit = input.lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = input.lines.reduce((sum, line) => sum + line.credit, 0);
  if (Math.abs(debit - credit) > 0.01) throw new Error(`unbalanced ${input.memo}`);
  await prisma.journalEntry.create({
    data: {
      orgId: input.orgId, propertyId: input.propertyId, businessDate: input.businessDate,
      number: input.number, sourceType: input.sourceType, sourceId: input.sourceId,
      memo: input.memo, totalDebit: money(debit), totalCredit: money(credit),
      lines: { create: input.lines.map((line) => ({ accountCode: line.accountCode, description: line.description, debit: money(line.debit), credit: money(line.credit), department: (line.department ?? null) as never })) },
    },
  });
}

async function main() {
  const properties = await prisma.property.findMany({ where: { type: 'HOTEL', isActive: true } });
  if (properties.length === 0) throw new Error('Run base seed first');
  const orgId = properties[0]!.orgId;

  await prisma.journalEntry.deleteMany({ where: { propertyId: { in: properties.map((p) => p.id) }, sourceId: { startsWith: 'long-' } } });

  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const end = addDays(today, -31);
  const start = new Date(Date.UTC(today.getUTCFullYear() - 2, today.getUTCMonth(), 1));
  let revenueEntries = 0;
  let costEntries = 0;

  for (const [propertyIndex, property] of properties.entries()) {
    const random = rng(1103 + propertyIndex * 97);
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const date = iso(cursor);
      const month = cursor.getUTCMonth();
      const weekday = cursor.getUTCDay();
      const seasonal = MONTH_FACTOR[month]!;
      const weekend = weekday === 5 || weekday === 6 ? 1.16 : weekday === 0 ? 1.05 : 1;
      const noise = 0.9 + random() * 0.2;
      const rooms = 1_650_000_000 * seasonal * weekend * noise;
      const fnb = rooms * (0.09 + random() * 0.03);
      const beverage = rooms * (0.018 + random() * 0.008);
      const commission = rooms * (0.11 + random() * 0.025);
      await entry({
        orgId, propertyId: property.id, businessDate: new Date(`${date}T00:00:00Z`), number: `LH-${property.code}-${date}`,
        sourceId: `long-rev-${property.code}-${date}`, sourceType: 'NIGHT_AUDIT', memo: `Doanh thu ${date}`,
        lines: [
          { accountCode: '1310', description: 'Phải thu khách hàng', debit: rooms + fnb + beverage, credit: 0 },
          { accountCode: '1000', description: 'Doanh thu phòng', debit: 0, credit: rooms, department: 'ROOMS' },
          { accountCode: '2000', description: 'Doanh thu món ăn', debit: 0, credit: fnb, department: 'FNB' },
          { accountCode: '2100', description: 'Doanh thu đồ uống', debit: 0, credit: beverage, department: 'FNB' },
          { accountCode: '6210', description: 'Hoa hồng OTA', debit: commission, credit: 0, department: 'ROOMS' },
          { accountCode: '3310', description: 'Phải trả kênh', debit: 0, credit: commission },
        ],
      });
      revenueEntries += 1;
    }

    const months = new Map<string, Date>();
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) months.set(iso(cursor).slice(0, 7), new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1)));
    for (const [period] of months) {
      const costDate = new Date(`${period}-28T00:00:00Z`);
      const rent = 450_000_000;
      const insurance = 45_000_000;
      const utilities = 190_000_000 + random() * 40_000_000;
      const marketing = 95_000_000 + random() * 30_000_000;
      const payroll = 430_000_000 + random() * 60_000_000;
      await entry({
        orgId, propertyId: property.id, businessDate: costDate, number: `LC-${property.code}-${period}`,
        sourceId: `long-cost-${property.code}-${period}`, sourceType: 'EXPENSE', memo: `Chi phí vận hành ${period}`,
        lines: [
          { accountCode: '6410', description: 'Thuê mặt bằng', debit: rent, credit: 0, department: 'FIXED' },
          { accountCode: '6420', description: 'Bảo hiểm tài sản', debit: insurance, credit: 0, department: 'FIXED' },
          { accountCode: '6100', description: 'Điện', debit: utilities, credit: 0, department: 'UTILITIES' },
          { accountCode: '6200', description: 'Marketing', debit: marketing, credit: 0, department: 'SALES' },
          { accountCode: '6000', description: 'Lương & phụ cấp', debit: payroll, credit: 0 },
          { accountCode: '3310', description: 'Phải trả nhà cung cấp', debit: 0, credit: rent + insurance + utilities + marketing },
          { accountCode: '3340', description: 'Phải trả người lao động', debit: 0, credit: payroll },
        ],
      });
      costEntries += 1;
    }
  }

  console.info('long history seeded', { from: iso(start), to: iso(end), revenueEntries, costEntries });
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
