'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, X } from 'lucide-react';
import { hasPermission, roleName, type SessionUser } from '@grand-suite/shared';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/primitives';
import { useI18n } from '@/lib/i18n';
import { NAV_SECTIONS, type NavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { useNavBadges } from '@/lib/nav-badges';

export function Sidebar({
  user,
  open,
  onClose,
  onLogout,
}: {
  user: SessionUser;
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const { t, locale } = useI18n();
  const permissions = user.permissions ?? [];
  const primaryRole = user.roles[0]?.roleCode ?? '';
  const { data: badgeData } = useNavBadges();

  const allowed = (item: NavItem): boolean => {
    if (item.permission && !hasPermission(permissions, item.permission)) return false;
    if (item.anyPermission && !hasPermission(permissions, item.anyPermission, 'any')) return false;
    return true;
  };

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Đóng menu"
          className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col bg-sidebar text-sidebar-ink transition-transform duration-300 ease-luxe lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Điều hướng chính"
      >
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-line px-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-sidebar-ink/30 font-display text-[15px] tracking-wide text-sidebar-ink">
            NV
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] leading-none tracking-[0.12em] text-sidebar-ink">
              NINHVANA
            </p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.22em] text-sidebar-muted">
              {t('app.sidebarTagline')}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-sidebar-muted hover:bg-white/5 hover:text-sidebar-ink lg:hidden"
            onClick={onClose}
            aria-label="Đóng menu"
          >
            <X />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter(allowed);
            if (items.length === 0) return null;
            return (
              <div key={section.key} className="mb-5">
                <p className="mb-1.5 px-2.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-sidebar-muted/80">
                  {t(section.labelKey as never)}
                </p>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    const content = (
                      <>
                        <Icon className="size-4 shrink-0" aria-hidden />
                        <span className="flex-1 truncate">{t(item.labelKey as never)}</span>
                        {(badgeData?.badges[item.href] ?? 0) > 0 ? (
                          <span className="min-w-5 rounded-full bg-brand px-1.5 py-0.5 text-center text-[9px] font-semibold text-white" aria-label={`${badgeData?.badges[item.href]} cập nhật mới`}>
                            {(badgeData?.badges[item.href] ?? 0) > 99 ? '99+' : badgeData?.badges[item.href]}
                          </span>
                        ) : null}
                        {item.phase ? (
                          <span className="rounded border border-sidebar-line px-1 py-0.5 text-[8px] uppercase tracking-wide text-sidebar-muted">
                            GĐ{item.phase}
                          </span>
                        ) : null}
                      </>
                    );
                    return (
                      <li key={item.href}>
                        {item.phase ? (
                          <button
                            type="button"
                            onClick={() =>
                              toast.info(
                                `${t(item.labelKey as never)} — sẽ ra mắt ở Giai đoạn ${item.phase}`,
                              )
                            }
                            className="relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-sidebar-muted/55 transition-colors hover:bg-white/[0.03] hover:text-sidebar-muted"
                            title={`Giai đoạn ${item.phase}`}
                          >
                            {content}
                          </button>
                        ) : (
                          <Link
                            href={item.href}
                            onClick={onClose}
                            className={cn(
                              'relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
                              active
                                ? 'bg-white/[0.07] font-medium text-sidebar-ink'
                                : 'text-sidebar-muted hover:bg-white/[0.04] hover:text-sidebar-ink',
                            )}
                            aria-current={active ? 'page' : undefined}
                          >
                            {active ? (
                              <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand" aria-hidden />
                            ) : null}
                            {content}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-line p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <Avatar name={user.fullName} src={user.avatarUrl} className="size-8 border-white/10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-sidebar-ink">{user.fullName}</p>
              <p className="truncate text-[10px] text-sidebar-muted">{roleName(primaryRole, locale)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-sidebar-muted hover:bg-white/5 hover:text-sidebar-ink"
              onClick={onLogout}
              aria-label={t('common.logout')}
            >
              <LogOut />
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
