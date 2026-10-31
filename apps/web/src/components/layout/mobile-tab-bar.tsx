'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BedDouble, CalendarDays, Calculator, ChefHat, ConciergeBell, Inbox, LayoutDashboard, MapPinned,
  Megaphone, Package, Plug, Radio, RefreshCw, Settings, Sparkles, Star, Users, UtensilsCrossed, Wallet, Wrench,
} from 'lucide-react';
import { useAccess } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useNavBadges } from '@/lib/nav-badges';
import { canSeeRevenue } from '@/lib/visibility';

type Icon = typeof LayoutDashboard;
type Tab = { href: string; label: string; icon: Icon; match: string[]; permission: string };
type Slot = 'ops' | 'sales' | 'marketing' | 'finance';

const CENTER: Tab = { href: '/dashboard', label: 'Trung tâm', icon: LayoutDashboard, match: ['/dashboard'], permission: 'dashboard:view' };
const BASE: Record<Slot, Tab> = {
  ops: { href: '/front-desk', label: 'Vận hành', icon: ConciergeBell, match: ['/front-desk', '/housekeeping', '/reservations', '/guests', '/tape-chart', '/night-audit', '/property-map', '/banquet'], permission: 'reservation:view' },
  sales: { href: '/pos', label: 'Bán hàng', icon: UtensilsCrossed, match: ['/pos', '/channels', '/inbox'], permission: 'pos:view' },
  marketing: { href: '/marketing', label: 'Tiếp thị', icon: Megaphone, match: ['/marketing', '/crm', '/reviews'], permission: 'marketing:view' },
  finance: { href: '/finance', label: 'Tài chính', icon: Wallet, match: ['/finance', '/revenue', '/costs', '/payroll', '/reports', '/analytics'], permission: 'finance:view' },
};

const DEPARTMENTS: Record<string, Tab & { slot: Slot }> = {
  ROOMS: { slot: 'ops', href: '/tape-chart', label: 'Sơ đồ phòng', icon: BedDouble, match: ['/tape-chart'], permission: 'reservation:view' },
  FRONT_OFFICE: { slot: 'ops', href: '/front-desk', label: 'Lễ tân', icon: ConciergeBell, match: ['/front-desk'], permission: 'reservation:view' },
  HOUSEKEEPING: { slot: 'ops', href: '/housekeeping', label: 'Buồng phòng', icon: Sparkles, match: ['/housekeeping'], permission: 'housekeeping:view' },
  PROPERTY_OPS: { slot: 'ops', href: '/property-map', label: 'Cơ sở', icon: MapPinned, match: ['/property-map'], permission: 'property:view' },
  MAINTENANCE: { slot: 'ops', href: '/property-map', label: 'Bảo trì', icon: Wrench, match: ['/property-map'], permission: 'property:view' },
  UTILITIES: { slot: 'ops', href: '/costs', label: 'Năng lượng', icon: Plug, match: ['/costs'], permission: 'expense:view' },
  RESTAURANT: { slot: 'sales', href: '/pos', label: 'Nhà hàng', icon: UtensilsCrossed, match: ['/pos'], permission: 'pos:view' },
  FNB: { slot: 'sales', href: '/pos', label: 'Ẩm thực', icon: UtensilsCrossed, match: ['/pos'], permission: 'pos:view' },
  BAR: { slot: 'sales', href: '/pos', label: 'Quầy bar', icon: UtensilsCrossed, match: ['/pos'], permission: 'pos:view' },
  KITCHEN: { slot: 'sales', href: '/pos/kds', label: 'Bếp', icon: ChefHat, match: ['/pos/kds'], permission: 'pos:view' },
  ROOM_SERVICE: { slot: 'sales', href: '/pos', label: 'Dịch vụ phòng', icon: UtensilsCrossed, match: ['/pos'], permission: 'pos:view' },
  BAGALOG: { slot: 'sales', href: '/pos', label: 'Bagalog', icon: Package, match: ['/pos'], permission: 'pos:view' },
  POOL: { slot: 'sales', href: '/pos', label: 'Hồ bơi', icon: UtensilsCrossed, match: ['/pos'], permission: 'pos:view' },
  SPA: { slot: 'sales', href: '/spa', label: 'Grand Spa', icon: Sparkles, match: ['/spa'], permission: 'pos:view' },
  EVENTS: { slot: 'sales', href: '/banquet', label: 'Sự kiện', icon: CalendarDays, match: ['/banquet'], permission: 'banquet:view' },
  SALES: { slot: 'marketing', href: '/channels', label: 'Kinh doanh', icon: Radio, match: ['/channels', '/crm'], permission: 'channel:view' },
  TIKTOK: { slot: 'marketing', href: '/marketing', label: 'TikTok', icon: Megaphone, match: ['/marketing'], permission: 'marketing:view' },
  FINANCE: { slot: 'finance', href: '/finance', label: 'Kế toán', icon: Calculator, match: ['/finance', '/revenue'], permission: 'finance:view' },
  PURCHASING: { slot: 'finance', href: '/costs', label: 'Mua hàng', icon: Package, match: ['/costs'], permission: 'expense:view' },
  HR: { slot: 'ops', href: '/hr', label: 'Nhân sự', icon: Users, match: ['/hr', '/payroll'], permission: 'payroll:view' },
  IT: { slot: 'ops', href: '/settings/integrations', label: 'Tích hợp', icon: Plug, match: ['/settings/integrations'], permission: 'settings:view' },
  ADMIN: { slot: 'ops', href: '/settings', label: 'Cấu hình', icon: Settings, match: ['/settings'], permission: 'settings:view' },
};

