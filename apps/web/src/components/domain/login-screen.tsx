'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { LoginResponse, SessionUser } from '@grand-suite/shared';
import { Button } from '@/components/ui/button';
import { FieldError, Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const DEMO_PASSWORD = 'NinhVaNa@2026';

const DEMO_ACCOUNTS = [
  { email: 'admin@ninhvana.vn', name: 'Nguyễn Văn A', role: 'Quản trị hệ thống (toàn quyền)', group: 'Quản trị' },
  { email: 'chairman@ninhvana.vn', name: 'Nguyễn Văn B', role: 'Chủ tịch', group: 'Lãnh đạo' },
  { email: 'ceo@ninhvana.vn', name: 'Nguyễn Văn C', role: 'Tổng giám đốc', group: 'Lãnh đạo' },
  { email: 'cfo@ninhvana.vn', name: 'Nguyễn Văn D', role: 'Kế toán trưởng', group: 'Lãnh đạo' },
  { email: 'revenue@ninhvana.vn', name: 'Nguyễn Văn E', role: 'GĐ doanh thu', group: 'Lãnh đạo' },
  { email: 'manager.hanoi@ninhvana.vn', name: 'Nguyễn Văn F', role: 'GĐ khách sạn NinhVaNa', group: 'Cơ sở' },
  { email: 'manager.ninhvan@ninhvana.vn', name: 'Nguyễn Văn G', role: 'GĐ Beach Club', group: 'Cơ sở' },
  { email: 'frontdesk@ninhvana.vn', name: 'Nguyễn Văn H', role: 'Lễ tân', group: 'Cơ sở' },
  { email: 'housekeeping@ninhvana.vn', name: 'Nguyễn Văn I', role: 'Buồng phòng', group: 'Cơ sở' },
  { email: 'chef@ninhvana.vn', name: 'Nguyễn Văn J', role: 'Bếp trưởng', group: 'Cơ sở' },
  { email: 'fnb@ninhvana.vn', name: 'Nguyễn Văn K', role: 'Quản lý F&B', group: 'Cơ sở' },
  { email: 'cashier@ninhvana.vn', name: 'Nguyễn Văn L', role: 'Thu ngân', group: 'Cơ sở' },
  { email: 'hr@ninhvana.vn', name: 'Nguyễn Văn M', role: 'Quản lý nhân sự', group: 'Hỗ trợ' },
  { email: 'warehouse@ninhvana.vn', name: 'Nguyễn Văn N', role: 'Quản lý kho', group: 'Hỗ trợ' },
  { email: 'marketing@ninhvana.vn', name: 'Nguyễn Văn O', role: 'Tiếp thị', group: 'Hỗ trợ' },
] as const;

interface PublicSummary {
  properties: number;
  rooms: number;
  channels: number;
  currencies: number;
  businessDate: string;
}

export function LoginScreen({ nextPath }: { nextPath: string }) {
  const { t, locale, setLocale } = useI18n();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('ceo@ninhvana.vn');
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [totp, setTotp] = useState('');

  const summary = useQuery({
    queryKey: ['public-summary'],
    queryFn: () => api<PublicSummary>('/public/summary'),
    staleTime: 300_000,
  });

  const complete = (user: SessionUser) => {
    queryClient.setQueryData(['session'], user);
    router.replace(nextPath);
    router.refresh();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (result.twoFactorRequired) {
        setMfaToken(result.mfaToken ?? null);
        return;
      }
      if (result.user) complete(result.user);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Không đăng nhập được. Vui lòng thử lại.',
      );
    } finally {
      setPending(false);
    }
  };

  const submitMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mfaToken) return;
    setError(null);
    setPending(true);
    try {
      const result = await api<LoginResponse>('/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken, code: totp },
      });
      if (result.user) complete(result.user);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Mã xác thực không hợp lệ.');
    } finally {
      setPending(false);
    }
  };

  const fillDemo = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-ink lg:flex">
        <div className="pointer-events-none absolute -left-40 -top-40 size-[560px] rounded-full bg-brand/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-56 -right-24 size-[520px] rounded-full bg-[#0b2b45]/60 blur-3xl" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-brand/20 to-transparent" />

        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full border border-sidebar-ink/30 font-display text-lg text-sidebar-ink">
            NV
          </span>
          <div>
            <p className="font-display text-lg leading-none tracking-[0.16em]">NINHVANA</p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.26em] text-sidebar-muted">
              {t('app.systemTagline')}
            </p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <p className="mb-5 text-[10px] uppercase tracking-[0.28em] text-brand/80">
            {t('auth.portfolioLive')}
          </p>
          <h1 className="font-display text-[2.9rem] font-light leading-[1.06] tracking-tight text-sidebar-ink">
            {t('auth.brandHeadline')}
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-sidebar-muted">
            {t('auth.brandSubline')}
          </p>

          <div className="mt-10 grid grid-cols-3 gap-6 border-y border-sidebar-line py-6">
            <Stat value={summary.data?.properties} label={t('auth.showcaseProperties')} />
            <Stat value={summary.data?.rooms} label="Phòng & suite" />
            <Stat value={summary.data?.channels} label={t('auth.showcaseChannels')} />
          </div>

          <ul className="mt-8 space-y-3">
            {[
              { icon: Building2, text: 'PMS, folio, night audit & báo cáo hợp nhất' },
              { icon: Sparkles, text: 'POS nhà hàng, buồng phòng và sự kiện' },
              { icon: ShieldCheck, text: 'RBAC đa cơ sở, audit bất biến, tuân thủ dữ liệu' },
            ].map((feature) => (
              <li key={feature.text} className="flex items-center gap-3 text-[13px] text-sidebar-muted">
                <span className="flex size-7 items-center justify-center rounded-full border border-sidebar-ink/20 text-sidebar-ink/70">
                  <feature.icon className="size-3.5" />
                </span>
                {feature.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-sidebar-muted/70">
          <Lock className="size-3" />
          {t('auth.secureNotice')}
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative flex flex-col px-6 py-8 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-full border border-brand/40 font-display text-brand">
              NV
            </span>
            <span className="font-display text-base tracking-[0.14em]">NINHVANA</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}>
              {locale === 'vi' ? 'EN' : 'VI'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label={theme === 'dark' ? t('common.light') : t('common.dark')}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">
          {mfaToken ? (
            <form onSubmit={submitMfa} className="space-y-5">
              <div>
                <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-brand">
                  <BadgeCheck className="size-3" />
                  {t('auth.twoFactorTitle')}
                </p>
                <h2 className="font-display text-4xl font-medium leading-tight tracking-tight">
                  {t('auth.twoFactorTitle')}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{t('auth.twoFactorSubtitle')}</p>
              </div>
              <div>
                <Label htmlFor="totp">{t('auth.totpCode')}</Label>
                <Input
                  id="totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={9}
                  value={totp}
                  onChange={(event) => setTotp(event.target.value.toUpperCase())}
                  placeholder="123456"
                  className="h-12 text-center font-mono text-lg tracking-[0.4em]"
                  autoFocus
                  aria-invalid={Boolean(error)}
                />
              </div>
              {error ? <ErrorBanner message={error} /> : null}
              <Button type="submit" size="lg" className="w-full" loading={pending}>
                {t('auth.verify')}
                {!pending ? <ArrowRight /> : null}
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs text-muted-foreground hover:text-ink"
                onClick={() => {
                  setMfaToken(null);
                  setTotp('');
                  setError(null);
                }}
              >
                {t('auth.backToLogin')}
              </button>
            </form>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="mb-2">
                <p className="mb-2 text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
                  {t('app.tagline')}
                </p>
                <h2 className="font-display text-4xl font-medium leading-tight tracking-tight">
                  {t('auth.welcomeBack')}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{t('auth.signInSubtitle')}</p>
              </div>

              <div>
                <Label htmlFor="email">{t('auth.email')}</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    className="pl-9"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    aria-invalid={Boolean(error)}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t('auth.password')}</Label>
                  <span className="text-[10px] text-muted-foreground">{t('auth.contactAdmin')}</span>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="pl-9 pr-10"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    aria-invalid={Boolean(error)}
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-ink"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <FieldError>{error ?? undefined}</FieldError>
              </div>

              <Button type="submit" size="lg" className="w-full" loading={pending}>
                {pending ? t('auth.signingIn') : t('auth.signIn')}
                {!pending ? <ArrowRight /> : null}
              </Button>

              <div className="rounded-xl border border-line bg-surface/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
                    <KeyRound className="size-3.5 text-brand" />
                    {t('auth.demoAccounts')}
                  </p>
                  <span className="text-[10px] text-muted-foreground">{DEMO_PASSWORD}</span>
                </div>
                <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
                  {t('auth.demoHint')}
                </p>
                <div className="max-h-[196px] space-y-1 overflow-y-auto pr-1">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => fillDemo(account)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted',
                        email === account.email && 'bg-muted',
                      )}
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[9px] font-semibold text-brand">
                        {account.name.split(' ').slice(-1)[0]!.slice(0, 1)}
                        {account.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{account.name}</span>
                      <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground">
                        {account.role}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[9px] uppercase tracking-label text-muted-foreground/70">
                  {DEMO_ACCOUNTS.length} vai trò demo · mật khẩu chung ở trên
                </p>
              </div>
            </form>
          )}
        </div>

        <p className="mx-auto w-full max-w-[380px] text-center text-[10px] leading-relaxed text-muted-foreground/70">
          {t('app.copyright', { year: new Date().getFullYear() })} · Dữ liệu demo, không phải khách hàng thật.
        </p>
      </main>
    </div>
  );
}

function Stat({ value, label }: { value?: number; label: string }) {
  return (
    <div>
      <p className="tabular font-display text-3xl leading-none text-sidebar-ink">
        {typeof value === 'number' ? value.toLocaleString('vi-VN') : '—'}
      </p>
      <p className="mt-2 text-[10px] uppercase leading-relaxed tracking-[0.14em] text-sidebar-muted">
        {label}
      </p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger"
    >
      <Lock className="mt-0.5 size-3.5 shrink-0" />
      {message}
    </div>
  );
}

export { Loader2 };
