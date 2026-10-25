import { describe, expect, it } from 'vitest';
import {
  buildCommissionDraft,
  buildPaymentDraft,
  buildRevenueDraft,
  finalizeJournal,
  paymentGlAccount,
  trialBalance,
  UnbalancedJournalError,
} from './posting';

const charge = (overrides: Partial<Parameters<typeof buildRevenueDraft>[0]['charges'][number]> = {}) => ({
  glAccountCode: '1000',
  department: 'ROOMS' as const,
  net: 1_000_000,
  serviceCharge: 50_000,
  vat: 84_000,
  total: 1_134_000,
  description: 'Phòng Deluxe',
  channelId: 'channel-direct',
  ...overrides,
});

describe('revenue posting', () => {
  it('debits AR for the gross and credits revenue, VAT and service charge', () => {
    const draft = buildRevenueDraft({ memo: 'Doanh thu phòng', charges: [charge()] });
    const balance = trialBalance(draft.lines);
    expect(balance.balanced).toBe(true);
    expect(draft.totalDebit.toFixed(0)).toBe('1134000');
    expect(draft.totalCredit.toFixed(0)).toBe('1134000');

    const ar = draft.lines.find((line) => line.accountCode === '1310')!;
    expect(ar.debit.toFixed(0)).toBe('1134000');
    const revenue = draft.lines.find((line) => line.accountCode === '1000')!;
    expect(revenue.credit.toFixed(0)).toBe('1000000');
    expect(revenue.department).toBe('ROOMS');
    expect(revenue.channelId).toBe('channel-direct');
    expect(draft.lines.find((line) => line.accountCode === '3331')!.credit.toFixed(0)).toBe('84000');
    expect(draft.lines.find((line) => line.accountCode === '3380')!.credit.toFixed(0)).toBe('50000');
  });

  it('groups revenue by account, department and channel', () => {
    const draft = buildRevenueDraft({
      memo: 'Doanh thu F&B',
      charges: [
        charge({ glAccountCode: '2000', department: 'FNB', description: 'Nhà hàng', channelId: 'direct' }),
        charge({
          glAccountCode: '2100',
          department: 'FNB',
          description: 'Bar',
          channelId: 'direct',
          net: 500_000,
          serviceCharge: 25_000,
          vat: 42_000,
          total: 567_000,
        }),
        charge({ glAccountCode: '1000', department: 'ROOMS', channelId: 'booking', net: 2_000_000, serviceCharge: 100_000, vat: 168_000, total: 2_268_000 }),
      ],
    });
    const revenueLines = draft.lines.filter((line) => line.credit.gt(0) && ['1000', '2000', '2100'].includes(line.accountCode));
    expect(revenueLines).toHaveLength(3);
    expect(draft.totalCredit.toFixed(0)).toBe('3969000');
    expect(trialBalance(draft.lines).balanced).toBe(true);
  });

  it('supports city-ledger charges without reception tax', () => {
    const draft = buildRevenueDraft({
      memo: 'City ledger',
      charges: [charge({ vat: 0, serviceCharge: 0, total: 1_000_000 })],
    });
    expect(draft.lines).toHaveLength(2);
    expect(trialBalance(draft.lines).balanced).toBe(true);
  });
});

describe('payment posting', () => {
  it('maps methods to cash, bank clearing and AR', () => {
    expect(paymentGlAccount('CASH')).toBe('1110');
    expect(paymentGlAccount('CARD')).toBe('1120');
    expect(paymentGlAccount('VIETQR')).toBe('1120');
    expect(paymentGlAccount('COMPANY_AR')).toBe('1310');
  });

  it('debits the settlement accounts and credits AR', () => {
    const draft = buildPaymentDraft({
      memo: 'Thanh toán folio',
      payments: [
        { method: 'CASH', amount: 2_000_000 },
        { method: 'CARD', amount: 1_134_000 },
      ],
    });
    expect(draft.lines.find((line) => line.accountCode === '1110')!.debit.toFixed(0)).toBe('2000000');
    expect(draft.lines.find((line) => line.accountCode === '1120')!.debit.toFixed(0)).toBe('1134000');
    expect(draft.lines.find((line) => line.accountCode === '1310')!.credit.toFixed(0)).toBe('3134000');
    expect(trialBalance(draft.lines).balanced).toBe(true);
  });
});

describe('journal validation', () => {
  it('rejects unbalanced drafts', () => {
    expect(() =>
      finalizeJournal('Sai', [
        { accountCode: '1110', description: 'Tiền', debit: 1000 as never, credit: 0 as never },
        { accountCode: '1310', description: 'AR', debit: 0 as never, credit: 900 as never },
      ]),
    ).toThrow(UnbalancedJournalError);
  });

  it('drops zero lines', () => {
    const draft = finalizeJournal('Zero', [
      { accountCode: '1110', description: 'x', debit: 0 as never, credit: 0 as never },
    ]);
    expect(draft.lines).toHaveLength(0);
    expect(draft.totalDebit.toNumber()).toBe(0);
  });

  it('accrues OTA commission as expense against payable', () => {
    const draft = buildCommissionDraft({ memo: 'Hoa hồng OTA', amount: 1_134_000, channelId: 'booking' });
    expect(draft.lines.find((line) => line.accountCode === '6210')!.debit.toFixed(0)).toBe('1134000');
    expect(draft.lines.find((line) => line.accountCode === '3310')!.credit.toFixed(0)).toBe('1134000');
  });
});
