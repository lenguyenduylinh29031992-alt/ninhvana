import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  BarChart3,
  BookUser,
  Bot,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ChefHat,
  CreditCard,
  DoorOpen,
  FileBarChart,
  Gem,
  Inbox,
  LayoutDashboard,
  RefreshCw,
  ListChecks,
  Megaphone,
  Map,
  PackageSearch,
  Radio,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  permission?: string;
  anyPermission?: string[];
  phase?: number;
  exact?: boolean;
}

export interface NavSection {
  key: string;
  labelKey: string;
  items: NavItem[];
}

/**
 * Navigation is derived from the same permission catalogue as the API guards.
 * `phase` marks screens that arrive later in the build; they are shown as
 * roadmap items rather than dead links.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'overview',
    labelKey: 'navGroup.overview',
    items: [
      { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, permission: 'dashboard:view' },
    ],
  },
  {
    key: 'operations',
    labelKey: 'navGroup.operations',
    items: [
      { href: '/front-desk', labelKey: 'nav.frontDesk', icon: DoorOpen, permission: 'reservation:view' },
      { href: '/property-map', labelKey: 'nav.propertyMap', icon: Map, permission: 'property:view' },
      { href: '/tape-chart', labelKey: 'nav.tapeChart', icon: CalendarDays, permission: 'reservation:view' },
      { href: '/reservations', labelKey: 'nav.reservations', icon: BookUser, permission: 'reservation:view' },
      { href: '/guests', labelKey: 'nav.guests', icon: Users, permission: 'guest:view' },
      { href: '/housekeeping', labelKey: 'nav.housekeeping', icon: ListChecks, permission: 'housekeeping:view' },
      { href: '/pos', labelKey: 'nav.pos', icon: UtensilsCrossed, permission: 'pos:view' },
      { href: '/pos/kds', labelKey: 'nav.kds', icon: ChefHat, permission: 'kds:view' },
      { href: '/banquet', labelKey: 'nav.banquet', icon: Sparkles, permission: 'banquet:view', phase: 2 },
    ],
  },
  {
    key: 'spa',
    labelKey: 'navGroup.spa',
    items: [
      { href: '/spa', labelKey: 'nav.spa', icon: Sparkles, permission: 'pos:view' },
    ],
  },
  {
    key: 'commercial',
    labelKey: 'navGroup.commercial',
    items: [
      { href: '/revenue', labelKey: 'nav.revenue', icon: TrendingUp, permission: 'finance:view' },
      { href: '/rate-approvals', labelKey: 'nav.rateApprovals', icon: BadgeCheck, permission: 'rate:update' },
      { href: '/night-audit', labelKey: 'nav.nightAudit', icon: ClipboardCheck, permission: 'night-audit:view' },
      { href: '/channels', labelKey: 'nav.channels', icon: Radio, permission: 'channel:view' },
      { href: '/inbox', labelKey: 'nav.inbox', icon: Inbox, permission: 'inbox:view' },
      { href: '/crm', labelKey: 'nav.crm', icon: Gem, permission: 'crm:view' },
      { href: '/marketing', labelKey: 'nav.marketing', icon: Megaphone, permission: 'marketing:view' },
      { href: '/reviews', labelKey: 'nav.reviews', icon: Star, permission: 'review:view' },
    ],
  },
  {
    key: 'finance',
    labelKey: 'navGroup.finance',
    items: [
      { href: '/costs', labelKey: 'nav.costs', icon: Receipt, permission: 'expense:view' },
      { href: '/purchasing', labelKey: 'nav.purchasing', icon: ShoppingCart, permission: 'purchase:view' },
      { href: '/inventory', labelKey: 'nav.inventory', icon: PackageSearch, permission: 'inventory:view' },
      { href: '/budgets', labelKey: 'nav.budgets', icon: Wallet, permission: 'budget:view', phase: 4 },
      { href: '/finance', labelKey: 'nav.finance', icon: BarChart3, permission: 'finance:view' },
    ],
  },
  {
    key: 'people',
    labelKey: 'navGroup.people',
    items: [
      { href: '/hr', labelKey: 'nav.hr', icon: Users, permission: 'payroll:view' },
      { href: '/roster', labelKey: 'nav.roster', icon: CalendarDays, permission: 'roster:view', phase: 4 },
      { href: '/payroll', labelKey: 'nav.payroll', icon: CreditCard, permission: 'payroll:view' },
    ],
  },
  {
    key: 'intelligence',
    labelKey: 'navGroup.intelligence',
    items: [
      { href: '/reports', labelKey: 'nav.reports', icon: FileBarChart, permission: 'report:view' },
      { href: '/assistant', labelKey: 'nav.assistant', icon: Bot, permission: 'assistant:use', phase: 5 },
    ],
  },
  {
    key: 'system',
    labelKey: 'navGroup.system',
    items: [
      { href: '/admin/users', labelKey: 'nav.users', icon: UserCog, permission: 'user:view' },
      { href: '/admin/roles', labelKey: 'nav.roles', icon: ShieldCheck, permission: 'user:view' },
      { href: '/admin/audit', labelKey: 'nav.audit', icon: ScrollText, permission: 'audit:view' },
      { href: '/settings', labelKey: 'nav.settings', icon: Settings, permission: 'settings:view' },
      { href: '/settings/integrations', labelKey: 'nav.integrations', icon: Boxes, permission: 'integration:view' },
      { href: '/updates', labelKey: 'nav.updates', icon: RefreshCw, permission: 'dashboard:view' },
    ],
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  const all = NAV_SECTIONS.flatMap((section) => section.items);
  return (
    all.find((item) => item.href === pathname) ??
    all
      .filter((item) => item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]
  );
}

export const MODULE_ICONS = { Building2, Store, Megaphone };
