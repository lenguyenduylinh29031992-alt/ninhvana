import { cookies } from 'next/headers';
import type { SupportedLocale } from '@grand-suite/shared';
import { Providers } from '@/components/providers';

export default async function BookingLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const locale: SupportedLocale = store.get('gs_locale')?.value === 'en' ? 'en' : 'vi';
  return <Providers locale={locale}>{children}</Providers>;
}
