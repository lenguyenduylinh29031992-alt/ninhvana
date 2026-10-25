'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConciergeBell, LayoutDashboard, Megaphone, UtensilsCrossed, Wallet } from 'lucide-react';
import { useAccess } from '@/lib/session';
import { cn } from '@/lib/utils';

type Tab = { href: string; label: string; icon: typeof LayoutDashboard; match: string[]; permission: string };

const TABS: Tab[] = [
  { href: '/front-desk', label: 'Vận hành', icon: ConciergeBell, match: ['/front-desk', '/housekeeping', '/reservations', '/guests', '/tape-chart', '/night-audit', '/property-map'], permission: 'reservation:view' },
  { href: '/pos', label: 'Bán hàng', icon: UtensilsCrossed, match: ['/pos', '/channels', '/inbox'], permission: 'pos:view' },
  { href: '/dashboard', label: 'Trung tâm', icon: LayoutDashboard, match: ['/dashboard'], permission: 'dashboard:view' },
  { href: '/marketing', label: 'Tiếp thị', icon: Megaphone, match: ['/marketing', '/crm', '/reviews'], permission: 'marketing:view' },
  { href: '/finance', label: 'Tài chính', icon: Wallet, match: ['/finance', '/revenue', '/costs', '/payroll', '/reports', '/analytics'], permission: 'finance:view' },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const { can } = useAccess();
  const isActive = (tab: Tab) => tab.match.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const visible = TABS.filter((tab) => can(tab.permission));

  return (
    <nav aria-label="Điều hướng di động" className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-canvas/95 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_30px_rgba(16,42,60,0.07)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex h-[62px] max-w-xl items-end justify-around px-2">
        {visible.map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;
          const center = tab.href === '/dashboard';
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              className={cn('group relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 pb-1 pt-1.5 transition-colors', center && '-mt-7')}
            >
              {center ? (
                <span className={cn('flex size-[58px] items-center justify-center rounded-full border-[5px] border-canvas transition-all', active ? 'bg-brand text-white shadow-[0_8px_25px_rgba(31,102,153,.35)] ring-4 ring-brand/15' : 'bg-sidebar text-sidebar-ink shadow-[0_8px_22px_rgba(11,34,57,.22)]')}>
                  <Icon className="size-6" strokeWidth={1.8} />
                </span>
              ) : (
                <span className={cn('flex size-9 items-center justify-center rounded-xl transition-colors', active ? 'bg-brand-soft text-brand' : 'text-muted-foreground group-active:bg-muted')}>
                  <Icon className="size-[21px]" strokeWidth={active ? 2.2 : 1.8} />
                </span>
              )}
              <span className={cn('max-w-full truncate text-[9px] font-medium tracking-wide', active ? 'text-brand' : 'text-muted-foreground')}>{tab.label}</span>
              {center ? <span className={cn('mt-0.5 h-1 w-1 rounded-full', active ? 'bg-brand' : 'bg-transparent')} /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
