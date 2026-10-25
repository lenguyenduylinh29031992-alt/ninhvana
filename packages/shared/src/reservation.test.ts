import { describe, expect, it } from 'vitest';
import { buildStayNights, cancellationFee, commissionFor, priceStay } from './reservation';

const rules = { vatPct: 8, serviceChargePct: 5, pricesIncludeTax: false };

describe('stay pricing', () => {
  it('prices each night separately and totals reconcile', () => {
    const stay = priceStay(
      [
        { date: '2026-10-01', rate: 3_000_000 },
        { date: '2026-10-02', rate: 3_500_000 },
      ],
      rules,
    );
    expect(stay.nights).toHaveLength(2);
    expect(stay.nights[0]!.total.toFixed(0)).toBe('3402000');
    expect(stay.net.toFixed(0)).toBe('6500000');
    expect(stay.serviceCharge.toFixed(0)).toBe('325000');
    expect(stay.vat.toFixed(0)).toBe('546000');
    expect(stay.total.toFixed(0)).toBe('7371000');
    expect(stay.net.plus(stay.serviceCharge).plus(stay.vat).toFixed(0)).toBe(stay.total.toFixed(0));
    expect(stay.averageNightlyRate.toFixed(0)).toBe('3250000');
  });

  it('lists nights with a rate resolver', () => {
    const nights = buildStayNights('2026-10-30', '2026-11-02', (date) =>
      date.endsWith('31') ? 4_000_000 : 3_000_000,
    );
    expect(nights.map((night) => night.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
    expect(nights[1]!.rate).toBe(4_000_000);
  });

  it('handles zero nights', () => {
    const stay = priceStay([], rules);
    expect(stay.total.toNumber()).toBe(0);
    expect(stay.averageNightlyRate.toNumber()).toBe(0);
  });
});

describe('commission & cancellation', () => {
  it('computes channel commission on gross revenue', () => {
    expect(commissionFor(1_134_000, 15).toFixed(0)).toBe('170100');
    expect(commissionFor(0, 15).toFixed(0)).toBe('0');
  });

  it('applies non-refundable policy to paid amount', () => {
    const fee = cancellationFee({
      policy: { type: 'NON_REFUNDABLE' },
      checkIn: '2026-11-10',
      today: '2026-11-01',
      totalAmount: 5_000_000,
      paidAmount: 1_500_000,
    });
    expect(fee.toFixed(0)).toBe('1500000');
  });

  it('waives flexible cancellation before the deadline', () => {
    const fee = cancellationFee({
      policy: { type: 'FLEXIBLE', freeUntilDays: 2 },
      checkIn: '2026-11-10',
      today: '2026-11-01',
      totalAmount: 5_000_000,
      paidAmount: 1_500_000,
    });
    expect(fee.toNumber()).toBe(0);
  });

  it('charges flexible cancellation inside the deadline', () => {
    const fee = cancellationFee({
      policy: { type: 'FLEXIBLE', freeUntilDays: 2 },
      checkIn: '2026-11-02',
      today: '2026-11-01',
      totalAmount: 5_000_000,
      paidAmount: 1_500_000,
    });
    expect(fee.toFixed(0)).toBe('5000000');
  });
});