const REVENUE_TABS = new Set(['/marketing', '/crm', '/reviews', '/channels', '/revenue', '/finance', '/rate-approvals', '/night-audit']);

const FALLBACK_TABS: Tab[] = [
  { href: '/updates', label: 'Cập nhật', icon: RefreshCw, match: ['/updates'], permission: 'dashboard:view' },
  { href: '/front-desk', label: 'Lễ tân', icon: ConciergeBell, match: ['/front-desk'], permission: 'reservation:view' },
  { href: '/housekeeping', label: 'Buồng phòng', icon: Sparkles, match: ['/housekeeping'], permission: 'housekeeping:view' },
  { href: '/property-map', label: 'Cơ sở', icon: MapPinned, match: ['/property-map'], permission: 'property:view' },
  { href: '/reservations', label: 'Đặt phòng', icon: CalendarDays, match: ['/reservations'], permission: 'reservation:view' },
  { href: '/costs', label: 'Chi phí', icon: Wallet, match: ['/costs'], permission: 'expense:view' },
  { href: '/purchasing', label: 'Mua hàng', icon: Package, match: ['/purchasing'], permission: 'purchase:view' },
  { href: '/inventory', label: 'Kho', icon: Package, match: ['/inventory'], permission: 'inventory:view' },
  { href: '/hr', label: 'Nhân sự', icon: Users, match: ['/hr'], permission: 'payroll:view' },
  { href: '/payroll', label: 'Lương', icon: Wallet, match: ['/payroll'], permission: 'payroll:view' },
  { href: '/reports', label: 'Báo cáo', icon: CalendarDays, match: ['/reports'], permission: 'report:view' },
  { href: '/settings', label: 'Cấu hình', icon: Settings, match: ['/settings'], permission: 'settings:view' },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const { can, user } = useAccess();
  const { data: badgeData } = useNavBadges();
  const department = user?.departmentCode ? DEPARTMENTS[user.departmentCode] : undefined;
  const marketingSet: Tab[] | null = user?.departmentCode === 'TIKTOK' ? [
    { href: '/inbox', label: 'Hộp thư', icon: Inbox, match: ['/inbox'], permission: 'inbox:view' },
    { href: '/marketing', label: 'TikTok', icon: Megaphone, match: ['/marketing'], permission: 'marketing:view' },
    CENTER,
    { href: '/crm', label: 'CRM', icon: Users, match: ['/crm'], permission: 'crm:view' },
    { href: '/reviews', label: 'Đánh giá', icon: Star, match: ['/reviews', '/crm'], permission: 'review:view' },
  ] : null;
  const tabs: Tab[] = marketingSet ?? [BASE.ops, BASE.sales, CENTER, BASE.marketing, BASE.finance];
  if (!marketingSet && department && can(department.permission)) {
    const index = department.slot === 'ops' ? 0 : department.slot === 'sales' ? 1 : department.slot === 'marketing' ? 3 : 4;
    tabs[index] = department;
  }

  // The center is always fixed. Fill both sides to exactly two entries so
  // back-office roles do not get a lopsided bar with an empty right side.
  const allowed = (tab: Tab) => (!tab.permission || can(tab.permission))
    && (canSeeRevenue(user?.departmentCode) || !REVENUE_TABS.has(tab.href));
  const pool = [...tabs, ...FALLBACK_TABS].filter(allowed);
  const fillSide = (preferred: Tab[], used: Set<string>) => {
    const result: Tab[] = [];
    for (const tab of [...preferred, ...pool]) {
      if (result.length >= 2) break;
      if (!allowed(tab) || tab.href === CENTER.href || used.has(tab.href)) continue;
      result.push(tab);
      used.add(tab.href);
    }
    return result;
  };
  const used = new Set<string>([CENTER.href]);
  const leftPreferred = marketingSet ? tabs.slice(0, 2) : [department, BASE.ops, BASE.sales].filter((tab): tab is Tab => Boolean(tab));
  const leftTabs = fillSide(leftPreferred, used);
  const rightTabs = fillSide(marketingSet ? tabs.slice(3, 5) : [BASE.marketing, BASE.finance, ...FALLBACK_TABS], used);
  const isActive = (tab: Tab) => tab.match.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  return (
    <nav aria-label="Điều hướng di động" className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-canvas/95 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_30px_rgba(16,42,60,0.07)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex h-[62px] max-w-xl items-end px-1">
        <div className="grid flex-1 grid-cols-2 items-end justify-items-stretch gap-1">
          {leftTabs.map((tab) => <MobileTab key={`${tab.href}-${tab.label}`} tab={tab} active={isActive(tab)} count={badgeData?.badges[tab.href] ?? 0} />)}
        </div>
        <div className="flex w-[76px] shrink-0 justify-center">
          <MobileTab tab={CENTER} active={isActive(CENTER)} center count={0} />
        </div>
        <div className="grid flex-1 grid-cols-2 items-end justify-items-stretch gap-1">
          {rightTabs.map((tab) => <MobileTab key={`${tab.href}-${tab.label}`} tab={tab} active={isActive(tab)} count={badgeData?.badges[tab.href] ?? 0} />)}
        </div>
      </div>
    </nav>
  );
}

