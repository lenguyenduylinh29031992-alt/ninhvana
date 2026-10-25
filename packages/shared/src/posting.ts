import Decimal from 'decimal.js';
import type { DepartmentGroup } from './ledger';
import { roundMoney, type Numeric } from './money';

/** USALI/TT200 account codes used by the posting engine. */
export const POSTING_ACCOUNTS = {
  ACCOUNTS_RECEIVABLE: '1310',
  CITY_LEDGER: '1310',
  CASH: '1110',
  BANK: '1120',
  CARD_CLEARING: '1120',
  GATEWAY_CLEARING: '1120',
  VAT_PAYABLE: '3331',
  SERVICE_CHARGE_PAYABLE: '3380',
  COMMISSION_EXPENSE: '6210',
  ACCOUNTS_PAYABLE: '3310',
  DISCOUNTS: '4900',
} as const;

export type LedgerAccountCode = (typeof POSTING_ACCOUNTS)[keyof typeof POSTING_ACCOUNTS];

export interface ChargePosting {
  glAccountCode: string;
  department: DepartmentGroup;
  net: Numeric;
  serviceCharge: Numeric;
  vat: Numeric;
  total: Numeric;
  description: string;
  channelId?: string | null;
  guestId?: string | null;
  reservationId?: string | null;
  debitAccount?: string;
}

export interface PaymentPosting {
  method: string;
  amount: Numeric;
  reference?: string | null;
  guestId?: string | null;
  reservationId?: string | null;
}

export interface LedgerLineDraft {
  accountCode: string;
  description: string;
  debit: Decimal;
  credit: Decimal;
  department?: DepartmentGroup | null;
  channelId?: string | null;
  guestId?: string | null;
  reservationId?: string | null;
}

export interface JournalDraft {
  memo: string;
  lines: LedgerLineDraft[];
  totalDebit: Decimal;
  totalCredit: Decimal;
}

export class UnbalancedJournalError extends Error {
  constructor(
    message: string,
    readonly totalDebit: string,
    readonly totalCredit: string,
  ) {
    super(message);
    this.name = 'UnbalancedJournalError';
  }
}

export function paymentGlAccount(method: string): string {
  switch (method) {
    case 'CASH':
      return POSTING_ACCOUNTS.CASH;
    case 'CARD':
      return POSTING_ACCOUNTS.CARD_CLEARING;
    case 'BANK_TRANSFER':
    case 'VIETQR':
    case 'VNPAY':
    case 'MOMO':
    case 'ZALO_PAY':
    case 'STRIPE':
      return POSTING_ACCOUNTS.GATEWAY_CLEARING;
    case 'COMPANY_AR':
      return POSTING_ACCOUNTS.CITY_LEDGER;
    default:
      return POSTING_ACCOUNTS.BANK;
  }
}

/** Drops zero lines and asserts that debits equal credits to the đồng. */
export function finalizeJournal(memo: string, rawLines: LedgerLineDraft[], currency = 'VND'): JournalDraft {
  const lines = rawLines
    .map((line) => ({
      ...line,
      debit: roundMoney(line.debit, currency),
      credit: roundMoney(line.credit, currency),
    }))
    .filter((line) => !line.debit.isZero() || !line.credit.isZero())
    .filter((line) => !(line.debit.isZero() && line.credit.isZero()));

  const totalDebit = roundMoney(
    lines.reduce((acc, line) => acc.plus(line.debit), new Decimal(0)),
    currency,
  );
  const totalCredit = roundMoney(
    lines.reduce((acc, line) => acc.plus(line.credit), new Decimal(0)),
    currency,
  );

  if (!totalDebit.equals(totalCredit)) {
    throw new UnbalancedJournalError(
      `Bút toán không cân bằng: Nợ ${totalDebit} / Có ${totalCredit}`,
      totalDebit.toString(),
      totalCredit.toString(),
    );
  }

  return { memo, lines, totalDebit, totalCredit };
}

/**
 * Revenue recognition:
 *   Dr Accounts Receivable (gross)
 *   Cr departmental revenue (net, grouped by account/department/channel)
 *   Cr VAT payable
 *   Cr service-charge payable
 */
