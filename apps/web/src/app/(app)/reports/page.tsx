'use client';
import { localDate } from '@/lib/dates';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Play } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface Template { key: string; title: string; description: string }
interface Report { template: string; title: string; from: string; to: string; columns: Array<{ key: string; label: string; type?: string }>; rows: Array<Record<string, string | number>>; totals: Record<string, number> }

export default function ReportsPage() {
  const { can } = useAccess(); const { activeProperty, properties } = useActiveProperty();
  const propertyId = activeProperty?.id ?? properties.find((property) => property.type === 'HOTEL')?.id ?? properties[0]?.id;
  const today = localDate();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`); const [to, setTo] = useState(today);
  const [template, setTemplate] = useState('pnl'); const [runKey, setRunKey] = useState(0);

  const templates = useQuery<Template[]>({ queryKey: ['report-templates'], queryFn: () => api('/reports/templates'), enabled: can('report:view') });
  const report = useQuery<Report>({
    queryKey: ['report', template, propertyId, from, to, runKey],
    queryFn: () => api(`/reports/run?template=${template}&propertyId=${propertyId}&from=${from}&to=${to}`),
    enabled: Boolean(propertyId) && can('report:view') && runKey > 0,
  });

  if (!can('report:view')) return <PermissionNotice />;
  const current = templates.data?.find((item) => item.key === template);

  async function download() {
    const response = await fetch(`/api/v1/reports/export.csv?template=${template}&propertyId=${propertyId}&from=${from}&to=${to}`, { credentials: 'include' });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${template}-${to}.csv`; anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Phân tích · Báo cáo" title="Trình tạo báo cáo" description="Chọn mẫu, tham số ngày/cơ sở, xem trước và xuất CSV (mở được bằng Excel)." />
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-3">
        <div><Label>Từ ngày</Label><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
        <div><Label>Đến ngày</Label><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
        <Button size="sm" onClick={() => setRunKey(runKey + 1)}><Play /> Chạy báo cáo</Button>
        <Button size="sm" variant="secondary" disabled={!report.data || !can('report:export')} onClick={() => void download()}><Download /> Xuất CSV</Button>
      </CardContent></Card>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {(templates.data ?? []).map((item) => (
          <button key={item.key} type="button" onClick={() => { setTemplate(item.key); setRunKey(0); }} className={`rounded-xl border p-3 text-left transition-colors ${template === item.key ? 'border-brand bg-brand-soft/50' : 'border-line bg-surface hover:border-brand/40'}`}>
            <div className="flex items-center justify-between"><span className="font-display text-base text-ink">{item.title}</span><FileSpreadsheet className="size-3.5 text-brand" /></div>
            <p className="mt-1 text-[10px] text-muted-foreground">{item.description}</p>
          </button>
        ))}
      </div>
      {report.data ? (
        <Card><CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><div><p className="font-display text-xl text-ink">{report.data.title}</p><p className="text-[10px] text-muted-foreground">{report.data.from} → {report.data.to} · {report.data.rows.length} dòng</p></div><Badge tone="outline">{current?.key}</Badge></div>
          <Table><TableHeader><TableRow>{report.data.columns.map((column) => <TableHead key={column.key} className={column.type === 'money' || column.type === 'number' ? 'text-right' : ''}>{column.label}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{report.data.rows.map((row, index) => <TableRow key={index}>{report.data!.columns.map((column) => <TableCell key={column.key} className={column.type === 'money' || column.type === 'number' ? 'tabular text-right' : ''}>{column.type === 'money' ? formatMoney(row[column.key] as number) : column.type === 'percent' ? `${row[column.key]}%` : String(row[column.key] ?? '')}</TableCell>)}</TableRow>)}</TableBody></Table>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="py-16 text-center text-xs text-muted-foreground">Chọn mẫu và bấm “Chạy báo cáo”.</CardContent></Card>
      )}
    </div>
  );
}
