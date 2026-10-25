/**
 * Business-date arithmetic in the property timezone.
 *
 * Hotel days are not calendar days: a 02:00 check-out still belongs to the
 * previous business date. All financial reporting uses these helpers so the
 * API, night audit and seed stay consistent.
 */
export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function toIsoDate(
  input: Date | string | number,
  timeZone = DEFAULT_TIMEZONE,
): string {
  if (typeof input === 'string' && ISO_DATE.test(input)) return input;
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return toIsoDate(new Date(), timeZone);
  const parts = dateFormatter(timeZone).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/** Subtract the property cut-off (default 06:00) before deriving the date. */
export function businessDateOf(
  instant: Date | string | number = new Date(),
  options: { timeZone?: string; cutoffHour?: number } = {},
): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  const cutoff = options.cutoffHour ?? 6;
  const shifted = new Date(date.getTime() - cutoff * 3_600_000);
  return toIsoDate(shifted, options.timeZone ?? DEFAULT_TIMEZONE);
}

export function parseIsoDate(iso: string): Date {
  if (!isValidIsoDate(iso)) throw new Error(`Invalid ISO date: ${iso}`);
  return new Date(`${iso}T00:00:00.000Z`);
}

export function isoToday(): string {
  return toIsoDate(new Date());
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDays(iso: string, days: number): string {
  return new Date(parseIsoDate(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / DAY_MS);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(0, daysBetween(checkIn, checkOut));
}

export function eachDate(from: string, to: string): string[] {
  const total = daysBetween(from, to);
  if (total < 0) return [];
  if (total > 3660) throw new Error('Date range too large');
  return Array.from({ length: total + 1 }, (_, index) => addDays(from, index));
}

/** Nights of a stay: check-in inclusive, check-out exclusive. */
export function stayNights(checkIn: string, checkOut: string): string[] {
  const nights = nightsBetween(checkIn, checkOut);
  return Array.from({ length: nights }, (_, index) => addDays(checkIn, index));
}

export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addMonths(iso: string, months: number): string {
  const date = parseIsoDate(iso);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const date = parseIsoDate(iso);
  const last = daysInMonth(date.getUTCFullYear(), date.getUTCMonth());
  return `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

export function startOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

export function endOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-12-31`;
}

export function quarterOf(iso: string): number {
  const month = parseIsoDate(iso).getUTCMonth();
  return Math.floor(month / 3) + 1;
}

export function startOfQuarter(iso: string): string {
  const year = iso.slice(0, 4);
  const quarter = quarterOf(iso);
  return `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
}

export function endOfQuarter(iso: string): string {
  return endOfMonth(`${iso.slice(0, 4)}-${String(quarterOf(iso) * 3).padStart(2, '0')}-01`);
}

/** ISO weekday index: Monday = 0 … Sunday = 6. */
export function weekdayIndex(iso: string): number {
  return (parseIsoDate(iso).getUTCDay() + 6) % 7;
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

export function isWeekend(iso: string): boolean {
  return weekdayIndex(iso) >= 5;
}

export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisYear'
  | 'lastYear'
  | 'last12Months'
  | 'next30';

export interface DateRange {
  from: string;
  to: string;
}

export function presetRange(preset: RangePreset, today = isoToday()): DateRange {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'thisWeek':
      return { from: startOfWeek(today), to: addDays(startOfWeek(today), 6) };
    case 'thisMonth':
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'lastMonth': {
      const prev = addMonths(startOfMonth(today), -1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case 'thisQuarter':
      return { from: startOfQuarter(today), to: endOfQuarter(today) };
    case 'lastQuarter': {
      const prev = addMonths(startOfQuarter(today), -3);
      return { from: startOfQuarter(prev), to: endOfQuarter(prev) };
    }
    case 'thisYear':
      return { from: startOfYear(today), to: endOfYear(today) };
    case 'lastYear':
      return { from: startOfYear(addMonths(today, -12)), to: endOfYear(addMonths(today, -12)) };
    case 'last12Months':
      return { from: startOfMonth(addMonths(today, -11)), to: endOfMonth(today) };
    case 'next30':
      return { from: today, to: addDays(today, 29) };
    default:
      return { from: today, to: today };
  }
}

/** Equal-length period immediately before [from, to] — used for MoM/WoW comparisons. */
export function previousPeriod(range: DateRange): DateRange {
  const length = Math.max(1, daysBetween(range.from, range.to) + 1);
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(length - 1)), to };
}

/** Same range one year earlier — YoY. */
export function previousYearPeriod(range: DateRange): DateRange {
  return { from: addMonths(range.from, -12), to: addMonths(range.to, -12) };
}

export function eachMonth(from: string, to: string): string[] {
  const months: string[] = [];
  let cursor = startOfMonth(from);
  const last = startOfMonth(to);
  while (cursor <= last && months.length < 240) {
    months.push(cursor.slice(0, 7));
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthRange(key: string): DateRange {
  const iso = `${key}-01`;
  return { from: startOfMonth(iso), to: endOfMonth(iso) };
}

export function formatDate(iso: string, locale = 'vi-VN'): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(parseIsoDate(iso));
  } catch {
    return iso;
  }
}

export function formatDateLong(iso: string, locale = 'vi-VN'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseIsoDate(iso));
}

export function formatMonth(key: string, locale = 'vi-VN'): string {
  const date = parseIsoDate(`${key}-01`);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    date,
  );
}

export function formatTime(date: Date | string, timeZone = DEFAULT_TIMEZONE): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(value);
}

export function formatDateTime(
  date: Date | string,
  timeZone = DEFAULT_TIMEZONE,
  locale = 'vi-VN',
): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(value);
}

/** Inclusive business-date list for a month key, e.g. "2026-02" → 28 dates. */
export function datesOfMonth(key: string): string[] {
  const range = monthRange(key);
  return eachDate(range.from, range.to);
}

export function ageFromDob(dob: string, on = isoToday()): number {
  let age = Number(on.slice(0, 4)) - Number(dob.slice(0, 4));
  if (on.slice(5, 10) < dob.slice(5, 10)) age -= 1;
  return Math.max(0, age);
}
