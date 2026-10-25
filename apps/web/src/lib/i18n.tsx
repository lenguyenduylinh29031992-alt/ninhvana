'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  dictionaries,
  isSupportedLocale,
  translate,
  type SupportedLocale,
  type TranslationKey,
} from '@grand-suite/shared';
import { readCookie, writeCookie } from './utils';

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  formatDate: (iso: string) => string;
  formatDateTime: (value: string | Date) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  initialLocale = 'vi',
}: {
  children: React.ReactNode;
  initialLocale?: SupportedLocale;
}) {
  const [locale, setLocaleState] = useState<SupportedLocale>(initialLocale);

  useEffect(() => {
    const stored = readCookie('gs_locale');
    if (isSupportedLocale(stored) && stored !== locale) setLocaleState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
    writeCookie('gs_locale', next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars) ?? dictionaries.vi[key];
    const intl = locale === 'vi' ? 'vi-VN' : 'en-US';
    return {
      locale,
      setLocale,
      t,
      formatDate: (iso: string) =>
        new Intl.DateTimeFormat(intl, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${iso}T00:00:00Z`)),
      formatDateTime: (input: string | Date) =>
        new Intl.DateTimeFormat(intl, {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Ho_Chi_Minh',
        }).format(typeof input === 'string' ? new Date(input) : input),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
