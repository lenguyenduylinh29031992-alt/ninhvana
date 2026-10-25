'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  BedDouble,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Gauge,
  RefreshCw,
  Settings2,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import type { DashboardOverview } from '@grand-suite/shared';
import { api } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { useI18n } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const DEPARTMENT_LABEL: Record<string, string> = {
  ROOMS: 'Phòng',
  FNB: 'F&B',
  OTHER_OPERATED: 'Dịch vụ khác',
  MISCELLANEOUS: 'Khác',
  UNDISTRIBUTED: 'Chưa phân bổ',
};

const ACTION_LABEL: Record<string, string> = {
  'reservation.created': 'Đặt phòng mới',
  'reservation.checked_in': 'Nhận phòng',
  'reservation.checked_out': 'Trả phòng',
  'reservation.cancelled': 'Huỷ đặt phòng',
  'reservation.room_moved': 'Đổi phòng',
  'folio.payment': 'Thanh toán folio',
  'folio.charge_posted': 'Ghi phí folio',
  'folio.item_voided': 'Huỷ dòng folio',
  'pos.order_paid': 'Thanh toán POS',
  'pos.charged_to_room': 'Ghi nợ phòng (POS)',
  'night_audit.completed': 'Hoàn tất kiểm toán đêm',
  'invoice.issued': 'Xuất hoá đơn',
  'housekeeping.task_updated': 'Cập nhật buồng phòng',
  'housekeeping.task_created': 'Tạo việc buồng phòng',
  'pos.items_added': 'Thêm món POS',
  'pos.order_opened': 'Mở order POS',
  'pos.order_sent': 'Gửi bếp',
  'invoice.voided': 'Huỷ hoá đơn',
  'system.seed': 'Khởi tạo dữ liệu nền tảng',
};

