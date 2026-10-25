'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BadgeDollarSign, BedDouble, FileBarChart, Gauge, Sparkles, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface Consolidated {
  scope: string; period: { from: string; to: string; days: number }; tookMs: number; cached: boolean;
  metrics: { revenue: number; gop: number; gopPar: number; revPar: number; netProfit: number; payroll: number; occupancy: number; adr: number; roomsSold: number; roomsAvailable: number; ar: number; ap: number };
  monthly: Array<{ month: string; revenue: number; gop: number }>;
  forecast: { method: string; mape: number | null; points: Array<{ month: string; revenue: number; low: number; high: number }> };
  channels: Array<{ code: string; name: string; amount: number }>;
  byProperty: Array<{ id: string; name: string; city: string; revenue: number; gop: number; occupation?: number; occupancy: number; rooms: number; sold: number }>;
}

export default function AnalyticsPage() {
  const { can } = useAccess();
  const { activeProperty } = useActiveProperty();
  const query = useQuery<Consolidated>({
    queryKey: ['consolidated', activeProperty?.id ?? 'ALL'],
    queryFn: () => api(`/dashboard/consolidated?propertyId=${activeProperty?.id ?? 'ALL'}`),
    enabled: can('dashboard:view'),
  });

  if (!can('dashboard:view')) return <PermissionNotice />;
  if (query.isLoading || !query.data) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;
  const data = query.data;
  const max = Math.max(...data.monthly.map((point) => point.revenue), ...data.forecast.points.map((point) => point.high), 1);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Điều hành · Phân tích hợp nhất"
        title="Group Performance"
        description={`${data.scope} · ${data.period.from} → ${data.period.to} · dữ liệu sổ cái 24 tháng`}
        actions={<div className="flex items-center gap-2"><Badge tone={data.cached ? 'outline' : 'success'}>{data.cached ? 'cache' : `${data.tookMs} ms`}</Badge><Button asChild size="sm"><Link href="/reports"><FileBarChart /> Báo cáo</Link></Button></div>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Wallet} label="Doanh thu tháng" value={formatMoney(data.metrics.revenue)} hint={`RevPAR ${formatMoney(data.metrics.revPar)}`} />
        <Kpi icon={BadgeDollarSign} label="GOP" value={formatMoney(data.metrics.gop)} hint={`GOPPAR ${formatMoney(data.metrics.gopPar)}`} />
        <Kpi icon={Gauge} label="Công suất" value={`${data.metrics.occupancy}%`} hint={`${data.metrics.roomsSold}/${data.metrics.roomsAvailable} phòng-đêm`} />
        <Kpi icon={BedDouble} label="ADR" value={formatMoney(data.metrics.adr)} hint={`${data.metrics.roomsSold} phòng đã bán`} />
      </div>

      <Card><CardContent className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="font-display text-xl text-ink">Doanh thu 24 tháng & dự báo 6 tháng</p><p className="text-[10px] text-muted-foreground">Cột đặc = thực tế · cột nhạt = dự báo · phương pháp {data.forecast.method}</p></div><Badge tone="champagne"><Sparkles className="size-3" /> MAPE {data.forecast.mape ?? '—'}%</Badge></div>
        <div className="mt-4 flex h-52 items-end gap-1">
          {data.monthly.map((point) => (
            <div key={point.month} className="group relative flex h-full flex-1 flex-col items-center justify-end" title={`${point.month}: ${formatMoney(point.revenue)}`}>
              <div className="w-full rounded-t bg-champagne/80 transition-all group-hover:bg-champagne" style={{ height: `${(point.revenue / max) * 100}%` }} />
            </div>
          ))}
          {data.forecast.points.map((point) => (
            <div key={point.month} className="group relative flex h-full flex-1 flex-col items-center justify-end" title={`Dự báo ${point.month}: ${formatMoney(point.revenue)} (${formatMoney(point.low)} – ${formatMoney(point.high)})`}>
              <div className="w-full rounded-t border border-dashed border-champagne bg-champagne-soft" style={{ height: `${(point.revenue / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-muted-foreground"><span>{data.monthly[0]?.month}</span><span>Thực tế / Dự báo</span><span>{data.forecast.points.at(-1)?.month}</span></div>
      </CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardContent className="p-4"><p className="font-display text-lg text-ink">Theo cơ sở</p>
          <Table><TableHeader><TableRow><TableHead>Cơ sở</TableHead><TableHead className="text-right">Doanh thu</TableHead><TableHead className="text-right">GOP</TableHead><TableHead className="text-right">Công suất</TableHead></TableRow></TableHeader>
            <TableBody>{data.byProperty.map((property) => <TableRow key={property.id}><TableCell className="text-[11px]">{property.name}<span className="block text-[9px] text-muted-foreground">{property.city}</span></TableCell><TableCell className="tabular text-right">{formatMoney(property.revenue)}</TableCell><TableCell className="tabular text-right">{formatMoney(property.gop)}</TableCell><TableCell className="text-right">{property.occupancy}%</TableCell></TableRow>)}</TableBody></Table>
        </CardContent></Card>
        <Card><CardContent className="p-4"><p className="font-display text-lg text-ink">Kênh bán & công nợ</p>
          <div className="mt-2 space-y-1.5">{data.channels.slice(0, 7).map((channel) => <div key={channel.code} className="flex justify-between border-b border-line/60 py-1 text-[11px]"><span className="text-muted-foreground">{channel.name}</span><span className="tabular">{formatMoney(channel.amount)}</span></div>)}</div>
          <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg border border-line p-2"><p className="label-xs">Phải thu</p><p className="tabular text-sm">{formatMoney(data.metrics.ar)}</p></div><div className="rounded-lg border border-line p-2"><p className="label-xs">Phải trả</p><p className="tabular text-sm">{formatMoney(data.metrics.ap)}</p></div></div>
          <div className="mt-3 rounded-lg bg-champagne-soft/50 p-2 text-[10px] text-muted-foreground"><ArrowUpRight className="mr-1 inline size-3" />Dự báo kỳ tới {formatMoney(data.forecast.points[1]?.revenue ?? 0)} · lợi nhuận sau thuế {formatMoney(data.metrics.netProfit)}</div>
        </CardContent></Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Wallet; label: string; value: string; hint: string }) {
  return <Card className="p-4"><div className="flex justify-between"><p className="label-xs">{label}</p><Icon className="size-4 text-champagne" /></div><p className="mt-2 font-display text-3xl text-ink">{value}</p><p className="text-[9px] text-muted-foreground">{hint}</p></Card>;
}
