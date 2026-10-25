import type { SupportedLocale } from '../constants';
import { en } from './en';
import { vi, type TranslationKey } from './vi';

export { vi, en };
export type { TranslationKey };

export const dictionaries: Record<SupportedLocale, Record<TranslationKey, string>> = {
  vi,
  en,
};

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
};

/**
 * Translate with optional `{placeholder}` interpolation.
 * Unknown keys fall back to Vietnamese, then to the key itself (never crashes UI).
 */
export function translate(
  locale: SupportedLocale,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const text = dictionaries[locale]?.[key] ?? vi[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, token: string) =>
    token in vars ? String(vars[token]) : match,
  );
}

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return value === 'vi' || value === 'en';
}
