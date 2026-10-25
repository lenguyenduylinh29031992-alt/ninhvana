import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, AppError, moneyToJson } from '@grand-suite/shared';
import { PrismaService } from '../../common/prisma/prisma.module';

export interface RevenueSummaryRow {
  department: string | null;
  channelId: string | null;
  channelCode: string | null;
  channelName: string | null;
  amount: number;
}

export interface RevenueSummary {
  from: string;
  to: string;
  total: number;
  byDepartment: Array<{ department: string; amount: number }>;
  byChannel: Array<{ channelId: string | null; channelCode: string; channelName: string; amount: number }>;
  taxes: number;
  serviceCharge: number;
  netAfterCommission: number;
  commissions: number;
}

/** Read model over the general ledger — the single source of financial truth. */
@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  async revenueSummary(propertyId: string, from: string, to: string): Promise<RevenueSummary> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        department: string | null;
        channelId: string | null;
        channelCode: string | null;
        channelName: string | null;
        amount: Prisma.Decimal;
      }>
    >`
      SELECT jl."department"::text AS department,
             jl."channelId" AS "channelId",
             c."code" AS "channelCode",
             c."name" AS "channelName",
             SUM(jl."credit" - jl."debit") AS amount
        FROM "JournalLine" jl
        JOIN "JournalEntry" je ON je."id" = jl."entryId"
        JOIN "GlAccount" ga ON ga."code" = jl."accountCode" AND ga."orgId" = je."orgId"
        LEFT JOIN "Channel" c ON c."id" = jl."channelId"
       WHERE je."propertyId" = ${propertyId}
         AND je."businessDate" >= ${from}::date
         AND je."businessDate" <= ${to}::date
         AND ga."type" = 'REVENUE'
       GROUP BY jl."department", jl."channelId", c."code", c."name"
    `;

    const totals = await this.prisma.$queryRaw<
      Array<{ revenue: Prisma.Decimal | null; vat: Prisma.Decimal | null; sc: Prisma.Decimal | null; commission: Prisma.Decimal | null }>
    >`
      SELECT
        SUM(CASE WHEN ga."type" = 'REVENUE' THEN jl."credit" - jl."debit" ELSE 0 END) AS revenue,
        SUM(CASE WHEN jl."accountCode" = '3331' THEN jl."credit" - jl."debit" ELSE 0 END) AS vat,
        SUM(CASE WHEN jl."accountCode" = '3380' THEN jl."credit" - jl."debit" ELSE 0 END) AS sc,
        SUM(CASE WHEN jl."accountCode" = '6210' THEN jl."debit" - jl."credit" ELSE 0 END) AS commission
        FROM "JournalLine" jl
        JOIN "JournalEntry" je ON je."id" = jl."entryId"
        JOIN "GlAccount" ga ON ga."code" = jl."accountCode" AND ga."orgId" = je."orgId"
       WHERE je."propertyId" = ${propertyId}
         AND je."businessDate" >= ${from}::date
         AND je."businessDate" <= ${to}::date
    `;

    const byDepartmentMap = new Map<string, number>();
    const byChannelMap = new Map<string, { channelId: string | null; channelCode: string; channelName: string; amount: number }>();
    let total = 0;

    for (const row of rows) {
      const amount = moneyToJson(row.amount);
      total += amount;
      const department = row.department ?? 'UNDISTRIBUTED';
      byDepartmentMap.set(department, (byDepartmentMap.get(department) ?? 0) + amount);
      const key = row.channelId ?? 'none';
      const existing = byChannelMap.get(key) ?? {
        channelId: row.channelId,
        channelCode: row.channelCode ?? 'WALK_IN',
        channelName: row.channelName ?? 'Khách đến trực tiếp',
        amount: 0,
      };
      existing.amount += amount;
      byChannelMap.set(key, existing);
    }

    const summary = totals[0];
    const revenue = moneyToJson(summary?.revenue ?? 0);
    const vat = moneyToJson(summary?.vat ?? 0);
    const sc = moneyToJson(summary?.sc ?? 0);
    const commission = moneyToJson(summary?.commission ?? 0);

    return {
      from,
      to,
      total: Number(total.toFixed(2)),
      byDepartment: [...byDepartmentMap.entries()]
        .map(([department, amount]) => ({ department, amount: Number(amount.toFixed(2)) }))
        .sort((a, b) => b.amount - a.amount),
      byChannel: [...byChannelMap.values()]
        .map((row) => ({ ...row, amount: Number(row.amount.toFixed(2)) }))
        .sort((a, b) => b.amount - a.amount),
      taxes: Number(vat.toFixed(2)),
      serviceCharge: Number(sc.toFixed(2)),
      commissions: Number(commission.toFixed(2)),
      netAfterCommission: Number((revenue - commission).toFixed(2)),
    };
  }

  /**
   * Full reconciliation used by the night audit and acceptance tests:
   * revenue from the ledger ↔ departmental split ↔ channel split ↔ folio charges
   * ↔ payments, with an explicit difference for each dimension.
   */
  async reconcile(propertyId: string, from: string, to: string) {
    const summary = await this.revenueSummary(propertyId, from, to);
    const deptTotal = summary.byDepartment.reduce((acc, row) => acc + row.amount, 0);
    const channelTotal = summary.byChannel.reduce((acc, row) => acc + row.amount, 0);

    const ledger = await this.prisma.$queryRaw<
      Array<{ debit: Prisma.Decimal | null; credit: Prisma.Decimal | null; entries: bigint }>
    >`
      SELECT SUM(jl."debit") AS debit, SUM(jl."credit") AS credit, COUNT(DISTINCT je."id") AS entries
        FROM "JournalLine" jl
        JOIN "JournalEntry" je ON je."id" = jl."entryId"
       WHERE je."propertyId" = ${propertyId}
         AND je."businessDate" >= ${from}::date
         AND je."businessDate" <= ${to}::date
    `;

    const folio = await this.prisma.$queryRaw<
      Array<{ net: Prisma.Decimal | null; vat: Prisma.Decimal | null; sc: Prisma.Decimal | null; gross: Prisma.Decimal | null; charges: bigint }>
    >`
      SELECT SUM("amount") AS net, SUM("taxAmount") AS vat, SUM("serviceCharge") AS sc,
             SUM("total") AS gross, COUNT(*) AS charges
        FROM "FolioItem"
       WHERE "propertyId" = ${propertyId}
         AND "businessDate" >= ${new Date(`${from}T00:00:00Z`)}
         AND "businessDate" <= ${new Date(`${to}T00:00:00Z`)}
         AND "isVoid" = false
         AND "type" IN ('ROOM_CHARGE','FNB_CHARGE','SPA_CHARGE','EVENT_CHARGE','OTHER_CHARGE')
    `;

    const payments = await this.prisma.$queryRaw<Array<{ method: string; amount: Prisma.Decimal | null }>>`
      SELECT "method"::text AS method, SUM("amount") AS amount
        FROM "Payment"
       WHERE "propertyId" = ${propertyId}
         AND "businessDate" >= ${new Date(`${from}T00:00:00Z`)}
         AND "businessDate" <= ${new Date(`${to}T00:00:00Z`)}
         AND "status" = 'SUCCESS'
       GROUP BY "method"
    `;

    const folioNet = moneyToJson(folio[0]?.net ?? 0);
    const folioTotal = moneyToJson(folio[0]?.gross ?? 0);
    const paymentTotal = payments.reduce((acc, row) => acc + moneyToJson(row.amount ?? 0), 0);

    const checks = [
      {
        key: 'ledger_balanced',
        label: 'Tổng Nợ = Tổng Có',
        expected: moneyToJson(ledger[0]?.credit ?? 0),
        actual: moneyToJson(ledger[0]?.debit ?? 0),
      },
      {
        key: 'department_vs_total',
        label: 'Tổng theo bộ phận = Doanh thu',
        expected: summary.total,
        actual: deptTotal,
      },
      {
        key: 'channel_vs_total',
        label: 'Tổng theo kênh = Doanh thu',
        expected: summary.total,
        actual: channelTotal,
      },
      {
        key: 'folio_within_ledger',
        label: 'Doanh thu folio không vượt quá sổ',
        expected: summary.total,
        actual: folioNet,
      },
    ].map((check) => ({
      ...check,
      difference: Number((check.actual - check.expected).toFixed(2)),
      // Folio charges are a subset of ledger revenue (POS direct sales never
      // reach a folio), so containment — not equality — is the correct check.
      ok:
        check.key === 'folio_within_ledger'
          ? check.actual <= check.expected + 0.5
          : Math.abs(check.actual - check.expected) < 0.5,
    }));

    return {
      from,
      to,
      revenue: summary.total,
      departmentTotal: deptTotal,
      channelTotal,
      ledgerDebit: moneyToJson(ledger[0]?.debit ?? 0),
      ledgerCredit: moneyToJson(ledger[0]?.credit ?? 0),
      ledgerEntries: Number(ledger[0]?.entries ?? 0),
      folioNet,
      folioTax: moneyToJson(folio[0]?.vat ?? 0),
      folioServiceCharge: moneyToJson(folio[0]?.sc ?? 0),
      folioGross: folioTotal,
      folioCharges: Number(folio[0]?.charges ?? 0),
      payments: payments.map((row) => ({
        method: row.method,
        amount: moneyToJson(row.amount ?? 0),
      })),
      paymentTotal: Number(paymentTotal.toFixed(2)),
      byDepartment: summary.byDepartment,
      byChannel: summary.byChannel,
      checks,
      balanced: checks.every((check) => check.ok),
    };
  }

  async revenueTrend(propertyIds: string[], from: string, to: string) {
    if (propertyIds.length === 0) return [] as Array<{ date: string; amount: number }>;
    const rows = await this.prisma.$queryRaw<Array<{ date: string; amount: Prisma.Decimal }>>`
      SELECT to_char(je."businessDate", 'YYYY-MM-DD') AS date, SUM(jl."credit" - jl."debit") AS amount
        FROM "JournalLine" jl
        JOIN "JournalEntry" je ON je."id" = jl."entryId"
        JOIN "GlAccount" ga ON ga."code" = jl."accountCode" AND ga."orgId" = je."orgId"
       WHERE je."propertyId" = ANY(${propertyIds}::text[])
         AND je."businessDate" >= ${from}::date
         AND je."businessDate" <= ${to}::date
         AND ga."type" = 'REVENUE'
       GROUP BY je."businessDate"
       ORDER BY je."businessDate"
    `;
    return rows.map((row) => ({ date: row.date, amount: moneyToJson(row.amount) }));
  }

  async trialBalance(propertyId: string, date: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{ accountCode: string; name: string; type: string; debit: Prisma.Decimal | null; credit: Prisma.Decimal | null }>
    >`
      SELECT jl."accountCode" AS "accountCode", ga."name" AS name, ga."type"::text AS type,
             SUM(jl."debit") AS debit, SUM(jl."credit") AS credit
        FROM "JournalLine" jl
        JOIN "JournalEntry" je ON je."id" = jl."entryId"
        LEFT JOIN "GlAccount" ga ON ga."code" = jl."accountCode" AND ga."orgId" = je."orgId"
       WHERE je."propertyId" = ${propertyId}
         AND je."businessDate" <= ${date}::date
       GROUP BY jl."accountCode", ga."name", ga."type"
       ORDER BY jl."accountCode"
    `;
    const lines = rows.map((row) => ({
      accountCode: row.accountCode,
      name: row.name ?? row.accountCode,
      type: row.type ?? 'UNKNOWN',
      debit: moneyToJson(row.debit ?? 0),
      credit: moneyToJson(row.credit ?? 0),
      balance: Number((moneyToJson(row.debit ?? 0) - moneyToJson(row.credit ?? 0)).toFixed(2)),
    }));
    const debit = lines.reduce((acc, line) => acc + line.debit, 0);
    const credit = lines.reduce((acc, line) => acc + line.credit, 0);
    return { date, lines, debit, credit, balanced: Math.abs(debit - credit) < 0.5 };
  }

  async journal(propertyId: string, from: string, to: string, page: number, pageSize: number) {
    const where = {
      propertyId,
      businessDate: {
        gte: new Date(`${from}T00:00:00Z`),
        lte: new Date(`${to}T00:00:00Z`),
      },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        include: { lines: true },
        orderBy: [{ businessDate: 'desc' }, { postedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return {
      items: items.map((entry) => ({
        id: entry.id,
        number: entry.number,
        businessDate: entry.businessDate.toISOString().slice(0, 10),
        sourceType: entry.sourceType,
        memo: entry.memo,
        totalDebit: moneyToJson(entry.totalDebit),
        totalCredit: moneyToJson(entry.totalCredit),
        lines: entry.lines.map((line) => ({
          accountCode: line.accountCode,
          description: line.description,
          debit: moneyToJson(line.debit),
          credit: moneyToJson(line.credit),
          department: line.department,
          channelId: line.channelId,
        })),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  assertProperty(propertyId: string | null | undefined): string {
    if (!propertyId) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Thiếu cơ sở', 422);
    return propertyId;
  }
}
