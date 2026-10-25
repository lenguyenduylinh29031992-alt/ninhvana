'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Banknote, Landmark, Scale, TrendingUp } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface Pnl {
  revenue: number; costOfSales: number; payroll: number; otherOperating: number; fixedCharges: number;
  gop: number; netProfit: number; gopMargin: number; netMargin: number; gopPar: number; revPar: number;
  departments: Array<{ department: string; label: string; revenue: number; cost: number; profit: number; margin: number }>;
  expenseAccounts: Array<{ code: string; name: string; amount: number }>;
}
interface BalanceSheet {
  assets: Array<{ code: string; name: string; amount: number }>;
  liabilities: Array<{ code: string; name: string; amount: number }>;
  equity: Array<{ code: string; name: string; amount: number }>;
  totalAssets: number; totalLiabilities: number; totalEquity: number; difference: number; balanced: boolean;
}
interface CashFlow { openingCash: number; operating: number; investing: number; financing: number; netChange: number; closingCash: number }
interface Aging { total: number; buckets: Record<string, number>; rows: Array<{ id: string; number: string; customer?: string; supplier?: string; dueDate: string; overdueDays: number; balance: number }> }

const TABS = [['pnl', 'P&L'], ['balance', 'Cân đối kế toán'], ['cash', 'Dòng tiền'], ['ar', 'Phải thu'], ['ap', 'Phải trả']] as const;

export default function FinancePage() {
  const { can } = useAccess();
  const { activeProperty, properties } = useActiveProperty();
  const propertyId = activeProperty?.id ?? properties.find((property) => property.type === 'HOTEL')?.id ?? properties[0]?.id;
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('pnl');

  const pnl = useQuery<Pnl>({ queryKey: ['pnl', propertyId, from, to], queryFn: () => api(`/finance/pnl?propertyId=${propertyId}&from=${from}&to=${to}`), enabled: Boolean(propertyId) && tab === 'pnl' && can('finance:view') });
  const balance = useQuery<BalanceSheet>({ queryKey: ['bs', propertyId, to], queryFn: () => api(`/finance/balance-sheet?propertyId=${propertyId}&asOf=${to}`), enabled: Boolean(propertyId) && tab === 'balance' && can('finance:view') });
  const cash = useQuery<CashFlow>({ queryKey: ['cf', propertyId, from, to], queryFn: () => api(`/finance/cash-flow?propertyId=${propertyId}&from=${from}&to=${to}`), enabled: Boolean(propertyId) && tab === 'cash' && can('finance:view') });
  const ar = useQuery<Aging>({ queryKey: ['ar', propertyId, to], queryFn: () => api(`/finance/ar-aging?propertyId=${propertyId}&asOf=${to}`), enabled: Boolean(propertyId) && tab === 'ar' && can('finance:view') });
  const ap = useQuery<Aging>({ queryKey: ['ap', propertyId, to], queryFn: () => api(`/finance/ap-aging?propertyId=${propertyId}&asOf=${to}`), enabled: Boolean(propertyId) && tab === 'ap' && can('finance:view') });

  if (!can('finance:view')) return <PermissionNotice />;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Tài chính · Báo cáo quản trị" title="Tài chính & lãi lỗ" description="P&L theo USALI, cân đối kế toán, lưu chuyển tiền tệ và tuổi nợ — tất cả đọc từ sổ nhật ký kép." actions={<ExportMenu dataset="finance" label="Xuất sổ" />} />
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-3">
        <div><Label htmlFor="fin-from">Từ ngày</Label><Input id="fin-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
        <div><Label htmlFor="fin-to">Đến ngày</Label><Input id="fin-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
        <div className="ml-auto flex flex-wrap gap-1">
          {TABS.map(([value, label]) => <Button key={value} size="sm" variant={tab === value ? 'primary' : 'secondary'} onClick={() => setTab(value)}>{label}</Button>)}
        </div>
      </CardContent></Card>

      {tab === 'pnl' ? (pnl.isLoading ? <Skeleton className="h-96" /> : pnl.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Doanh thu" value={formatMoney(pnl.data.revenue)} hint={`RevPAR ${formatMoney(pnl.data.revPar)}`} icon={TrendingUp} />
            <Kpi label="GOP" value={formatMoney(pnl.data.gop)} hint={`Biên ${pnl.data.gopMargin}% · ${formatMoney(pnl.data.gopPar)}/phòng đêm`} icon={Banknote} />
            <Kpi label="Lợi nhuận sau thuế" value={formatMoney(pnl.data.netProfit)} hint={`Biên ${pnl.data.netMargin}%`} icon={Scale} />
            <Kpi label="Chi phí lương" value={formatMoney(pnl.data.payroll)} hint={`Cố định ${formatMoney(pnl.data.fixedCharges)}`} icon={Landmark} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardContent className="p-4"><p className="font-display text-lg text-ink">Cơ cấu chi phí</p>
              <div className="mt-3 space-y-2 text-xs">
                {[['Giá vốn', pnl.data.costOfSales], ['Lương & phúc lợi', pnl.data.payroll], ['Vận hành khác', pnl.data.otherOperating], ['Chi phí cố định', pnl.data.fixedCharges]].map(([label, value]) => (
                  <div key={label as string}><div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="tabular">{formatMoney(value as number)}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand" style={{ width: `${pnl.data!.revenue ? ((value as number) / pnl.data!.revenue) * 100 : 0}%` }} /></div></div>
                ))}
              </div>
            </CardContent></Card>
            <Card><CardContent className="p-4"><p className="font-display text-lg text-ink">Hiệu quả bộ phận (USALI)</p>
              <Table><TableHeader><TableRow><TableHead>Bộ phận</TableHead><TableHead className="text-right">Doanh thu</TableHead><TableHead className="text-right">Chi phí</TableHead><TableHead className="text-right">Lợi nhuận</TableHead></TableRow></TableHeader>
                <TableBody>{pnl.data.departments.map((row) => <TableRow key={row.department}><TableCell>{row.label}</TableCell><TableCell className="tabular text-right">{formatMoney(row.revenue)}</TableCell><TableCell className="tabular text-right">{formatMoney(row.cost)}</TableCell><TableCell className="tabular text-right font-medium">{formatMoney(row.profit)}</TableCell></TableRow>)}</TableBody></Table>
            </CardContent></Card>
          </div>
        </>
      ) : null) : null}

      {tab === 'balance' ? (balance.isLoading ? <Skeleton className="h-96" /> : balance.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3"><Kpi label="Tổng tài sản" value={formatMoney(balance.data.totalAssets)} hint="" icon={Landmark} /><Kpi label="Nợ phải trả" value={formatMoney(balance.data.totalLiabilities)} hint="" icon={Banknote} /><Kpi label="Vốn chủ sở hữu" value={formatMoney(balance.data.totalEquity)} hint={balance.data.balanced ? 'Cân bằng ✓' : `Lệch ${formatMoney(balance.data.difference)}`} icon={BadgeCheck} /></div>
          <div className="grid gap-4 lg:grid-cols-3">
            {[['Tài sản', balance.data.assets], ['Nợ phải trả', balance.data.liabilities], ['Vốn chủ sở hữu', balance.data.equity]].map(([title, rows]) => (
              <Card key={title as string}><CardContent className="p-4"><p className="font-display text-lg text-ink">{title as string}</p><div className="mt-2 space-y-1 text-[11px]">{(rows as BalanceSheet['assets']).map((row) => <div key={row.code} className="flex justify-between border-b border-line/60 py-1"><span>{row.name}</span><span className="tabular">{formatMoney(row.amount)}</span></div>)}</div></CardContent></Card>
            ))}
          </div>
        </>
      ) : null) : null}

      {tab === 'cash' ? (cash.isLoading ? <Skeleton className="h-72" /> : cash.data ? (
        <Card><CardContent className="p-5">
          <div className="grid gap-3 sm:grid-cols-3"><Kpi label="Tiền đầu kỳ" value={formatMoney(cash.data.openingCash)} hint="" icon={Banknote} /><Kpi label="Thay đổi ròng" value={formatMoney(cash.data.netChange)} hint="" icon={TrendingUp} /><Kpi label="Tiền cuối kỳ" value={formatMoney(cash.data.closingCash)} hint="" icon={Landmark} /></div>
          <Table><TableHeader><TableRow><TableHead>Hoạt động</TableHead><TableHead className="text-right">Số tiền</TableHead></TableRow></TableHeader><TableBody>
            <TableRow><TableCell>Kinh doanh</TableCell><TableCell className="tabular text-right">{formatMoney(cash.data.operating)}</TableCell></TableRow>
            <TableRow><TableCell>Đầu tư</TableCell><TableCell className="tabular text-right">{formatMoney(cash.data.investing)}</TableCell></TableRow>
            <TableRow><TableCell>Tài chính</TableCell><TableCell className="tabular text-right">{formatMoney(cash.data.financing)}</TableCell></TableRow>
          </TableBody></Table>
        </CardContent></Card>
      ) : null) : null}

      {tab === 'ar' || tab === 'ap' ? (
        <AgingView title={tab === 'ar' ? 'Phải thu khách hàng' : 'Phải trả nhà cung cấp'} data={tab === 'ar' ? ar.data : ap.data} loading={(tab === 'ar' ? ar : ap).isLoading} kind={tab} />
      ) : null}
    </div>
  );
}

