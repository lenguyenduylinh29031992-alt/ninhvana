import Decimal from 'decimal.js';

// Money math is centralized here so API, seeds and UI never disagree on rounding.
Decimal.set({
  precision: 30,
  rounding: Decimal.ROUND_HALF_UP,
  // Avoid exponential notation leaking into JSON for very large/small values.
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

export type CurrencyCode = 'VND' | 'USD' | 'EUR' | 'KRW' | 'JPY' | 'CNY';

export const BASE_CURRENCY: CurrencyCode = 'VND';

export const CURRENCY_DECIMALS: Record<CurrencyCode, number> = {
  VND: 0,
  USD: 2,
  EUR: 2,
  KRW: 0,
  JPY: 0,
  CNY: 2,
};

export const CURRENCY_META: Record<
  CurrencyCode,
  { name: string; nameEn: string; symbol: string; decimals: number }
> = {
  VND: { name: 'Đồng Việt Nam', nameEn: 'Vietnamese Dong', symbol: '₫', decimals: 0 },
  USD: { name: 'Đô la Mỹ', nameEn: 'US Dollar', symbol: '$', decimals: 2 },
  EUR: { name: 'Euro', nameEn: 'Euro', symbol: '€', decimals: 2 },
  KRW: { name: 'Won Hàn Quốc', nameEn: 'South Korean Won', symbol: '₩', decimals: 0 },
  JPY: { name: 'Yên Nhật', nameEn: 'Japanese Yen', symbol: '¥', decimals: 0 },
  CNY: { name: 'Nhân dân tệ', nameEn: 'Chinese Yuan', symbol: '¥', decimals: 2 },
};

/** Anything that can be safely interpreted as a money value. */
export type Numeric = Decimal | string | number | null | undefined;

export function decimal(value: Numeric): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  if (value instanceof Decimal) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return new Decimal(0);
    return new Decimal(value);
  }
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}

/** Alias kept short for terse business formulas. */
export const d = decimal;

export function decimalsFor(currency: CurrencyCode | string = BASE_CURRENCY): number {
  return CURRENCY_DECIMALS[currency as CurrencyCode] ?? 2;
}

export function roundTo(value: Numeric, decimals: number): Decimal {
  return decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

/** Round to the smallest unit of the given currency (half-up at line level). */
export function roundMoney(value: Numeric, currency: CurrencyCode | string = BASE_CURRENCY): Decimal {
  return roundTo(value, decimalsFor(currency));
}

/** Amount × FX rate → base-currency amount, rounded to the base currency's precision. */
export function convertCurrency(
  amount: Numeric,
  rate: Numeric,
  toCurrency: CurrencyCode | string = BASE_CURRENCY,
): Decimal {
  return roundMoney(decimal(amount).times(decimal(rate)), toCurrency);
}

export function sumMoney(values: Numeric[], currency: CurrencyCode | string = BASE_CURRENCY): Decimal {
  return roundMoney(
    values.reduce<Decimal>((acc, value) => acc.plus(decimal(value)), new Decimal(0)),
    currency,
  );
}

export function percentOf(base: Numeric, percent: Numeric): Decimal {
  return decimal(base).times(decimal(percent)).div(100);
}

export function percentChange(current: Numeric, previous: Numeric): number | null {
  const prev = decimal(previous);
  if (prev.isZero()) return null;
  return decimal(current).minus(prev).div(prev.abs()).times(100).toDecimalPlaces(1).toNumber();
}

export function safeDivide(numerator: Numeric, denominator: Numeric, decimals = 2): Decimal {
  const den = decimal(denominator);
  if (den.isZero()) return new Decimal(0);
  return decimal(numerator).div(den).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

export function minMoney(a: Numeric, b: Numeric): Decimal {
  return Decimal.min(decimal(a), decimal(b));
}

export function maxMoney(a: Numeric, b: Numeric): Decimal {
  return Decimal.max(decimal(a), decimal(b));
}

export function isZero(value: Numeric): boolean {
  return decimal(value).isZero();
}

export function negate(value: Numeric): Decimal {
  return decimal(value).negated();
}

/**
 * Split `total` across weights so the parts sum EXACTLY to the rounded total.
 * Uses the largest-remainder method on minor units (service-charge distribution,
 * revenue allocation for packages, folio splitting).
 */
export function allocateProportionally(
  total: Numeric,
  weights: Numeric[],
  currency: CurrencyCode | string = BASE_CURRENCY,
): Decimal[] {
  const decimals = decimalsFor(currency);
  const factor = new Decimal(10).pow(decimals);
  const totalMinor = roundMoney(total, currency).times(factor);
  const safeWeights = weights.map((w) => Decimal.max(decimal(w), 0));
  const weightSum = safeWeights.reduce<Decimal>((acc, w) => acc.plus(w), new Decimal(0));

  if (totalMinor.isZero()) return safeWeights.map(() => new Decimal(0));
  if (weightSum.isZero()) {
    // No weights: distribute equally so accounting still balances.
    return allocateProportionally(total, safeWeights.map(() => 1), currency);
  }

  const raw = safeWeights.map((w) => totalMinor.times(w).div(weightSum));
  const floored = raw.map((r) => r.floor());
  const floorSum = floored.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0));
  let remainder = totalMinor.minus(floorSum).toNumber();

  const order = raw
    .map((r, index) => ({ index, fraction: r.minus(floored[index]!) }))
    .sort((a, b) => b.fraction.comparedTo(a.fraction));

  const units = floored.slice();
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    const target = order[cursor % order.length]!;
    units[target.index] = units[target.index]!.plus(1);
    remainder -= 1;
    cursor += 1;
  }

  return units.map((u) => u.div(factor));
}

export function formatMoney(
  value: Numeric,
  currency: CurrencyCode | string = BASE_CURRENCY,
  locale = 'vi-VN',
): string {
  const decimals = decimalsFor(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(decimal(value).toDecimalPlaces(decimals).toNumber());
  } catch {
    return `${decimal(value).toFixed(decimals)} ${currency}`;
  }
}

/** Compact display for dense KPI cards: 1,2 tỷ / 845,3 triệu / 12,4 nghìn. */
export function formatCompactMoney(
  value: Numeric,
  locale = 'vi-VN',
  currency: CurrencyCode | string = BASE_CURRENCY,
): string {
  const amount = decimal(value).toNumber();
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const suffix =
    locale.startsWith('vi')
      ? { billion: ' tỷ', million: ' tr', thousand: ' ng' }
      : { billion: 'B', million: 'M', thousand: 'K' };
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n);

  if (abs >= 1_000_000_000) return `${sign}${fmt(abs / 1_000_000_000)}${suffix.billion}${currency === 'VND' ? '₫' : ` ${currency}`}`;
  if (abs >= 1_000_000) return `${sign}${fmt(abs / 1_000_000)}${suffix.million}${currency === 'VND' ? '₫' : ` ${currency}`}`;
  if (abs >= 10_000) return `${sign}${fmt(abs / 1_000)}${suffix.thousand}${currency === 'VND' ? '₫' : ` ${currency}`}`;
  return formatMoney(value, currency, locale);
}

export function formatNumber(value: Numeric, locale = 'vi-VN', decimals = 0): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(decimal(value).toNumber());
}

export function formatPercent(value: Numeric, locale = 'vi-VN', decimals = 1): string {
  return `${formatNumber(value, locale, decimals)}%`;
}

/** Serialize money for JSON responses without BigInt/Decimal surprises. */
export function moneyToJson(value: Numeric): number {
  return roundTo(value, 2).toNumber();
}
