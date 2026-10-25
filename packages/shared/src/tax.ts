import Decimal from 'decimal.js';
import { d, decimalsFor, decimal, roundMoney, type CurrencyCode } from './money';

/**
 * Vietnamese hospitality tax model.
 *
 * Listed prices are "++" by default (exclusive of service charge and VAT). The
 * service charge forms part of the VAT base — this mirrors how Opera/Mews post
 * city-ledger folios in Vietnam and how the tax authority expects the invoice
 * breakdown. Lodging fee (if enabled by a property) is charged on net and is
 * not taxable.
 */
export interface TaxRuleSet {
  /** VAT rate in percent, e.g. 8 or 10. */
  vatPct: number;
  /** Service charge in percent, e.g. 5 or 10. */
  serviceChargePct: number;
  /** Optional local lodging fee in percent of net (non-taxable). */
  lodgingFeePct?: number;
  /** When true, unit prices already include service charge + VAT. */
  pricesIncludeTax: boolean;
}

export interface TaxLine {
  code: 'VAT' | 'SERVICE_CHARGE' | 'LODGING_FEE';
  rate: number;
  base: Decimal;
  amount: Decimal;
}

export interface TaxBreakdown {
  /** Revenue before service charge and taxes. */
  net: Decimal;
  serviceCharge: Decimal;
  vat: Decimal;
  lodgingFee: Decimal;
  /** What the guest pays. */
  total: Decimal;
  taxLines: TaxLine[];
}

export interface PricedLineInput {
  quantity: number | string | Decimal;
  unitPrice: number | string | Decimal;
  /** Absolute discount on the line (already in currency units). */
  discount?: number | string | Decimal;
  currency?: CurrencyCode | string;
  rules: TaxRuleSet;
}

export const DEFAULT_TAX_RULES: TaxRuleSet = {
  vatPct: 8,
  serviceChargePct: 0,
  pricesIncludeTax: false,
};

const ZERO = new Decimal(0);

function taxLine(
  code: TaxLine['code'],
  rate: number,
  base: Decimal,
  amount: Decimal,
): TaxLine {
  return { code, rate, base, amount };
}

/**
 * Compute net / service charge / VAT / total for a single line.
 * Rounding happens on currency minor units so folio totals always reconcile.
 */
export function computeLineTotals(input: PricedLineInput): TaxBreakdown {
  const currency = input.currency ?? 'VND';
  const { rules } = input;
  const vatPct = Math.max(0, Number(rules.vatPct) || 0);
  const scPct = Math.max(0, Number(rules.serviceChargePct) || 0);
  const lodgingPct = Math.max(0, Number(rules.lodgingFeePct) || 0);

  const gross = roundMoney(
    decimal(input.quantity).times(decimal(input.unitPrice)).minus(decimal(input.discount)),
    currency,
  );

  if (gross.lte(0)) {
    return {
      net: ZERO,
      serviceCharge: ZERO,
      vat: ZERO,
      lodgingFee: ZERO,
      total: ZERO,
      taxLines: [],
    };
  }

  let net: Decimal;
  let serviceCharge: Decimal;
  let vat: Decimal;
  let lodgingFee: Decimal;
  let total: Decimal;

  if (rules.pricesIncludeTax) {
    // total = net × (1 + sc) × (1 + vat)  →  net = total / ((1+sc)(1+vat))
    const factor = new Decimal(1).plus(scPct / 100).times(new Decimal(1).plus(vatPct / 100));
    net = roundMoney(gross.div(factor), currency);
    serviceCharge = roundMoney(net.times(scPct).div(100), currency);
    vat = roundMoney(net.plus(serviceCharge).times(vatPct).div(100), currency);

    // Absorb rounding drift into net so the invoice adds up exactly.
    net = gross.minus(serviceCharge).minus(vat);
    lodgingFee = roundMoney(net.times(lodgingPct).div(100), currency);
    total = gross.plus(lodgingFee);
  } else {
    net = gross;
    serviceCharge = roundMoney(net.times(scPct).div(100), currency);
    vat = roundMoney(net.plus(serviceCharge).times(vatPct).div(100), currency);
    lodgingFee = roundMoney(net.times(lodgingPct).div(100), currency);
    total = net.plus(serviceCharge).plus(vat).plus(lodgingFee);
  }

  const taxLines: TaxLine[] = [];
  if (scPct > 0) {
    taxLines.push(taxLine('SERVICE_CHARGE', scPct, net, serviceCharge));
  }
  if (vatPct > 0) {
    taxLines.push(taxLine('VAT', vatPct, net.plus(serviceCharge), vat));
  }
  if (lodgingPct > 0) {
    taxLines.push(taxLine('LODGING_FEE', lodgingPct, net, lodgingFee));
  }

  return { net, serviceCharge, vat, lodgingFee, total, taxLines };
}

