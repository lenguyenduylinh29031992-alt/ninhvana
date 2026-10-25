'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  BedDouble,
  Building2,
  CalendarCheck,
  Check,
  CircleAlert,
  ClipboardList,
  CreditCard,
  Database,
  Globe2,
  Moon,
  RefreshCw,
  ServerCog,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  formatMoney,
  type DashboardOverview,
  type SystemStats,
} from '@grand-suite/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, PageHeader, StatCard } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { activityLabel } from '@/lib/activity';
import { useI18n } from '@/lib/i18n';
import { useActiveProperty } from '@/lib/property-context';
import { useAccess } from '@/lib/session';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { user, can } = useAccess();
  const { activePropertyId, activeProperty, properties, setActivePropertyId } = useActiveProperty();
  const { t, locale, formatDate, formatDateTime } = useI18n();

  const overview = useQuery<DashboardOverview>({
    queryKey: ['dashboard', 'overview', activePropertyId],
    queryFn: () =>
      api<DashboardOverview>(
        `/dashboard/overview${activePropertyId ? `?propertyId=${activePropertyId}` : ''}`,
      ),
  });

  const stats = useQuery<SystemStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api<SystemStats>('/dashboard/stats'),
  });

  const data = overview.data;
  const health = data?.health;
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(
      new Date(),
    ),
  );
  const greeting =
    hour < 11
      ? t('dashboard.greetingMorning')
      : hour < 18
        ? t('dashboard.greetingAfternoon')
        : t('dashboard.greetingEvening');

  const money = (value: number) => formatMoney(value, 'VND', locale === 'vi' ? 'vi-VN' : 'en-US');

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        eyebrow={`${greeting}, ${user?.fullName.split(' ').slice(-1)[0] ?? ''} · ${t('dashboard.businessDate')} ${data ? formatDate(data.businessDate) : '—'}`}
        title={activeProperty?.name ?? t('dashboard.title')}
        description={
          activeProperty
            ? `${activeProperty.city} · ${t('dashboard.scopePortfolio') === '' ? '' : 'Bức tranh vận hành theo thời gian thực'}`
            : t('dashboard.subtitle')
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void overview.refetch();
                void stats.refetch();
              }}
              loading={overview.isFetching}
            >
              <RefreshCw />
              {t('common.refresh')}
            </Button>
            {can('settings:view') ? (
              <Button variant="primary" size="sm" asChild>
                <Link href="/settings">
                  <Settings />
                  {t('common.settings')}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {(data?.pendingTasks.length ?? 0) > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/25 bg-warning-soft p-4 sm:flex-row sm:items-center">
          <CircleAlert className="size-4 shrink-0 text-warning" />
          <p className="flex-1 text-xs text-warning">
            Có {data?.pendingTasks.length} việc cần xử lý trước khi vận hành chính thức.
          </p>
          <div className="flex flex-wrap gap-2">
            {data?.pendingTasks.map((task) => (
              <Button key={task.key} size="sm" variant="secondary" asChild>
                <Link href={task.href}>
                  {task.label} ({task.count})
                </Link>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Executive KPIs */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('dashboard.revenueToday')}
          value={data?.hasRevenueData ? money(data.metrics.revenueToday) : '—'}
          hint={
            data?.hasRevenueData
              ? `${t('dashboard.revenueMonth')}: ${money(data.metrics.revenueMonth)}`
              : 'Doanh thu sẽ hiển thị khi có giao dịch đầu tiên (Giai đoạn 2)'
          }
          icon={TrendingUp}
          tone="champagne"
          loading={overview.isLoading}
        />
        <StatCard
          label={t('dashboard.occupancy')}
          value={data?.hasRevenueData ? `${data.metrics.occupancy.toFixed(1)}%` : '—'}
          hint={
            data
              ? `${data.metrics.roomsAvailable.toLocaleString('vi-VN')} phòng sẵn sàng · ${data.metrics.roomsSold} đã bán`
              : undefined
          }
          icon={BedDouble}
          loading={overview.isLoading}
        />
        <StatCard
          label="Phòng sẵn sàng"
          value={data ? data.metrics.roomsAvailable.toLocaleString('vi-VN') : '—'}
          hint={data ? `Trên tổng ${data.properties.reduce((sum, property) => sum + property.rooms, 0)} phòng` : undefined}
          icon={CalendarCheck}
          loading={overview.isLoading}
        />
        <StatCard
          label={t('dashboard.staffOnDuty')}
          value={data?.hasStaffData ? data.metrics.staffOnDuty.toLocaleString('vi-VN') : '—'}
          hint="Chấm công & xếp ca sẽ kích hoạt ở Giai đoạn 4"
          icon={Users}
          loading={overview.isLoading}
        />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          {/* Properties */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>{t('dashboard.portfolio')}</CardTitle>
                <CardDescription>{t('dashboard.scopePortfolio')}</CardDescription>
              </div>
              <Badge tone="champagne">
                <Building2 className="size-3" />
                {properties.length} cơ sở
              </Badge>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {(data?.properties ?? []).map((property) => {
                const selected = property.id === activePropertyId;
                return (
                  <button
                    key={property.id}
                    type="button"
                    onClick={() => setActivePropertyId(property.id)}
                    className={cn(
                      'group relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200',
                      selected
                        ? 'border-champagne/60 bg-champagne-soft/30'
                        : 'border-line bg-canvas/60 hover:border-champagne/35 hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="label-xs">{property.code}</p>
                        <p className="mt-1 font-display text-lg leading-tight text-ink">{property.name}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {property.city} · {property.country}
                          {property.starRating ? ` · ${'★'.repeat(property.starRating)}` : ''}
                        </p>
                      </div>
                      <span className="flex size-8 items-center justify-center rounded-full border border-line bg-surface text-champagne">
                        <Building2 className="size-3.5" />
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line/70 pt-3">
                      <MiniStat label={t('dashboard.rooms')} value={property.rooms} />
                      <MiniStat label="Nhân sự" value={property.activeUsers} />
                      <MiniStat label="Doanh thu" value="—" muted />
                    </div>
                    <span className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-label text-champagne opacity-0 transition-opacity group-hover:opacity-100">
                      {selected ? 'Đang xem' : 'Chọn cơ sở'} <ArrowUpRight className="size-3" />
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Activity */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
                <CardDescription>{t('dashboard.activityHint')}</CardDescription>
              </div>
              {can('audit:view') ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/admin/audit">
                    {t('common.viewAll')} <ArrowUpRight />
                  </Link>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {overview.isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              ) : (data?.activity.length ?? 0) === 0 ? (
                <EmptyState icon={Activity} title={t('dashboard.noActivity')} description={t('dashboard.activityHint')} />
              ) : (
                <ul className="divide-y divide-line/70">
                  {data?.activity.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 py-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Activity className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-ink">{activityLabel(item.action)}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {item.actorName ?? 'Hệ thống'}
                          {item.reason ? ` · ${item.reason}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] tabular text-muted-foreground">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-4">
          {/* Health */}
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.health')}</CardTitle>
              <CardDescription>{health?.status === 'ok' ? t('dashboard.healthOk') : t('dashboard.healthDegraded')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {(health?.components ?? []).map((component) => (
                <div key={component.name} className="flex items-center gap-2.5 rounded-lg border border-line/70 px-3 py-2">
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      component.status === 'up'
                        ? 'bg-forest'
                        : component.status === 'degraded'
                          ? 'bg-warning'
                          : 'bg-danger',
                    )}
                  />
                  <span className="flex-1 text-xs text-ink">
                    {component.name === 'postgres'
                      ? t('dashboard.database')
                      : component.name === 'redis'
                        ? t('dashboard.redis')
                        : t('dashboard.api')}
                  </span>
                  <span className="text-[10px] tabular text-muted-foreground">
                    {component.latencyMs !== undefined ? `${component.latencyMs} ms` : component.status}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
                <span>Phiên bản {health?.version ?? '—'}</span>
                <span>{health?.environment ?? '—'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Readiness */}
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-champagne/10 blur-2xl" />
            <CardHeader>
              <CardTitle>{t('dashboard.systemReady')}</CardTitle>
              <CardDescription>{t('dashboard.systemReadyBody')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: 'Cơ sở & phòng đã cấu hình', done: (stats.data?.rooms ?? 0) > 0 },
                { label: 'Phân quyền theo vai trò', done: (stats.data?.roles ?? 0) > 0 },
                { label: 'Biểu thuế & phí', done: (stats.data?.taxRates ?? 0) > 0 },
                { label: 'Tỷ giá đa tiền tệ', done: (stats.data?.currencies ?? 0) >= 2 },
                { label: 'Gói giá theo mùa', done: (stats.data?.ratePlans ?? 0) > 0 },
                { label: 'Điểm bán & kênh tích hợp', done: (stats.data?.outlets ?? 0) > 0 },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      'flex size-4 items-center justify-center rounded-full',
                      item.done ? 'bg-forest/15 text-forest' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Check className="size-3" />
                  </span>
                  <span className={item.done ? 'text-ink' : 'text-muted-foreground'}>{item.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Foundation stats */}
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.stats')}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <FoundationStat icon={BedDouble} label={t('dashboard.rooms')} value={stats.data?.rooms} />
              <FoundationStat icon={Users} label="Tài khoản" value={stats.data?.users} />
              <FoundationStat icon={ShieldCheck} label={t('dashboard.rolesConfigured')} value={stats.data?.roles} />
              <FoundationStat icon={CreditCard} label={t('dashboard.ratePlans')} value={stats.data?.ratePlans} />
              <FoundationStat icon={Globe2} label={t('dashboard.currencies')} value={stats.data?.currencies} />
              <FoundationStat icon={ClipboardList} label={t('dashboard.outlets')} value={stats.data?.outlets} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Ops note */}
      <div className="grid gap-3 rounded-xl border border-line bg-surface/60 p-4 sm:grid-cols-3">
        {[
          { icon: ServerCog, title: 'Kiến trúc', text: 'Modular monolith · PostgreSQL · Redis · BullMQ' },
          { icon: Database, title: 'Đối soát', text: 'Sổ nhật ký kép là nguồn sự thật duy nhất' },
          { icon: Moon, title: 'Vận hành', text: 'Night audit & báo cáo tự động theo ngày nghiệp vụ' },
        ].map((item) => (
          <div key={item.title} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <item.icon className="size-3.5" />
            </span>
            <div>
              <p className="text-[11px] font-medium text-ink">{item.title}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value, muted }: { label: string; value: number | string; muted?: boolean }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-label text-muted-foreground">{label}</p>
      <p className={cn('tabular mt-0.5 text-sm font-medium', muted ? 'text-muted-foreground' : 'text-ink')}>
        {value}
      </p>
    </div>
  );
}

function FoundationStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BedDouble;
  label: string;
  value?: number;
}) {
  return (
    <div className="rounded-lg border border-line/70 p-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3" />
        <span className="text-[9px] uppercase tracking-label">{label}</span>
      </div>
      {value === undefined ? (
        <Skeleton className="mt-1.5 h-5 w-10" />
      ) : (
        <p className="tabular mt-1 font-display text-xl leading-none text-ink">
          {value.toLocaleString('vi-VN')}
        </p>
      )}
    </div>
  );
}