export function buildRevenueDraft(params: {
  memo: string;
  charges: ChargePosting[];
  currency?: string;
}): JournalDraft {
  const currency = params.currency ?? 'VND';
  const debitAccount = params.charges[0]?.debitAccount ?? POSTING_ACCOUNTS.ACCOUNTS_RECEIVABLE;
  const revenueGroups = new Map<
    string,
    { accountCode: string; department: DepartmentGroup; channelId: string | null; amount: Decimal; description: string }
  >();

  let gross = new Decimal(0);
  let serviceCharge = new Decimal(0);
  let vat = new Decimal(0);

  for (const charge of params.charges) {
    const net = roundMoney(charge.net, currency);
    const sc = roundMoney(charge.serviceCharge, currency);
    const tax = roundMoney(charge.vat, currency);
    gross = gross.plus(roundMoney(charge.total, currency));
    serviceCharge = serviceCharge.plus(sc);
    vat = vat.plus(tax);

    const key = `${charge.glAccountCode}|${charge.department}|${charge.channelId ?? ''}`;
    const group = revenueGroups.get(key) ?? {
      accountCode: charge.glAccountCode,
      department: charge.department,
      channelId: charge.channelId ?? null,
      amount: new Decimal(0),
      description: charge.description,
    };
    group.amount = group.amount.plus(net);
    revenueGroups.set(key, group);
  }

  const lines: LedgerLineDraft[] = [
    {
      accountCode: debitAccount,
      description: params.memo,
      debit: roundMoney(gross, currency),
      credit: new Decimal(0),
    },
  ];

  for (const group of revenueGroups.values()) {
    lines.push({
      accountCode: group.accountCode,
      description: group.description,
      debit: new Decimal(0),
      credit: roundMoney(group.amount, currency),
      department: group.department,
      channelId: group.channelId,
    });
  }

  if (!serviceCharge.isZero()) {
    lines.push({
      accountCode: POSTING_ACCOUNTS.SERVICE_CHARGE_PAYABLE,
      description: 'Phí dịch vụ phải trả',
      debit: new Decimal(0),
      credit: roundMoney(serviceCharge, currency),
    });
  }
  if (!vat.isZero()) {
    lines.push({
      accountCode: POSTING_ACCOUNTS.VAT_PAYABLE,
      description: 'Thuế GTGT phải nộp',
      debit: new Decimal(0),
      credit: roundMoney(vat, currency),
    });
  }

  return finalizeJournal(params.memo, lines, currency);
}

/** Cash receipt: Dr cash/bank clearing, Cr accounts receivable. */
export function buildPaymentDraft(params: {
  memo: string;
  payments: PaymentPosting[];
  currency?: string;
}): JournalDraft {
  const currency = params.currency ?? 'VND';
  const groups = new Map<string, Decimal>();
  let total = new Decimal(0);

  for (const payment of params.payments) {
    const amount = roundMoney(payment.amount, currency);
    total = total.plus(amount);
    const account = paymentGlAccount(payment.method);
    groups.set(account, (groups.get(account) ?? new Decimal(0)).plus(amount));
  }

  const lines: LedgerLineDraft[] = [];
  for (const [accountCode, amount] of groups) {
    lines.push({
      accountCode,
      description: params.memo,
      debit: amount,
      credit: new Decimal(0),
    });
  }
  lines.push({
    accountCode: POSTING_ACCOUNTS.ACCOUNTS_RECEIVABLE,
    description: params.memo,
    debit: new Decimal(0),
    credit: total,
  });

  return finalizeJournal(params.memo, lines, currency);
}

/** OTA commission accrual: Dr commission expense, Cr accrued payable. */
export function buildCommissionDraft(params: {
  memo: string;
  amount: Numeric;
  channelId?: string | null;
  reservationId?: string | null;
  currency?: string;
}): JournalDraft {
  const currency = params.currency ?? 'VND';
  const amount = roundMoney(params.amount, currency);
  return finalizeJournal(
    params.memo,
    [
      {
        accountCode: POSTING_ACCOUNTS.COMMISSION_EXPENSE,
        description: params.memo,
        debit: amount,
        credit: new Decimal(0),
        channelId: params.channelId ?? null,
        reservationId: params.reservationId ?? null,
      },
      {
        accountCode: POSTING_ACCOUNTS.ACCOUNTS_PAYABLE,
        description: params.memo,
        debit: new Decimal(0),
        credit: amount,
        channelId: params.channelId ?? null,
        reservationId: params.reservationId ?? null,
      },
    ],
    currency,
  );
}

export function trialBalance(lines: LedgerLineDraft[]): {
  debit: Decimal;
  credit: Decimal;
  balanced: boolean;
} {
  const debit = lines.reduce((acc, line) => acc.plus(line.debit), new Decimal(0));
  const credit = lines.reduce((acc, line) => acc.plus(line.credit), new Decimal(0));
  return { debit, credit, balanced: debit.equals(credit) };
}
