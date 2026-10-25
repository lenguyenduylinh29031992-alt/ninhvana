import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { SupportedLocale } from '@grand-suite/shared';
import { Providers } from '@/components/providers';
import { LoginScreen } from '@/components/domain/login-screen';

export const metadata: Metadata = { title: 'Đăng nhập' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const store = await cookies();
  const locale: SupportedLocale = store.get('gs_locale')?.value === 'en' ? 'en' : 'vi';
  const requested = params.next ?? '/dashboard';
  const nextPath = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard';

  return (
    <Providers locale={locale}>
      <LoginScreen nextPath={nextPath} />
    </Providers>
  );
}
