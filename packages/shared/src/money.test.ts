import { describe, expect, it } from 'vitest';
import {
  allocateProportionally,
  convertCurrency,
  decimal,
  formatCompactMoney,
  formatMoney,
  formatNumber,
  formatPercent,
  percentChange,
  roundMoney,
  safeDivide,
  sumMoney,
} from './money';

describe('money', () => {
  it('rounds VND to whole units and USD to cents (half-up)', () => {
    expect(roundMoney('1000.5', 'VND').toFixed(0)).toBe('1001');
    expect(roundMoney('1000.4', 'VND').toFixed(0)).toBe('1000');
    expect(roundMoney('10.005', 'USD').toFixed(2)).toBe('10.01');
  });

  it('converts with FX rate and rounds in target currency', () => {
    expect(convertCurrency(100, '25450').toFixed(0)).toBe('2545000');
    expect(convertCurrency('12.345', '1', 'USD').toFixed(2)).toBe('12.35');
  });

  it('sums many values without floating point drift', () => {
    expect(sumMoney(['0.1', '0.2', '0.3'], 'USD').toFixed(2)).toBe('0.60');
    expect(sumMoney([1000.4, 2000.4, 3000.2]).toFixed(0)).toBe('6001');
  });

  it('computes percent change and returns null for zero base', () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(100, 0)).toBeNull();
  });

  it('keeps zero-safe division', () => {
    expect(safeDivide(10, 0).toNumber()).toBe(0);
    expect(safeDivide(10, 3, 2).toFixed(2)).toBe('3.33');
  });

  it('allocates proportionally so the parts sum exactly to the total', () => {
    const parts = allocateProportionally(1_000_000, [1, 1, 1]);
    expect(parts.reduce((acc, v) => acc.plus(v), decimal(0)).toFixed(0)).toBe('1000000');
    expect(parts.map((v) => v.toFixed(0))).toEqual(['333334', '333333', '333333']);
  });

  it('allocates weighted service charge without losing a đồng', () => {
    const parts = allocateProportionally(10_000_000, [40, 35, 25]);
    expect(parts.map((v) => v.toNumber())).toEqual([4_000_000, 3_500_000, 2_500_000]);
    const uneven = allocateProportionally(100, [1, 1, 1, 1, 1, 1]);
    expect(uneven.map((v) => v.toNumber())).toEqual([17, 17, 17, 17, 16, 16]);
  });

  it('allocates zero / negative weights safely', () => {
    const parts = allocateProportionally(1000, [0, 0]);
    expect(parts.map((v) => v.toNumber())).toEqual([500, 500]);
    expect(allocateProportionally(0, [1, 2]).map((v) => v.toNumber())).toEqual([0, 0]);
  });

  it('formats VND and USD for Vietnamese readers', () => {
    const vnd = formatMoney(1_234_567, 'VND', 'vi-VN');
    expect(vnd).toContain('1.234.567');
    expect(vnd).toContain('₫');
    const usd = formatMoney(1234.5, 'USD', 'en-US');
    expect(usd).toBe('$1,234.50');
  });

  it('formats compact money for KPI cards', () => {
    expect(formatCompactMoney(1_250_000_000, 'vi-VN')).toContain('tỷ');
    expect(formatCompactMoney(12_400_000, 'vi-VN')).toContain('tr');
    expect(formatCompactMoney(500_000, 'vi-VN')).toContain('₫');
    expect(formatCompactMoney(-900_000, 'vi-VN').startsWith('-')).toBe(true);
  });

  it('formats numbers and percentages', () => {
    expect(formatNumber(1234.5, 'vi-VN', 1)).toBe('1.234,5');
    expect(formatPercent(12.34)).toBe('12,3%');
  });

  it('treats invalid input as zero', () => {
    expect(decimal(Number.NaN).toNumber()).toBe(0);
    expect(decimal('not-a-number').toNumber()).toBe(0);
    expect(decimal(undefined).toNumber()).toBe(0);
  });
});