export interface DocumentTotals {
  net: Decimal;
  serviceCharge: Decimal;
  vat: Decimal;
  lodgingFee: Decimal;
  discount: Decimal;
  total: Decimal;
  byVatRate: Array<{ rate: number; base: Decimal; tax: Decimal }>;
}

/** Aggregate lines into an invoice total, grouping VAT by rate for the tax breakdown. */
export function computeDocumentTotals(
  lines: PricedLineInput[],
  currency: CurrencyCode | string = 'VND',
): DocumentTotals {
  let net = ZERO;
  let serviceCharge = ZERO;
  let vat = ZERO;
  let lodgingFee = ZERO;

  const vatBuckets = new Map<number, { base: Decimal; tax: Decimal }>();

  for (const line of lines) {
    const breakdown = computeLineTotals({ ...line, currency });
    net = net.plus(breakdown.net);
    serviceCharge = serviceCharge.plus(breakdown.serviceCharge);
    vat = vat.plus(breakdown.vat);
    lodgingFee = lodgingFee.plus(breakdown.lodgingFee);

    const rate = Number(line.rules.vatPct) || 0;
    const base = breakdown.net.plus(breakdown.serviceCharge);
    const bucket = vatBuckets.get(rate) ?? { base: ZERO, tax: ZERO };
    vatBuckets.set(rate, { base: bucket.base.plus(base), tax: bucket.tax.plus(breakdown.vat) });
  }

  return {
    net: roundMoney(net, currency),
    serviceCharge: roundMoney(serviceCharge, currency),
    vat: roundMoney(vat, currency),
    lodgingFee: roundMoney(lodgingFee, currency),
    discount: ZERO,
    total: roundMoney(net.plus(serviceCharge).plus(vat).plus(lodgingFee), currency),
    byVatRate: [...vatBuckets.entries()]
      .filter(([, bucket]) => !bucket.tax.isZero())
      .map(([rate, bucket]) => ({ rate, base: roundMoney(bucket.base, currency), tax: roundMoney(bucket.tax, currency) }))
      .sort((a, b) => a.rate - b.rate),
  };
}

/**
 * Reverse-engineer the net revenue of a commissionable sale.
 * OTA commission applies to the room revenue (net + service charge), and the
 * payment gateway fee applies to the amount actually charged.
 */
export function computeNetRevenue(params: {
  grossRevenue: number | string | Decimal;
  commissionPct?: number;
  paymentFeePct?: number;
  vatPct?: number;
}): {
  gross: Decimal;
  commission: Decimal;
  paymentFee: Decimal;
  tax: Decimal;
  net: Decimal;
} {
  const gross = decimal(params.grossRevenue);
  const commission = roundMoney(gross.times(params.commissionPct ?? 0).div(100));
  const paymentFee = roundMoney(gross.times(params.paymentFeePct ?? 0).div(100));
  const tax = roundMoney(gross.times(params.vatPct ?? 0).div(100));
  const net = gross.minus(commission).minus(paymentFee).minus(tax);
  return { gross, commission, paymentFee, tax, net };
}

export function serviceChargeFor(amount: number | string | Decimal, pct: number): Decimal {
  return roundMoney(d(amount).times(pct).div(100));
}

export function vatFor(base: number | string | Decimal, pct: number, currency = 'VND'): Decimal {
  return roundMoney(decimal(base).times(pct).div(100), currency);
}

export function taxRateFraction(pct: number): Decimal {
  return new Decimal(pct).div(100);
}

export function decimalPlacesFor(currency: string): number {
  return decimalsFor(currency);
}
