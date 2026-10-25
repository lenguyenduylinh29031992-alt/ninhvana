'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarRange, MapPinned, TrendingUp, UtensilsCrossed } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ExportMenu } from '@/components/domain/export-menu';
import { PageHeader } from '@/components/ui/feedback';
import { PermissionNotice } from '@/components/domain/permission-notice';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Area { id: string; code: string; parentCode: string | null; name: string; roomCount: number; departmentGroups: string[]; departmentCodes: string[] }
interface MapResult { items: Area[] }
interface Revenue { from: string; to: string; total: number; byDepartment: Array<{ department: string; amount: number }> }
interface Department { code: string; name: string; division: string; group: string; isRevenueCenter: boolean }

const GROUP_LABEL: Record<string, string> = { ROOMS: 'Phòng', FNB: 'Ẩm thực & đồ uống', OTHER_OPERATED: 'Dịch vụ khác', ADMIN: 'Hành chính', SALES: 'Kinh doanh & tiếp thị', PROPERTY_OPS: 'Vận hành', UTILITIES: 'Năng lượng', MAINTENANCE: 'Bảo trì', UNDISTRIBUTED: 'Chưa phân bổ' };
const LEAF_AREAS = ['A1', 'A2', 'A3', 'B', 'C', 'D'];

export default function RevenuePage() {
  const { can } = useAccess();
  const { activeProperty, properties } = useActiveProperty();
  const propertyId = activeProperty?.id ?? properties[0]?.id;
  const today = new Date().toISOString().slice(0, 10);
  const from = today.slice(0, 8) + '01';
  const enabled = Boolean(propertyId) && can('finance:view');
  const map = useQuery<MapResult>({ queryKey: ['property-map-revenue', propertyId], queryFn: () => api('/property-map'), enabled: Boolean(propertyId) });
  const revenue = useQuery<Revenue>({ queryKey: ['revenue-areas', propertyId, from, today], queryFn: () => api(`/accounting/revenue?propertyId=${propertyId}&from=${from}&to=${today}`), enabled });
  const departments = useQuery<Department[]>({ queryKey: ['departments', propertyId], queryFn: () => api(`/hr/departments?propertyId=${propertyId}`), enabled: Boolean(propertyId) });
  if (!can('finance:view')) return <PermissionNotice />;
  const data = revenue.data;
  const group = (name: string) => data?.byDepartment.find((row) => row.department === name)?.amount ?? 0;
  const areaRows = (map.data?.items ?? []).filter((area) => LEAF_AREAS.includes(area.code));
  const areaAmount = (area: Area) => area.departmentGroups.reduce((sum, key) => sum + group(key), 0);
  const deptByCode = new Map((departments.data ?? []).map((department) => [department.code, department]));

  return <div className="space-y-4">
    <PageHeader eyebrow="Thương mại · Doanh thu đa khu vực" title="Doanh thu theo khu vực & bộ phận" description={`Khách sạn NinhVaNa là một cơ sở duy nhất; doanh thu được tách theo khu vực vận hành (A1–A3, B, C, D) và bộ phận khách sạn/nhà hàng. Kỳ ${from} → ${today}.`} actions={<div className="flex items-center gap-2"><Badge tone="outline"><CalendarRange className="size-3" /> Tháng hiện tại</Badge><ExportMenu dataset="finance" label="Xuất doanh thu" /></div>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={TrendingUp} label="Tổng doanh thu" value={formatMoney(data?.total ?? 0)} hint="Sổ cái kỳ hiện tại" />
      <Kpi icon={Building2} label="Doanh thu phòng" value={formatMoney(group('ROOMS'))} hint="A1 · A2 · A3" />
      <Kpi icon={UtensilsCrossed} label="Ẩm thực & đồ uống" value={formatMoney(group('FNB'))} hint="Nhà hàng · Bar · Bếp" />
      <Kpi icon={MapPinned} label="Dịch vụ khác" value={formatMoney(group('OTHER_OPERATED'))} hint="Bagalog · Hồ bơi · Spa" />
    </div>
    <Card><CardContent className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-display text-xl text-ink">Doanh thu theo khu vực</p><p className="text-[10px] text-muted-foreground">Mỗi khu vực gắn với nhóm bộ phận vận hành; số liệu lấy từ sổ cái.</p></div><Badge tone="brand">{areaRows.length} khu vực</Badge></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {areaRows.map((area) => <div key={area.id} className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-medium text-ink">{area.name}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{area.code} · {area.roomCount} phòng</p></div><span className="font-display text-lg text-brand">{formatMoney(areaAmount(area))}</span></div>
          <div className="mt-3 flex flex-wrap gap-1">{(area.departmentCodes ?? []).map((code) => { const department = deptByCode.get(code); return <Badge key={code} tone="outline">{department?.name ?? code}</Badge>; })}</div>
        </div>)}
      </div>
      {data?.total === 0 ? <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">Chưa có bút toán doanh thu trong kỳ. Cấu trúc khu vực và bộ phận đã sẵn sàng để hạch toán.</p> : null}
    </CardContent></Card>
    <Card><CardContent className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-display text-xl text-ink">Doanh thu theo nhóm bộ phận</p><p className="text-[10px] text-muted-foreground">Sổ cái ghi nhận theo nhóm; cấu trúc bộ phận chi tiết sẵn sàng cho hạch toán và phân quyền sau.</p></div><Badge tone="outline">3 nhóm vận hành</Badge></div>
      <Table><TableHeader><TableRow><TableHead className="pl-0">Nhóm doanh thu</TableHead><TableHead>Bộ phận trực thuộc</TableHead><TableHead className="text-right">Doanh thu</TableHead><TableHead className="pr-0 text-right">Tỷ trọng</TableHead></TableRow></TableHeader><TableBody>
        {(['ROOMS', 'FNB', 'OTHER_OPERATED'] as const).map((groupKey) => {
          const amount = group(groupKey);
          const members = (departments.data ?? []).filter((department) => department.isRevenueCenter && department.group === groupKey);
          return <TableRow key={groupKey}><TableCell className="pl-0 text-xs font-medium text-ink">{GROUP_LABEL[groupKey] ?? groupKey}</TableCell><TableCell><div className="flex flex-wrap gap-1">{members.map((department) => <Badge key={department.code} tone="outline">{department.name}</Badge>)}</div></TableCell><TableCell className="tabular text-right text-xs">{formatMoney(amount)}</TableCell><TableCell className="pr-0 text-right text-[10px] text-muted-foreground">{data?.total ? `${((amount / data.total) * 100).toFixed(1)}%` : '—'}</TableCell></TableRow>;
        })}
      </TableBody></Table>
      <p className="mt-3 text-[10px] text-muted-foreground">Bộ phận chi tiết: {(departments.data ?? []).length} · trung tâm doanh thu: {(departments.data ?? []).filter((department) => department.isRevenueCenter).length} · dùng chung: {(departments.data ?? []).filter((department) => department.division === 'SHARED').length}.</p>
    </CardContent></Card>
  </div>;
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof TrendingUp; label: string; value: string; hint: string }) {
  return <Card><CardContent className="p-4"><div className="flex items-start justify-between"><p className="label-xs">{label}</p><Icon className="size-4 text-brand" /></div><p className="mt-2 font-display text-2xl text-ink">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{hint}</p></CardContent></Card>;
}
