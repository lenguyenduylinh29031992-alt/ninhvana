'use client';
import { localMonth } from '@/lib/dates';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeDollarSign, PlayCircle, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExportMenu } from '@/components/domain/export-menu';
import { PageHeader } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface Employee { id: string; code: string; fullName: string; position: string; department: string; baseSalary: number; allowances: number; status: string }
interface Run { id: string; period: string; status: string; gross: number; net: number; employeeCost: number; lines?: Array<{ id: string }> }

export default function PayrollPage() {
  const { can } = useAccess(); const { activeProperty, properties } = useActiveProperty(); const queryClient = useQueryClient();
  const propertyId = activeProperty?.id ?? properties.find((property) => property.type === 'HOTEL')?.id ?? properties[0]?.id;
  const currentPeriod = localMonth();
  const [period, setPeriod] = useState(currentPeriod);

  const employees = useQuery<Employee[]>({ queryKey: ['employees', propertyId], queryFn: () => api(`/hr/employees?propertyId=${propertyId}`), enabled: Boolean(propertyId) && can('payroll:view') });
  const runs = useQuery<Run[]>({ queryKey: ['payroll', propertyId], queryFn: () => api(`/hr/payroll?propertyId=${propertyId}`), enabled: Boolean(propertyId) && can('payroll:view') });

  const action = useMutation({
    mutationFn: ({ id, kind }: { id?: string; kind: 'run' | 'post' | 'pay' }) =>
      kind === 'run' ? api('/hr/payroll/run', { method: 'POST', body: { propertyId, period } }) : api(`/hr/payroll/${id}/${kind}`, { method: 'POST' }),
    onSuccess: async () => { toast.success('Đã cập nhật kỳ lương'); await queryClient.invalidateQueries({ queryKey: ['payroll'] }); await queryClient.invalidateQueries({ queryKey: ['pnl'] }); },
    onError: (cause) => toast.error(cause instanceof Error ? cause.message : 'Thao tác thất bại'),
  });

  if (!can('payroll:view')) return <PermissionNotice />;
  const headcount = employees.data?.filter((employee) => employee.status === 'ACTIVE').length ?? 0;
  const latest = runs.data?.[0];

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Nhân sự · Tiền lương" title="Nhân sự & tiền lương" description="Bảng lương theo bộ phận, hạch toán chi phí lương và thanh toán." actions={<ExportMenu dataset="payroll" label="Xuất lương" />} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi icon={Users} label="Nhân sự hoạt động" value={headcount} hint={`${employees.data?.length ?? 0} hồ sơ`} />
        <Kpi icon={BadgeDollarSign} label="Quỹ lương kỳ gần nhất" value={formatMoney(latest?.gross ?? 0)} hint={latest ? `Kỳ ${latest.period} · ${latest.status}` : 'Chưa có kỳ lương'} />
        <Kpi icon={Send} label="Chi phí người sử dụng lao động" value={formatMoney(latest?.employeeCost ?? 0)} hint={`Thực nhận ${formatMoney(latest?.net ?? 0)}`} />
      </div>
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-3">
        <div><Label htmlFor="period">Kỳ lương mới</Label><Input id="period" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></div>
        <Button size="sm" loading={action.isPending} disabled={!can('payroll:manage')} onClick={() => action.mutate({ kind: 'run' })}><PlayCircle /> Tính lương</Button>
        <span className="text-[10px] text-muted-foreground">Tính từ hợp đồng + chấm công, sau đó hạch toán và chi trả.</span>
      </CardContent></Card>
      <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead className="pl-4">Kỳ</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Nhân viên</TableHead><TableHead className="text-right">Thực nhận</TableHead><TableHead className="pr-4 text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>
        {(runs.data ?? []).map((run) => <TableRow key={run.id}><TableCell className="pl-4 font-mono text-[11px]">{run.period}</TableCell><TableCell><Badge tone={run.status === 'PAID' ? 'success' : run.status === 'POSTED' ? 'brand' : 'outline'}>{run.status}</Badge></TableCell><TableCell className="tabular text-right">{formatMoney(run.gross)}</TableCell><TableCell className="tabular text-right">{run.lines?.length ?? '—'}</TableCell><TableCell className="tabular text-right">{formatMoney(run.net)}</TableCell><TableCell className="pr-4 text-right">{run.status === 'DRAFT' ? <Button size="sm" disabled={!can('payroll:approve')} onClick={() => action.mutate({ id: run.id, kind: 'post' })}>Hạch toán</Button> : run.status === 'POSTED' ? <Button size="sm" variant="secondary" disabled={!can('payroll:approve')} onClick={() => action.mutate({ id: run.id, kind: 'pay' })}>Chi lương</Button> : <Badge tone="success">Đã chi</Badge>}</TableCell></TableRow>)}
      </TableBody></Table></CardContent></Card>
      <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead className="pl-4">Nhân viên</TableHead><TableHead>Chức danh</TableHead><TableHead>Bộ phận</TableHead><TableHead className="text-right">Lương cơ bản</TableHead><TableHead className="pr-4 text-right">Phụ cấp</TableHead></TableRow></TableHeader><TableBody>
        {(employees.data ?? []).slice(0, 40).map((employee) => <TableRow key={employee.id}><TableCell className="pl-4 text-[11px]">{employee.fullName}<span className="block font-mono text-[9px] text-muted-foreground">{employee.code}</span></TableCell><TableCell className="text-[10px]">{employee.position}</TableCell><TableCell><Badge tone="outline">{employee.department}</Badge></TableCell><TableCell className="tabular text-right text-[11px]">{formatMoney(employee.baseSalary)}</TableCell><TableCell className="pr-4 tabular text-right text-[11px]">{formatMoney(employee.allowances)}</TableCell></TableRow>)}
      </TableBody></Table></CardContent></Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: string | number; hint: string }) {
  return <Card className="p-4"><div className="flex justify-between"><p className="label-xs">{label}</p><Icon className="size-4 text-brand" /></div><p className="mt-2 font-display text-2xl text-ink">{value}</p><p className="text-[9px] text-muted-foreground">{hint}</p></Card>;
}
