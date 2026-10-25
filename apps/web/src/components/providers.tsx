'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import type { SupportedLocale } from '@grand-suite/shared';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/lib/theme';

function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
}

export function Providers({
  children,
  locale = 'vi',
}: {
  children: React.ReactNode;
  locale?: SupportedLocale;
}) {
  useServiceWorker();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
              return failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <ThemeProvider>
      <I18nProvider initialLocale={locale}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                className: 'font-sans text-sm',
                style: {
                  background: 'hsl(var(--surface))',
                  color: 'hsl(var(--ink))',
                  border: '1px solid hsl(var(--line))',
                },
              }}
            />
          </TooltipProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
