import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  businessDateOf,
  daysBetween,
  eachDate,
  eachMonth,
  endOfMonth,
  endOfQuarter,
  isValidIsoDate,
  nightsBetween,
  overlaps,
  presetRange,
  previousPeriod,
  previousYearPeriod,
  quarterOf,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  stayNights,
  toIsoDate,
  weekdayIndex,
} from './dates';

describe('business date', () => {
  it('validates ISO dates strictly', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('26-02-28')).toBe(false);
  });

  it('maps a 02:00 local timestamp to the previous business date (06:00 cutoff)', () => {
    // 2026-10-25 02:00 in Ho Chi Minh = 2026-10-24 19:00 UTC
    expect(businessDateOf('2026-10-24T19:00:00.000Z', { cutoffHour: 6 })).toBe('2026-10-24');
    expect(businessDateOf('2026-10-25T07:00:00.000Z', { cutoffHour: 6 })).toBe('2026-10-25');
  });

  it('derives today in the property timezone, not UTC', () => {
    // 17:30 UTC = 00:30 next day in Vietnam
    expect(toIsoDate(new Date('2026-10-24T17:30:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-10-25');
    expect(toIsoDate(new Date('2026-10-24T17:30:00.000Z'), 'UTC')).toBe('2026-10-24');
  });
});

describe('calendar arithmetic', () => {
  it('adds days across month/year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('clamps months when the target month is shorter', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-01-15', 12)).toBe('2027-01-15');
  });

  it('computes nights and date lists', () => {
    expect(daysBetween('2026-10-01', '2026-10-05')).toBe(4);
    expect(nightsBetween('2026-10-01', '2026-10-05')).toBe(4);
    expect(nightsBetween('2026-10-05', '2026-10-01')).toBe(0);
    expect(stayNights('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
    expect(eachDate('2026-01-01', '2026-01-03')).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('detects overlapping stay ranges (checkout exclusive)', () => {
    expect(overlaps('2026-10-01', '2026-10-03', '2026-10-03', '2026-10-05')).toBe(false);
    expect(overlaps('2026-10-01', '2026-10-04', '2026-10-03', '2026-10-05')).toBe(true);
  });

  it('computes month, quarter and week boundaries', () => {
    expect(startOfMonth('2026-10-17')).toBe('2026-10-01');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
    expect(quarterOf('2026-05-15')).toBe(2);
    expect(startOfQuarter('2026-05-15')).toBe('2026-04-01');
    expect(endOfQuarter('2026-05-15')).toBe('2026-06-30');
    // 2026-10-25 is a Sunday
    expect(weekdayIndex('2026-10-25')).toBe(6);
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19');
  });

  it('enumerates months', () => {
    expect(eachMonth('2026-01-15', '2026-04-02')).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
  });
});

describe('reporting ranges', () => {
  const today = '2026-10-25';

  it('builds standard presets', () => {
    expect(presetRange('today', today)).toEqual({ from: today, to: today });
    expect(presetRange('thisMonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('lastMonth', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('thisQuarter', today)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(presetRange('thisYear', today)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(presetRange('last7', today)).toEqual({ from: '2026-10-19', to: today });
  });

  it('computes the immediately preceding period of equal length', () => {
    expect(previousPeriod({ from: '2026-10-01', to: '2026-10-31' })).toEqual({
      from: '2026-08-31',
      to: '2026-09-30',
    });
    expect(previousPeriod({ from: '2026-10-25', to: '2026-10-25' })).toEqual({
      from: '2026-10-24',
      to: '2026-10-24',
    });
  });

  it('computes the same range one year earlier', () => {
    expect(previousYearPeriod({ from: '2026-10-01', to: '2026-10-31' })).toEqual({
      from: '2025-10-01',
      to: '2025-10-31',
    });
  });
});
