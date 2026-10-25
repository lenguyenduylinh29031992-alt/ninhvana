import Decimal from 'decimal.js';
import { addDays, nightsBetween, stayNights } from './dates';
import { decimal, roundMoney, type Numeric } from './money';
import { computeLineTotals, type TaxRuleSet } from './tax';

export interface StayNightRate {
  date: string;
  rate: Numeric;
}

export interface PricedStayNight {
  date: string;
  rate: Decimal;
  serviceCharge: Decimal;
  vat: Decimal;
  total: Decimal;
}

export interface StayPricing {
  nights: PricedStayNight[];
  net: Decimal;
  serviceCharge: Decimal;
  vat: Decimal;
  total: Decimal;
  averageNightlyRate: Decimal;
}

/**
 * Prices a stay night by night so each business date carries its own revenue,
 * service charge and VAT — required for night-audit accuracy.
 */
export function priceStay(
  nights: StayNightRate[],
  rules: TaxRuleSet,
  currency = 'VND',
): StayPricing {
  const priced: PricedStayNight[] = [];
  let net = new Decimal(0);
  let serviceCharge = new Decimal(0);
  let vat = new Decimal(0);
  let total = new Decimal(0);

  for (const night of nights) {
    const breakdown = computeLineTotals({
      quantity: 1,
      unitPrice: decimal(night.rate),
      rules,
      currency,
    });
    priced.push({
      date: night.date,
      rate: roundMoney(night.rate, currency),
      serviceCharge: breakdown.serviceCharge,
      vat: breakdown.vat,
      total: breakdown.total,
    });
    net = net.plus(breakdown.net);
    serviceCharge = serviceCharge.plus(breakdown.serviceCharge);
    vat = vat.plus(breakdown.vat);
    total = total.plus(breakdown.total);
  }

  return {
    nights: priced,
    net: roundMoney(net, currency),
    serviceCharge: roundMoney(serviceCharge, currency),
    vat: roundMoney(vat, currency),
    total: roundMoney(total, currency),
    averageNightlyRate: priced.length > 0 ? roundMoney(net.div(priced.length), currency) : new Decimal(0),
  };
}

/** Builds the nightly rate list for a date range using a resolver. */
export function buildStayNights(
  checkIn: string,
  checkOut: string,
  rateFor: (date: string) => Numeric,
): StayNightRate[] {
  return stayNights(checkIn, checkOut).map((date) => ({ date, rate: rateFor(date) }));
}

export function nightsOfStay(checkIn: string, checkOut: string): number {
  return nightsBetween(checkIn, checkOut);
}

export function lastNightOfStay(checkIn: string, checkOut: string): string {
  return addDays(checkOut, -1);
}

/**
 * Nightly commission on gross room revenue (OTA contracts usually quote a
 * percentage of the amount charged to the guest, taxes included).
 */
export function commissionFor(total: Numeric, commissionPct: Numeric): Decimal {
  return roundMoney(decimal(total).times(decimal(commissionPct)).div(100));
}

export interface CancellationPolicy {
  type: 'FLEXIBLE' | 'NON_REFUNDABLE' | 'PARTIAL';
  freeUntilDays?: number;
  penaltyPct?: number;
}

export function cancellationFee(params: {
  policy: CancellationPolicy;
  checkIn: string;
  today: string;
  totalAmount: Numeric;
  paidAmount: Numeric;
}): Decimal {
  const { policy, checkIn, today, totalAmount, paidAmount } = params;
  if (policy.type === 'NON_REFUNDABLE') {
    return roundMoney(paidAmount);
  }
  const daysUntilArrival = nightsBetween(today, checkIn);
  if (policy.type === 'FLEXIBLE') {
    const freeUntil = policy.freeUntilDays ?? 2;
    return daysUntilArrival >= freeUntil ? new Decimal(0) : roundMoney(totalAmount);
  }
  const pct = new Decimal(policy.penaltyPct ?? 50).div(100);
  return roundMoney(decimal(totalAmount).times(pct));
}