function MobileTab({ tab, active, center = false, count = 0 }: { tab: Tab; active: boolean; center?: boolean; count?: number }) {
  const Icon = tab.icon;
  return (
    <Link href={tab.href} aria-label={tab.label} aria-current={active ? 'page' : undefined} className={cn('group relative flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 pb-1 pt-1.5 transition-colors', center && '-mt-7')}>
      {center ? (
        <span className={cn('flex size-[58px] items-center justify-center rounded-full border-[5px] border-canvas transition-all', active ? 'bg-brand text-white shadow-[0_8px_25px_rgba(31,102,153,.35)] ring-4 ring-brand/15' : 'bg-sidebar text-sidebar-ink shadow-[0_8px_22px_rgba(11,34,57,.22)]')}><Icon className="size-6" strokeWidth={1.8} /></span>
      ) : (
        <span className={cn('relative flex size-9 items-center justify-center rounded-xl transition-colors', active ? 'bg-brand-soft text-brand' : 'text-muted-foreground group-active:bg-muted')}><Icon className="size-[21px]" strokeWidth={active ? 2.2 : 1.8} />{count > 0 ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[9px] font-semibold leading-4 text-white">{count > 99 ? '99+' : count}</span> : null}</span>
      )}
      <span className={cn('max-w-full truncate text-[9px] font-medium tracking-wide', active ? 'text-brand' : 'text-muted-foreground')}>{tab.label}</span>
      {center ? <span className={cn('mt-0.5 h-1 w-1 rounded-full', active ? 'bg-brand' : 'bg-transparent')} /> : null}
    </Link>
  );
}

