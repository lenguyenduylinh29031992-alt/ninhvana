'use client';

import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { roleName, type SessionProperty, type SessionUser } from '@grand-suite/shared';
import { Bell, Building2, ChevronDown, LogOut, Menu, Moon, Search, Sun, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { clearOfflineQueue } from '@/lib/offline-sync';
import { useI18n } from '@/lib/i18n';
import { useActiveProperty } from '@/lib/property-context';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  severity: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function Topbar({
  user,
  onOpenMobileNav,
  onOpenCommand,
  realtimeConnected,
}: {
  user: SessionUser;
  onOpenMobileNav: () => void;
  onOpenCommand: () => void;
  realtimeConnected: boolean;
}) {
  const { t, locale, setLocale, formatDateTime } = useI18n();
  const { theme, toggle } = useTheme();
  const { properties, activeProperty, setActivePropertyId } = useActiveProperty();
  const router = useRouter();
  const queryClient = useQueryClient();

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: NotificationItem[]; unread: number }>('/notifications'),
    refetchInterval: 60_000,
  });
  const unread = notifications.data?.unread ?? 0;

  const today = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date());

  const primaryRole = user.roles[0]?.roleCode ?? '';

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
      clearOfflineQueue();
    } catch {
      /* clearing cookies client-side still signs the user out visually */
    }
    queryClient.clear();
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-30 flex h-[calc(68px+env(safe-area-inset-top))] items-center gap-3 border-b border-line/80 bg-canvas/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:px-7 lg:px-10">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMobileNav}
        aria-label={t('common.menu')}
      >
        <Menu />
      </Button>

      <span className="max-w-[130px] truncate text-xs font-medium text-ink md:hidden">
        {activeProperty?.name ?? t('common.organization')}
      </span>

      <div className="hidden min-w-0 flex-col md:flex">
        <span className="label-xs">{activeProperty?.name ?? t('common.organization')}</span>
        <span className="truncate text-xs text-muted-foreground">{today}</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenCommand}
          className="focus-ring hidden h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-ink sm:flex"
        >
          <Search className="size-3.5" />
          <span className="hidden lg:inline">{t('common.searchEverything')}</span>
          <kbd className="ml-4 rounded border border-line bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-muted-foreground sm:flex">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  realtimeConnected ? 'bg-forest animate-pulse-soft' : 'bg-muted-foreground/40',
                )}
                aria-hidden
              />
              {realtimeConnected ? t('common.realtime') : t('common.offline')}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {realtimeConnected
              ? t('common.realtimeConnected')
              : t('common.realtimeDisconnected')}
          </TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label={t('common.notifications')}>
              <Bell />
              {unread > 0 ? (
                <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-brand text-[9px] font-semibold text-brand-foreground">
                  {unread > 9 ? '9+' : unread}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[340px] p-0">
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <p className="text-sm font-medium">{t('common.notifications')}</p>
              {unread > 0 ? (
                <button
                  type="button"
                  className="text-2xs text-brand hover:underline"
                  onClick={async () => {
                    await api('/notifications/read-all', { method: 'POST' });
                    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
                  }}
                >
                  Đánh dấu đã đọc
                </button>
              ) : null}
            </div>
            <div className="max-h-[340px] overflow-y-auto">
              {(notifications.data?.items ?? []).length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {t('common.noData')}
                </p>
              ) : (
                notifications.data?.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={async () => {
                      await api(`/notifications/${item.id}/read`, { method: 'POST' });
                      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
                      if (item.link) router.push(item.link);
                    }}
                    className={cn(
                      'block w-full border-b border-line/60 px-3 py-2.5 text-left transition-colors hover:bg-muted/60',
                      !item.readAt && 'bg-brand-soft/40',
                    )}
                  >
                    <p className="text-xs font-medium text-ink">{item.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-2xs text-muted-foreground">{item.body}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground/70">
                      {formatDateTime(item.createdAt)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Chọn cơ sở">
              <Building2 />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>{t('property.switch')}</DropdownMenuLabel>
            {user.orgWide ? (
              <DropdownMenuItem onSelect={() => setActivePropertyId(null)}>
                <span className="flex-1">{t('property.all')}</span>
                {activeProperty === null ? <CheckDot /> : null}
              </DropdownMenuItem>
            ) : null}
            {properties.map((property: SessionProperty) => (
              <DropdownMenuItem key={property.id} onSelect={() => setActivePropertyId(property.id)}>
                <span className="flex flex-1 flex-col">
                  <span className="text-sm">{property.name}</span>
                  <span className="text-2xs text-muted-foreground">{property.code}</span>
                </span>
                {activeProperty?.id === property.id ? <CheckDot /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={theme === 'dark' ? t('common.light') : t('common.dark')}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="focus-ring ml-1 flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-2 transition-colors hover:border-brand/40"
            >
              <Avatar name={user.fullName} src={user.avatarUrl} className="size-7" />
              <span className="hidden max-w-[120px] truncate text-xs font-medium sm:block">
                {user.fullName}
              </span>
              <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <div className="px-2.5 py-2">
              <p className="text-sm font-medium text-ink">{user.fullName}</p>
              <p className="text-2xs text-muted-foreground">{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge tone="brand">{roleName(primaryRole, locale)}</Badge>
                {user.orgWide ? <Badge tone="outline">Tập đoàn</Badge> : null}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push('/profile')}>
              <UserRound className="size-4" />
              {t('common.profile')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setLocale(locale === 'vi' ? 'en' : 'vi');
                toast.success(locale === 'vi' ? 'Language: English' : 'Ngôn ngữ: Tiếng Việt');
              }}
            >
              <span className="flex size-4 items-center justify-center text-[10px] font-semibold">A</span>
              {locale === 'vi' ? 'English' : 'Tiếng Việt'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => void logout()}>
              <LogOut className="size-4" />
              {t('common.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function CheckDot() {
  return <span className="size-1.5 rounded-full bg-brand" aria-hidden />;
}
