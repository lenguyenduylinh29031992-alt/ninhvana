'use client';

import {
  CURRENCY_DECIMALS,
  formatCompactMoney,
  formatMoney,
  formatNumber,
  formatPercent,
} from '@grand-suite/shared';

export function useFormatters(locale: 'vi' | 'en' = 'vi') {
  const intl = locale === 'vi' ? 'vi-VN' : 'en-US';
  return {
    money: (value: number | string, currency = 'VND') =>
      formatMoney(value as never, currency, intl),
    compact: (value: number | string, currency = 'VND') =>
      formatCompactMoney(value as never, intl, currency),
    number: (value: number | string, decimals = 0) =>
      formatNumber(value as never, intl, decimals),
    percent: (value: number | string, decimals = 1) =>
      formatPercent(value as never, intl, decimals),
    decimals: (currency: string) => CURRENCY_DECIMALS[currency as keyof typeof CURRENCY_DECIMALS] ?? 2,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
