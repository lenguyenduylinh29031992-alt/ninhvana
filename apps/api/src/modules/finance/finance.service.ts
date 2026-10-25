import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { daysBetween, isoToday, parseIsoDate } from '@grand-suite/shared';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { PrismaService } from '../../common/prisma/prisma.module';

const FIXED_CHARGES = ['6410', '6420', '6430', '6500'];
const CASH_ACCOUNTS = ['1110', '1120'];
const DEPARTMENT_LABEL: Record<string, string> = {
  ROOMS: 'Phòng', FNB: 'F&B', SPA: 'Spa', OTHER_OPERATED: 'Dịch vụ khác',
  MISCELLANEOUS: 'Khác', UNDISTRIBUTED: 'Chưa phân bổ', ADMIN: 'Hành chính',
};

interface LedgerRow {
  department: string | null;
  type: string;
  code: string;
  name: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async profitAndLoss(actor: AuthUser, propertyId: string, from: string, to: string) {
    assertPropertyAccess(actor, propertyId);
    const rows = await this.prisma.$queryRaw<LedgerRow[]>`
      SELECT jl."department"::text AS department, ga."type"::text AS type,
             jl."accountCode" AS code, ga."name" AS name,
             SUM(jl."debit") AS debit, SUM(jl."credit") AS credit
        FROM "JournalLine" jl
        JOIN "JournalEntry" je ON je."id" = jl."entryId"
        JOIN "GlAccount" ga ON ga."orgId" = je."orgId" AND ga."code" = jl."accountCode"
       WHERE je."propertyId" = ${propertyId}
         AND je."businessDate" >= ${from}::date
         AND je."businessDate" <= ${to}::date
       GROUP BY jl."department", ga."type", jl."accountCode", ga."name"
    `;
    const num = (value: Prisma.Decimal) => Number(value ?? 0);
    let revenue = 0;
    let cogs = 0;
    let payroll = 0;
    let otherOperating = 0;
    let fixedCharges = 0;
    const departments = new Map<string, { revenue: number; cost: number }>();
    const expenseLines = new Map<string, { code: string; name: string; amount: number }>();
    const revenueLines = new Map<string, { code: string; name: string; amount: number }>();

    for (const row of rows) {
      if (row.type === 'REVENUE') {
        const amount = num(row.credit) - num(row.debit);
        revenue += amount;
        const key = row.department ?? 'UNDISTRIBUTED';
        const entry = departments.get(key) ?? { revenue: 0, cost: 0 };
        entry.revenue += amount;
        departments.set(key, entry);
        const line = revenueLines.get(row.code) ?? { code: row.code, name: row.name, amount: 0 };
        line.amount += amount;
        revenueLines.set(row.code, line);
        continue;
      }
      if (row.type !== 'COGS' && row.type !== 'EXPENSE') continue;
      const amount = num(row.debit) - num(row.credit);
      if (row.type === 'COGS') cogs += amount;
      else if (row.code === '6000' || row.code === '6010') payroll += amount;
      else if (FIXED_CHARGES.includes(row.code)) fixedCharges += amount;
      else otherOperating += amount;
      const key = row.department ?? 'UNDISTRIBUTED';
      const entry = departments.get(key) ?? { revenue: 0, cost: 0 };
      entry.cost += amount;
      departments.set(key, entry);
      const line = expenseLines.get(row.code) ?? { code: row.code, name: row.name, amount: 0 };
      line.amount += amount;
      expenseLines.set(row.code, line);
    }

    const rooms = await this.prisma.room.count({ where: { propertyId, isActive: true } });
    const nights = Math.max(1, daysBetween(from, to) + 1);
    const availableRoomNights = rooms * nights;
    const gop = revenue - cogs - payroll - otherOperating;
    const netProfit = gop - fixedCharges;
    const departmentRows = [...departments.entries()]
      .map(([department, values]) => ({
        department,
        label: DEPARTMENT_LABEL[department] ?? department,
        revenue: Number(values.revenue.toFixed(2)),
        cost: Number(values.cost.toFixed(2)),
        profit: Number((values.revenue - values.cost).toFixed(2)),
        margin: values.revenue > 0 ? Number(((values.revenue - values.cost) / values.revenue * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      propertyId,
      from,
      to,
      currency: 'VND',
      revenue: Number(revenue.toFixed(2)),
      costOfSales: Number(cogs.toFixed(2)),
      payroll: Number(payroll.toFixed(2)),
      otherOperating: Number(otherOperating.toFixed(2)),
      fixedCharges: Number(fixedCharges.toFixed(2)),
      totalCost: Number((cogs + payroll + otherOperating + fixedCharges).toFixed(2)),
      gop: Number(gop.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      gopMargin: revenue > 0 ? Number((gop / revenue * 100).toFixed(1)) : 0,
      netMargin: revenue > 0 ? Number((netProfit / revenue * 100).toFixed(1)) : 0,
      availableRoomNights,
      gopPar: availableRoomNights > 0 ? Number((gop / availableRoomNights).toFixed(0)) : 0,
      revPar: availableRoomNights > 0 ? Number((revenue / availableRoomNights).toFixed(0)) : 0,
      departments: departmentRows,
      revenueAccounts: [...revenueLines.values()].map((row) => ({ ...row, amount: Number(row.amount.toFixed(2)) })),
      expenseAccounts: [...expenseLines.values()].map((row) => ({ ...row, amount: Number(row.amount.toFixed(2)) })),
      fixedChargeAccounts: FIXED_CHARGES,
    };
  }

  async balanceSheet(actor: AuthUser, propertyId: string, asOf: string) {
    assertPropertyAccess(actor, propertyId);
    const rows = await this.prisma.$queryRaw<LedgerRow[]>`
      SELECT jl."department"::text AS department, ga."type"::text AS type,
             jl."accountCode" AS code, ga."name" AS name,
             SUM(jl."debit") AS debit, SUM(jl."credit") AS credit
        FROM "JournalLine" jl
        JOIN "JournalEntry" je ON je."id" = jl."entryId"
        JOIN "GlAccount" ga ON ga."orgId" = je."orgId" AND ga."code" = jl."accountCode"
       WHERE je."propertyId" = ${propertyId}
         AND je."businessDate" <= ${asOf}::date
         AND ga."type" IN ('ASSET','LIABILITY','EQUITY')
       GROUP BY jl."department", ga."type", jl."accountCode", ga."name"
    `;
    const pnl = await this.prisma.$queryRaw<Array<{ type: string; amount: Prisma.Decimal }>>`
      SELECT ga."type"::text AS type,
             SUM(CASE WHEN ga."type" = 'REVENUE' THEN jl."credit" - jl."debit" ELSE jl."debit" - jl."credit" END) AS amount
        FROM "JournalLine" jl
        JOIN "JournalEntry" je ON je."id" = jl."entryId"
        JOIN "GlAccount" ga ON ga."orgId" = je."orgId" AND ga."code" = jl."accountCode"
       WHERE je."propertyId" = ${propertyId} AND je."businessDate" <= ${asOf}::date
         AND ga."type" IN ('REVENUE','COGS','EXPENSE')
       GROUP BY ga."type"
    `;
    const income = pnl.filter((row) => row.type === 'REVENUE').reduce((sum, row) => sum + Number(row.amount), 0)
      - pnl.filter((row) => row.type !== 'REVENUE').reduce((sum, row) => sum + Number(row.amount), 0);
    const group = (type: string) => rows
      .filter((row) => row.type === type)
      .map((row) => ({
        code: row.code,
        name: row.name,
        amount: Number(((type === 'ASSET' ? Number(row.debit) - Number(row.credit) : Number(row.credit) - Number(row.debit))).toFixed(2)),
      }))
      .filter((row) => row.amount !== 0);
    const assets = group('ASSET');
    const liabilities = group('LIABILITY');
    const equity = group('EQUITY');
    const totalAssets = assets.reduce((sum, row) => sum + row.amount, 0);
    const totalLiabilities = liabilities.reduce((sum, row) => sum + row.amount, 0);
    const equityAccounts = equity.reduce((sum, row) => sum + row.amount, 0);
    const retainedEarnings = Number(income.toFixed(2));
    const totalEquity = Number((equityAccounts + retainedEarnings).toFixed(2));
    const difference = Number((totalAssets - totalLiabilities - totalEquity).toFixed(2));
    return {
      propertyId, asOf, currency: 'VND',
      assets, liabilities, equity: [...equity, { code: 'RETAINED', name: 'Lợi nhuận chưa phân phối (tính toán)', amount: retainedEarnings }],
      totalAssets: Number(totalAssets.toFixed(2)),
      totalLiabilities: Number(totalLiabilities.toFixed(2)),
      totalEquity,
      retainedEarnings,
      difference,
      balanced: Math.abs(difference) < 1,
    };
  }

  async cashFlow(actor: AuthUser, propertyId: string, from: string, to: string) {
    assertPropertyAccess(actor, propertyId);
    const openingRows = await this.prisma.$queryRaw<Array<{ amount: Prisma.Decimal }>>`
      SELECT COALESCE(SUM(jl."debit" - jl."credit"), 0) AS amount
        FROM "JournalLine" jl JOIN "JournalEntry" je ON je."id" = jl."entryId"
       WHERE je."propertyId" = ${propertyId} AND je."businessDate" < ${from}::date
         AND jl."accountCode" IN ('1110','1120')
    `;
    const entries = await this.prisma.journalEntry.findMany({
      where: { propertyId, businessDate: { gte: parseIsoDate(from), lte: parseIsoDate(to) } },
      include: { lines: true },
    });
    let operating = 0;
    let investing = 0;
    let financing = 0;
    for (const entry of entries) {
      const cash = entry.lines.filter((line) => CASH_ACCOUNTS.includes(line.accountCode));
      if (cash.length === 0) continue;
      const movement = cash.reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0);
      const others = entry.lines.filter((line) => !CASH_ACCOUNTS.includes(line.accountCode));
      const isInvesting = others.some((line) => line.accountCode.startsWith('21'));
      const isFinancing = others.some((line) => ['4110', '4210'].includes(line.accountCode));
      if (isInvesting) investing += movement;
      else if (isFinancing) financing += movement;
      else operating += movement;
    }
    const opening = Number(openingRows[0]?.amount ?? 0);
    const netChange = operating + investing + financing;
    return {
      propertyId, from, to, currency: 'VND',
      openingCash: Number(opening.toFixed(2)),
      operating: Number(operating.toFixed(2)),
      investing: Number(investing.toFixed(2)),
      financing: Number(financing.toFixed(2)),
      netChange: Number(netChange.toFixed(2)),
      closingCash: Number((opening + netChange).toFixed(2)),
    };
  }

  async arAging(actor: AuthUser, propertyId: string, asOf = isoToday()) {
    assertPropertyAccess(actor, propertyId);
    const invoices = await this.prisma.invoice.findMany({
      where: { propertyId, balance: { gt: 0 }, status: { notIn: ['VOID', 'PAID'] } },
      include: { guest: true },
      orderBy: { dueDate: 'asc' },
    });
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    const rows = invoices.map((invoice) => {
      const base = invoice.dueDate ?? invoice.issuedAt;
      const overdue = daysBetween(base.toISOString().slice(0, 10), asOf);
      const amount = Number(invoice.balance);
      if (overdue <= 0) buckets.current += amount;
      else if (overdue <= 30) buckets.d1_30 += amount;
      else if (overdue <= 60) buckets.d31_60 += amount;
      else if (overdue <= 90) buckets.d61_90 += amount;
      else buckets.d90_plus += amount;
      return {
        id: invoice.id, number: invoice.number, customer: invoice.buyerName ?? invoice.guest?.fullName ?? 'Khách lẻ',
        dueDate: base.toISOString().slice(0, 10), overdueDays: Math.max(0, overdue), balance: amount, status: invoice.status,
      };
    });
    return { propertyId, asOf, total: rows.reduce((sum, row) => sum + row.balance, 0), buckets, rows };
  }

  async apAging(actor: AuthUser, propertyId: string, asOf = isoToday()) {
    assertPropertyAccess(actor, propertyId);
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: { propertyId, balance: { gt: 0 } },
      include: { supplier: true },
      orderBy: { dueDate: 'asc' },
    });
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    const rows = invoices.map((invoice) => {
      const overdue = daysBetween(invoice.dueDate.toISOString().slice(0, 10), asOf);
      const amount = Number(invoice.balance);
      if (overdue <= 0) buckets.current += amount;
      else if (overdue <= 30) buckets.d1_30 += amount;
      else if (overdue <= 60) buckets.d31_60 += amount;
      else if (overdue <= 90) buckets.d61_90 += amount;
      else buckets.d90_plus += amount;
      return {
        id: invoice.id, number: invoice.number, supplier: invoice.supplier.name,
        dueDate: invoice.dueDate.toISOString().slice(0, 10), overdueDays: Math.max(0, overdue), balance: amount, status: invoice.status,
      };
    });
    return { propertyId, asOf, total: rows.reduce((sum, row) => sum + row.balance, 0), buckets, rows };
  }
}