export default function DashboardPage() {
  const { user, can } = useAccess();
  const { activeProperty } = useActiveProperty();
  const { formatDate, formatDateTime } = useI18n();

  const overview = useQuery<DashboardOverview>({
    queryKey: ['dashboard', activeProperty?.id ?? 'all'],
    queryFn: () => api<DashboardOverview>('/dashboard/overview'),
    refetchInterval: 60_000,
  });

  const data = overview.data;
  const firstName = user?.fullName.split(' ').slice(-1)[0] ?? '';
  const greeting = new Date().getHours() < 12 ? 'Chào buổi sáng' : new Date().getHours() < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-xs">
            {greeting}, {firstName} · Ngày nghiệp vụ {data ? formatDate(data.businessDate) : '—'}
          </p>
          <h1 className="mt-1 font-display text-4xl leading-tight text-ink">
            {data?.property?.name ?? 'Trung tâm điều hành'}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {data?.property ? `${data.property.city ?? ''} · Bức tranh vận hành theo thời gian thực` : 'Toàn tập đoàn · Doanh thu hợp nhất từ sổ cái'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void overview.refetch()} loading={overview.isFetching}>
            <RefreshCw /> Làm mới
          </Button>
          {can('settings:view') ? (
            <Button asChild size="sm"><Link href="/settings"><Settings2 /> Cấu hình</Link></Button>
          ) : null}
        </div>
      </div>

      {overview.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-32" />)}
        </div>
      ) : overview.isError ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Không tải được số liệu. <button className="text-brand" onClick={() => void overview.refetch()}>Thử lại</button></CardContent></Card>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Metric
              label="Doanh thu hôm nay"
              value={formatMoney(data.metrics.revenueToday)}
              hint={`Tháng ${formatMoney(data.metrics.revenueMonth)} · so với tháng trước`}
              change={data.metrics.revenueChangePct}
              icon={CircleDollarSign}
              primary
            />
            <Metric
              label="Công suất"
              value={`${formatNumber(data.metrics.occupancy, 'vi-VN', 1)}%`}
              hint={`${data.metrics.roomsSold}/${data.metrics.roomsAvailable} phòng · so với hôm qua`}
              change={data.metrics.occupancyChangePct}
              icon={Gauge}
            />
            <Metric
              label="ADR"
              value={formatMoney(data.metrics.adr)}
              hint={`RevPAR ${formatMoney(data.metrics.revpar)} · TRevPAR ${formatMoney(data.metrics.trevpar)}`}
              change={data.metrics.adrChangePct}
              icon={BedDouble}
            />
            <Metric label="Khách đang lưu trú" value={formatNumber(data.metrics.inHouseGuests)} hint={`ALOS ${formatNumber(data.metrics.alos, 'vi-VN', 2)} đêm`} icon={Users} />
            <Metric label="Khách đến hôm nay" value={formatNumber(data.metrics.arrivalsToday)} hint={`${data.metrics.departuresToday} khách dự kiến trả phòng`} icon={CalendarDays} />
            <Metric label="Nhân sự trong ca" value={data.hasStaffData ? formatNumber(data.metrics.staffOnDuty) : '—'} hint={data.hasStaffData ? 'Từ dữ liệu chấm công' : 'Chấm công & xếp ca sẽ kích hoạt ở Giai đoạn 4'} icon={Clock3} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div><CardTitle>Doanh thu 14 ngày</CardTitle><p className="mt-1 text-[10px] text-muted-foreground">Tổng hợp từ sổ nhật ký kép, đã trừ thuế và phí dịch vụ.</p></div>
                <Badge tone="outline"><TrendingUp className="size-3" /> {formatMoney(data.metrics.revenueMonth)} trong tháng</Badge>
              </CardHeader>
              <CardContent>
                <TrendChart points={data.trend} />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="label-xs mb-2">Theo bộ phận</p>
                    <DepartmentBars rows={data.byDepartment} total={data.metrics.revenueMonth} />
                  </div>
                  <div>
                    <p className="label-xs mb-2">Theo kênh bán</p>
                    <div className="space-y-1.5">
                      {data.byChannel.slice(0, 6).map((channel) => (
                        <div key={channel.channelCode} className="flex items-center justify-between text-[11px]">
                          <span className="truncate text-muted-foreground">{channel.channelName}</span>
                          <span className="tabular text-ink">
                            {formatMoney(channel.netAmount ?? channel.amount)}
                            <span className="ml-1 text-[9px] text-muted-foreground">{channel.bookings ?? 0} booking</span>
                          </span>
                        </div>
                      ))}
                      {data.byChannel.length === 0 ? <p className="text-[10px] text-muted-foreground">Chưa có doanh thu theo kênh.</p> : null}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between"><CardTitle>Danh mục cơ sở</CardTitle><Badge tone="outline"><Building2 className="size-3" /> {data.properties.length} cơ sở</Badge></CardHeader>
                <CardContent className="space-y-2">
                  {data.properties.map((property) => (
                    <div key={property.id} className="rounded-xl border border-line p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-display text-base text-ink">{property.name}</p>
                          <p className="text-[9px] uppercase tracking-label text-muted-foreground">{property.code} · {property.city ?? '—'}</p>
                        </div>
                        <Badge tone={property.type === 'HOTEL' ? 'brand' : 'outline'}>{property.type === 'HOTEL' ? 'Khách sạn' : 'Nhà hàng'}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                        <div><p className="text-muted-foreground">Doanh thu tháng</p><p className="tabular font-medium text-ink">{formatMoney(property.revenueMonth)}</p></div>
                        <div><p className="text-muted-foreground">Công suất</p><p className="tabular font-medium text-ink">{property.occupancy}%</p></div>
                        <div><p className="text-muted-foreground">Đang ở</p><p className="tabular font-medium text-ink">{property.inHouse}</p></div>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand" style={{ width: `${Math.min(100, property.occupancy)}%` }} /></div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Việc cần xử lý</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {data.pendingTasks.length === 0 ? <p className="py-4 text-center text-[11px] text-muted-foreground">Không có việc tồn đọng.</p> : data.pendingTasks.map((task) => (
                    <Link key={task.key} href={task.href} className="flex items-center justify-between rounded-lg px-2 py-2 text-[11px] hover:bg-muted">
                      <span className="text-muted-foreground">{task.label}</span>
                      <span className="flex items-center gap-1 font-medium text-ink">{task.count} <ChevronRight className="size-3" /></span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
            <Card>
              <CardHeader><CardTitle>Hoạt động gần đây</CardTitle></CardHeader>
              <CardContent className="space-y-2.5">
                {data.activity.length === 0 ? <p className="text-[11px] text-muted-foreground">Chưa có hoạt động.</p> : data.activity.slice(0, 7).map((item) => (
                  <div key={item.id} className="flex items-start gap-2">
                    <span className="mt-0.5 flex size-6 items-center justify-center rounded-full bg-brand-soft"><Sparkles className="size-3 text-brand" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-ink">{ACTION_LABEL[item.action] ?? item.action}</p>
                      <p className="text-[9px] text-muted-foreground">{item.actorName ?? 'Hệ thống'} · {formatDateTime(item.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Sức khoẻ hệ thống</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.health.components.map((component) => (
                  <div key={component.name} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{component.name}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={cn('size-1.5 rounded-full', component.status === 'up' ? 'bg-forest' : 'bg-danger')} />
                      {component.latencyMs != null ? `${component.latencyMs} ms` : component.status}
                    </span>
                  </div>
                ))}
                <div className="border-t border-line pt-2 text-[10px] text-muted-foreground">Phiên bản {data.health.version} · {data.health.environment}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Chỉ số vận hành</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <MiniStat icon={Wallet} label="TRevPAR" value={formatMoney(data.metrics.trevpar)} />
                <MiniStat icon={UserRound} label="ALOS" value={`${formatNumber(data.metrics.alos, 'vi-VN', 2)} đêm`} />
                <MiniStat icon={BedDouble} label="Phòng bán" value={formatNumber(data.metrics.roomsSold)} />
                <MiniStat icon={Building2} label="Tổng phòng" value={formatNumber(data.metrics.roomsAvailable)} />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[10px] text-muted-foreground">
        <span>NINHVANA · HOSPITALITY OPERATING SYSTEM · V0.2</span>
        <span>Doanh thu lấy từ sổ nhật ký kép · Bút toán cân bằng được kiểm tra tự động</span>
      </div>
    </div>
  );
}

function Metric({ label, value, hint, change, icon: Icon, primary }: { label: string; value: string; hint: string; change?: number | null; icon: typeof Gauge; primary?: boolean }) {
  const positive = (change ?? 0) >= 0;
  return (
    <Card className={cn('p-4', primary && 'border-brand/30 bg-gradient-to-br from-brand-soft/60 to-transparent')}>
      <div className="flex items-start justify-between">
        <span className="label-xs">{label}</span>
        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="size-3.5" /></span>
      </div>
      <p className="mt-2 font-display text-3xl leading-none text-ink">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {change !== null && change !== undefined ? (
          <span className={cn('flex items-center gap-0.5 text-[10px] font-medium', positive ? 'text-forest' : 'text-danger')}>
            {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(change).toFixed(1)}%
          </span>
        ) : null}
        <p className="text-[9px] text-muted-foreground">{hint}</p>
      </div>
    </Card>
  );
}

function TrendChart({ points }: { points: Array<{ date: string; revenue: number }> }) {
  if (points.length === 0) return <div className="flex h-40 items-center justify-center text-[11px] text-muted-foreground">Chưa có dữ liệu doanh thu.</div>;
  const max = Math.max(...points.map((point) => point.revenue), 1);
  const step = 100 / Math.max(1, points.length - 1);
  const coords = points.map((point, index) => `${index * step},${92 - (point.revenue / max) * 78}`);
  const area = `0,100 ${coords.join(' ')} 100,100`;
  return (
    <div>
      <div className="relative h-40 w-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1f6699" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#1f6699" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#rev)" />
          <polyline points={coords.join(' ')} fill="none" stroke="#1f6699" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
          {coords.map((coord, index) => {
            const [x, y] = coord.split(',');
            return <circle key={points[index]!.date} cx={x} cy={y} r="1.2" fill="#1f6699"><title>{points[index]!.date}: {formatMoney(points[index]!.revenue)}</title></circle>;
          })}
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>{points[0]?.date.slice(5)}</span>
        <span>{points[Math.floor(points.length / 2)]?.date.slice(5)}</span>
        <span>{points[points.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

function DepartmentBars({ rows, total }: { rows: Array<{ department: string; amount: number }>; total: number }) {
  if (rows.length === 0) return <p className="text-[10px] text-muted-foreground">Chưa có doanh thu.</p>;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.department}>
          <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">{DEPARTMENT_LABEL[row.department] ?? row.department}</span><span className="tabular">{formatMoney(row.amount)}</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand" style={{ width: `${total ? Math.min(100, (row.amount / total) * 100) : 0}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line p-2.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-label text-muted-foreground"><Icon className="size-3" /> {label}</div>
      <p className="mt-1 tabular text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
