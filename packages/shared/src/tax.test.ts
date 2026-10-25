import { describe, expect, it } from 'vitest';
import { computeDocumentTotals, computeLineTotals, computeNetRevenue, serviceChargeFor } from './tax';

const rules = { vatPct: 8, serviceChargePct: 5, pricesIncludeTax: false };

describe('tax engine — prices exclusive (++)', () => {
  it('computes service charge on net and VAT on net + service', () => {
    const result = computeLineTotals({ quantity: 1, unitPrice: 1_000_000, rules });
    expect(result.net.toFixed(0)).toBe('1000000');
    expect(result.serviceCharge.toFixed(0)).toBe('50000');
    expect(result.vat.toFixed(0)).toBe('84000');
    expect(result.total.toFixed(0)).toBe('1134000');
    expect(result.taxLines.map((line) => line.code)).toEqual(['SERVICE_CHARGE', 'VAT']);
  });

  it('multiplies quantity before applying taxes', () => {
    const result = computeLineTotals({ quantity: 3, unitPrice: '250000', rules });
    expect(result.net.toFixed(0)).toBe('750000');
    expect(result.serviceCharge.toFixed(0)).toBe('37500');
    expect(result.vat.toFixed(0)).toBe('63000');
    expect(result.total.toFixed(0)).toBe('850500');
  });

  it('applies a line discount before tax', () => {
    const result = computeLineTotals({
      quantity: 1,
      unitPrice: 2_000_000,
      discount: 500_000,
      rules,
    });
    expect(result.net.toFixed(0)).toBe('1500000');
    expect(result.vat.toFixed(0)).toBe('126000');
  });

  it('adds a non-taxable lodging fee on net', () => {
    const result = computeLineTotals({
      quantity: 1,
      unitPrice: 1_000_000,
      rules: { ...rules, lodgingFeePct: 2 },
    });
    expect(result.lodgingFee.toFixed(0)).toBe('20000');
    expect(result.total.toFixed(0)).toBe('1154000');
    expect(result.taxLines.some((line) => line.code === 'LODGING_FEE')).toBe(true);
  });

  it('rounds each component to đồng and keeps the total consistent', () => {
    const result = computeLineTotals({ quantity: 1, unitPrice: 333_333, rules });
    const recombined = result.net.plus(result.serviceCharge).plus(result.vat);
    expect(recombined.toFixed(0)).toBe(result.total.toFixed(0));
  });

  it('returns zeros for a non-positive line', () => {
    const result = computeLineTotals({ quantity: 1, unitPrice: 0, rules });
    expect(result.total.toNumber()).toBe(0);
    expect(result.taxLines).toHaveLength(0);
  });
});

describe('tax engine — prices inclusive', () => {
  it('reverse-calculates net so components add up exactly', () => {
    const result = computeLineTotals({
      quantity: 1,
      unitPrice: 1_134_000,
      rules: { ...rules, pricesIncludeTax: true },
    });
    expect(result.net.toFixed(0)).toBe('1000000');
    expect(result.serviceCharge.toFixed(0)).toBe('50000');
    expect(result.vat.toFixed(0)).toBe('84000');
    expect(result.total.toFixed(0)).toBe('1134000');
    expect(result.net.plus(result.serviceCharge).plus(result.vat).toFixed(0)).toBe('1134000');
  });

  it('handles awkward amounts without losing a đồng', () => {
    const result = computeLineTotals({
      quantity: 1,
      unitPrice: 999_999,
      rules: { vatPct: 10, serviceChargePct: 5, pricesIncludeTax: true },
    });
    expect(result.net.plus(result.serviceCharge).plus(result.vat).toFixed(0)).toBe('999999');
  });
});

describe('document totals', () => {
  it('groups VAT by rate for the invoice breakdown', () => {
    const totals = computeDocumentTotals(
      [
        { quantity: 1, unitPrice: 1_000_000, rules },
        { quantity: 2, unitPrice: 500_000, rules: { vatPct: 10, serviceChargePct: 0, pricesIncludeTax: false } },
      ],
      'VND',
    );
    expect(totals.net.toFixed(0)).toBe('2000000');
    expect(totals.vat.toFixed(0)).toBe('184000');
    expect(totals.byVatRate).toEqual([
      { rate: 8, base: expect.anything(), tax: expect.anything() },
      { rate: 10, base: expect.anything(), tax: expect.anything() },
    ]);
    expect(totals.byVatRate[1]!.tax.toFixed(0)).toBe('100000');
  });

  it('supports empty documents', () => {
    const totals = computeDocumentTotals([]);
    expect(totals.total.toFixed(0)).toBe('0');
    expect(totals.byVatRate).toHaveLength(0);
  });
});

describe('net revenue and helpers', () => {
  it('deducts OTA commission, gateway fee and VAT', () => {
    const net = computeNetRevenue({
      grossRevenue: 10_000_000,
      commissionPct: 15,
      paymentFeePct: 2.2,
      vatPct: 8,
    });
    expect(net.commission.toFixed(0)).toBe('1500000');
    expect(net.paymentFee.toFixed(0)).toBe('220000');
    expect(net.net.toFixed(0)).toBe('7480000');
  });

  it('computes service charge with currency rounding', () => {
    expect(serviceChargeFor('1234567', 5).toFixed(0)).toBe('61728');
  });
});