function AgingView({ title, data, loading, kind }: { title: string; data?: Aging; loading: boolean; kind: 'ar' | 'ap' }) {
  if (loading) return <Skeleton className="h-72" />;
  if (!data) return null;
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center justify-between"><p className="font-display text-xl text-ink">{title}</p><Badge tone="outline">Tổng {formatMoney(data.total)}</Badge></div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[['Trong hạn', 'current'], ['1–30', 'd1_30'], ['31–60', 'd31_60'], ['61–90', 'd61_90'], ['>90', 'd90_plus']].map(([label, key]) => (
          <div key={key} className="rounded-lg border border-line p-2"><p className="text-[9px] text-muted-foreground">{label}</p><p className="tabular text-sm">{formatMoney(data.buckets[key] ?? 0)}</p></div>
        ))}
      </div>
      <Table><TableHeader><TableRow><TableHead>Số chứng từ</TableHead><TableHead>{kind === 'ar' ? 'Khách' : 'Nhà cung cấp'}</TableHead><TableHead>Đến hạn</TableHead><TableHead className="text-right">Quá hạn</TableHead><TableHead className="text-right">Số dư</TableHead></TableRow></TableHeader>
        <TableBody>{data.rows.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-[10px]">{row.number}</TableCell><TableCell>{row.customer ?? row.supplier}</TableCell><TableCell>{row.dueDate}</TableCell><TableCell className="text-right">{row.overdueDays} ngày</TableCell><TableCell className="tabular text-right">{formatMoney(row.balance)}</TableCell></TableRow>)}</TableBody></Table>
    </CardContent></Card>
  );
}

function Kpi({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: typeof TrendingUp }) {
  return <Card className="p-4"><div className="flex justify-between"><p className="label-xs">{label}</p><Icon className="size-4 text-brand" /></div><p className="mt-2 font-display text-2xl text-ink">{value}</p>{hint ? <p className="text-[9px] text-muted-foreground">{hint}</p> : null}</Card>;
}
