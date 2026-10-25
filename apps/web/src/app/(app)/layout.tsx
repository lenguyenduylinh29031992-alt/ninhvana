import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SupportedLocale } from '@grand-suite/shared';
import { Providers } from '@/components/providers';
import { AppShell } from '@/components/layout/app-shell';

export const dynamic = 'force-dynamic';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const hasSession = Boolean(store.get('gs_at') ?? store.get('gs_rt'));
  if (!hasSession) redirect('/login');

  const locale: SupportedLocale = store.get('gs_locale')?.value === 'en' ? 'en' : 'vi';

  return (
    <Providers locale={locale}>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
