'use client';

import { Fragment, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, Receipt, RefreshCw, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError, Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExportMenu } from '@/components/domain/export-menu';
import { PageHeader } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface SheetCostConfig { key: string; period: string | null; department: string; gid: string | null; enabled: boolean; rows: number }

interface ExpenseItem { id: string; employeeName: string | null; description: string; category: string; amount: number; itemDate: string }
interface Expense { id: string; number: string; description: string; accountCode: string; department: string; amount: number; vatAmount: number; total: number; status: string; expenseDate: string; items?: ExpenseItem[] }
interface StockRow { id: string; quantity: number; value: number; item?: { name: string; unit: string }; lowStock: boolean }
interface ApInvoice { id: string; number: string; total: number; balance: number; dueDate: string; status: string; supplier: { name: string } }

const ACCOUNTS = [['6100', 'Điện'], ['6110', 'Nước'], ['6200', 'Tiếp thị'], ['6300', 'Bảo trì'], ['6400', 'Hành chính'], ['6900', 'Vận hành khác']];
const DEPTS = [['ADMIN', 'Hành chính'], ['ROOMS', 'Phòng'], ['FNB', 'F&B'], ['SPA', 'Spa'], ['ENGINEERING', 'Kỹ thuật'], ['OTHER_OPS', 'Vận hành khác']];
const COST_GROUP_LABELS: Record<string, string> = { ADMIN: 'Hành chính', ROOMS: 'Phòng', FNB: 'F&B', SPA: 'Spa', ENGINEERING: 'Kỹ thuật', TIKTOK: 'Vận hành khác', MARKETING: 'Vận hành khác', OTHER_OPS: 'Vận hành khác' };
const costGroup = (department: string) => COST_GROUP_LABELS[department] ?? department;

export default function CostsPage() {
  const { can } = useAccess(); const { activeProperty, properties } = useActiveProperty(); const queryClient = useQueryClient();
  const propertyId = activeProperty?.id ?? properties.find((property) => property.type === 'HOTEL')?.id ?? properties[0]?.id;
  const [tab, setTab] = useState<'EXPENSES' | 'STOCK' | 'AP'>('EXPENSES'); const [open, setOpen] = useState(false);
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const years = Array.from({ length: 4 }, (_, index) => String(now.getFullYear() - 2 + index));
  const from = year === 'ALL' ? undefined : month === 'ALL' ? `${year}-01-01` : `${year}-${month}-01`;
  const to = year === 'ALL' ? undefined : month === 'ALL' ? `${year}-12-31` : `${year}-${month}-${new Date(Number(year), Number(month), 0).getDate()}`;
  const periodLabel = year === 'ALL' ? 'Tất cả các năm' : month === 'ALL' ? `Năm ${year}` : `Tháng ${month}/${year}`;
  const expenseQuery = new URLSearchParams({ propertyId: propertyId ?? '' });
  if (from) expenseQuery.set('from', from);
  if (to) expenseQuery.set('to', to);

  const expenses = useQuery<Expense[]>({ queryKey: ['expenses', propertyId, from, to], queryFn: () => api(`/costs/expenses?${expenseQuery.toString()}`), enabled: Boolean(propertyId) && can('expense:view') });
  const sheetConfig = useQuery<SheetCostConfig[]>({ queryKey: ['sheet-config'], queryFn: () => api('/hr/sheets/config'), enabled: can('expense:view') });
  const [filterReady, setFilterReady] = useState(false);
  useEffect(() => {
    if (filterReady || !sheetConfig.data) return;
    const latest = sheetConfig.data
      .filter((config) => config.key.split(':')[0] === 'shopping' && config.enabled && config.period && config.rows > 0)
      .sort((a, b) => (b.period ?? '').localeCompare(a.period ?? ''))[0];
    if (latest?.period) { setYear(latest.period.slice(0, 4)); setMonth(latest.period.slice(5, 7)); }
    setFilterReady(true);
  }, [filterReady, sheetConfig.data]);

  const syncShopping = useMutation({
    mutationFn: async () => {
      const period = `${year}-${month}`;
      const configs = await api<SheetCostConfig[]>('/hr/sheets/config');
      const candidates = configs.filter((config) => config.key.split(':')[0] === 'shopping' && config.period === period && config.department === 'TIKTOK');
      const config = candidates.find((item) => item.key === `shopping:${period}:TIKTOK`) ?? candidates[0];
      if (!config) throw new Error(`Chưa có cấu hình Chi phí khác cho TIKTOK tháng ${period}`);
      if (!config.gid) throw new Error(`Cấu hình ${config.key} chưa có GID`);
      return api<{ sources?: Array<{ key: string; ok: boolean; message?: string }> }>(`/hr/sheets/shopping/sync?propertyId=${propertyId}&period=${period}&department=TIKTOK&configKey=${encodeURIComponent(config.key)}`, { method: 'POST', body: {} });
    },
    onSuccess: async (result) => {
      const failed = (result.sources ?? []).filter((source) => !source.ok);
      if (failed.length) toast.error(failed.map((source) => source.message ?? 'Lỗi đồng bộ').join(' · '));
      else toast.success(`Đã đồng bộ chi phí tháng ${month}/${year}`);
      await queryClient.invalidateQueries({ queryKey: ['expenses'] });
      await queryClient.invalidateQueries({ queryKey: ['sheet-config'] });
    },
    onError: (cause) => toast.error(cause instanceof Error ? cause.message : 'Không đồng bộ được chi phí'),
  });
  const stock = useQuery<StockRow[]>({ queryKey: ['stock', propertyId], queryFn: () => api(`/procurement/stock?propertyId=${propertyId}`), enabled: Boolean(propertyId) && can('inventory:view') });
  const invoices = useQuery<ApInvoice[]>({ queryKey: ['ap-invoices', propertyId], queryFn: () => api(`/procurement/invoices?propertyId=${propertyId}`), enabled: Boolean(propertyId) && can('purchase:view') });

  if (!can('expense:view')) return <PermissionNotice />;
  const totalExpense = (expenses.data ?? []).reduce((sum, expense) => sum + Number(expense.total), 0);
  const stockValue = (stock.data ?? []).reduce((sum, row) => sum + Number(row.value), 0);
  const apBalance = (invoices.data ?? []).reduce((sum, invoice) => sum + Number(invoice.balance), 0);

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Tài chính · Chi phí & kho" title="Kiểm soát chi phí" description="Chi phí theo bộ phận, hoá đơn nhà cung cấp và giá trị tồn kho." actions={<div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1"><NativeSelect aria-label="Chọn năm chi phí" className="h-7 w-20 border-0 bg-transparent px-1 text-[11px]" value={year} onChange={(event) => setYear(event.target.value)}><option value="ALL">Tất cả</option>{years.map((value) => <option key={value} value={value}>{value}</option>)}</NativeSelect><span className="text-muted-foreground">/</span><NativeSelect aria-label="Chọn tháng chi phí" className="h-7 w-24 border-0 bg-transparent px-1 text-[11px]" value={month} onChange={(event) => setMonth(event.target.value)} disabled={year === 'ALL'}><option value="ALL">Cả năm</option>{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((value) => <option key={value} value={value}>Tháng {value}</option>)}</NativeSelect></div>{can('expense:view') ? <Button size="sm" variant="secondary" disabled={!propertyId || year === 'ALL' || month === 'ALL' || syncShopping.isPending} onClick={() => syncShopping.mutate()}><RefreshCw className={syncShopping.isPending ? 'animate-spin' : ''} /> Đồng bộ chi phí</Button> : null}<ExportMenu dataset="supplier-invoices" label="Xuất chi phí" />{can('expense:create') ? <Button size="sm" onClick={() => setOpen(true)}><Plus /> Ghi chi phí</Button> : null}</div>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi icon={Receipt} label="Chi phí đã ghi" value={formatMoney(totalExpense)} hint={`${expenses.data?.length ?? 0} chứng từ · ${periodLabel}`} />
        <Kpi icon={Boxes} label="Giá trị tồn kho" value={formatMoney(stockValue)} hint={`${stock.data?.length ?? 0} mặt hàng`} />
        <Kpi icon={Truck} label="Công nợ nhà cung cấp" value={formatMoney(apBalance)} hint={`${invoices.data?.length ?? 0} hoá đơn`} />
      </div>
      <div className="flex gap-1">{([['EXPENSES', 'Chi phí'], ['STOCK', 'Tồn kho'], ['AP', 'Công nợ NCC']] as const).map(([value, label]) => <Button key={value} size="sm" variant={tab === value ? 'primary' : 'secondary'} onClick={() => setTab(value)}>{label}</Button>)}</div>
      <Card><CardContent className="p-0">
        {tab === 'EXPENSES' ? <Table><TableHeader><TableRow><TableHead className="pl-4">Số</TableHead><TableHead>Diễn giải</TableHead><TableHead>Bộ phận</TableHead><TableHead>Tài khoản</TableHead><TableHead>Ngày</TableHead><TableHead className="pr-4 text-right">Tổng</TableHead></TableRow></TableHeader><TableBody>
          {Object.entries((expenses.data ?? []).reduce<Record<string, Expense[]>>((groups, expense) => {
            const group = costGroup(expense.department);
            (groups[group] ??= []).push(expense);
            return groups;
          }, {})).map(([group, rows]) => (
            <Fragment key={group}>
              <TableRow><TableCell colSpan={6} className="bg-muted/40 pl-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">{group} · {rows.length} chứng từ</TableCell></TableRow>
              {rows.map((expense) => <TableRow key={expense.id}><TableCell className="pl-4 font-mono text-[10px]">{expense.number}</TableCell><TableCell className="text-[11px]">{expense.description}</TableCell><TableCell><Badge tone="outline">{expense.department === 'TIKTOK' || expense.department === 'OTHER_OPS' ? 'Vận hành khác' : expense.department}</Badge></TableCell><TableCell className="text-[10px]">{expense.accountCode}</TableCell><TableCell className="text-[10px]">{expense.expenseDate.slice(0, 10)}</TableCell><TableCell className="pr-4 tabular text-right text-[11px]">{formatMoney(expense.total)}</TableCell></TableRow>)}
            </Fragment>
          ))}
        </TableBody></Table> : null}
        {tab === 'STOCK' ? <Table><TableHeader><TableRow><TableHead className="pl-4">Mặt hàng</TableHead><TableHead>Đơn vị</TableHead><TableHead className="text-right">Tồn</TableHead><TableHead className="text-right">Giá trị</TableHead><TableHead className="pr-4">Trạng thái</TableHead></TableRow></TableHeader><TableBody>
          {(stock.data ?? []).map((row) => <TableRow key={row.id}><TableCell className="pl-4 text-[11px]">{row.item?.name ?? row.id}</TableCell><TableCell>{row.item?.unit}</TableCell><TableCell className="tabular text-right">{Number(row.quantity).toLocaleString('vi-VN')}</TableCell><TableCell className="tabular text-right">{formatMoney(row.value)}</TableCell><TableCell className="pr-4">{row.lowStock ? <Badge tone="danger">Dưới định mức</Badge> : <Badge tone="success">Đủ</Badge>}</TableCell></TableRow>)}
        </TableBody></Table> : null}
        {tab === 'AP' ? <Table><TableHeader><TableRow><TableHead className="pl-4">Hoá đơn</TableHead><TableHead>Nhà cung cấp</TableHead><TableHead>Đến hạn</TableHead><TableHead>Trạng thái</TableHead><TableHead className="pr-4 text-right">Còn nợ</TableHead></TableRow></TableHeader><TableBody>
          {(invoices.data ?? []).map((invoice) => <TableRow key={invoice.id}><TableCell className="pl-4 font-mono text-[10px]">{invoice.number}</TableCell><TableCell className="text-[11px]">{invoice.supplier.name}</TableCell><TableCell className="text-[10px]">{invoice.dueDate.slice(0, 10)}</TableCell><TableCell><Badge tone={invoice.status === 'PAID' ? 'success' : 'warning'}>{invoice.status}</Badge></TableCell><TableCell className="pr-4 tabular text-right text-[11px]">{formatMoney(invoice.balance)}</TableCell></TableRow>)}
        </TableBody></Table> : null}
      </CardContent></Card>
      {tab === 'EXPENSES' ? (() => {
        const items = (expenses.data ?? []).flatMap((expense) => (expense.items ?? []).map((item) => ({ ...item, department: expense.department, period: expense.expenseDate.slice(0, 7) })));
        if (items.length === 0) return null;
        const groups = items.reduce<Record<string, Record<string, typeof items>>>((result, item) => {
          const department = costGroup(item.department);
          const employee = item.employeeName || 'Chi chung';
          ((result[department] ??= {})[employee] ??= []).push(item);
          return result;
        }, {});
        return (
          <Card><CardContent className="p-0">
            <div className="border-b border-line px-4 py-3"><p className="font-display text-lg text-ink">Chi tiết mua sắm theo bộ phận & nhân viên</p><p className="text-[10px] text-muted-foreground">{periodLabel} · bấm từng nhân viên để thu gọn/mở rộng</p></div>
            {Object.entries(groups).map(([department, employees]) => (
              <div key={department} className="border-b border-line last:border-0">
                <div className="flex items-center justify-between bg-muted/30 px-4 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">{department}</p><p className="text-[10px] text-muted-foreground">{Object.values(employees).flat().length} mục · {formatMoney(Object.values(employees).flat().reduce((sum, item) => sum + Number(item.amount), 0))}</p></div>
                {Object.entries(employees).map(([employee, rows]) => (
                  <details key={employee} className="group border-t border-line/60">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-xs hover:bg-muted/30"><span className="font-medium text-ink">{employee} <span className="font-normal text-muted-foreground">· {rows.length} mục</span></span><span className="tabular text-right text-ink">{formatMoney(rows.reduce((sum, item) => sum + Number(item.amount), 0))}<span className="ml-2 inline-block text-muted-foreground transition group-open:rotate-90">›</span></span></summary>
                    <div className="overflow-x-auto border-t border-line/50"><Table><TableHeader><TableRow><TableHead className="pl-8">Nội dung</TableHead><TableHead>Ngày</TableHead><TableHead className="pr-4 text-right">Số tiền</TableHead></TableRow></TableHeader><TableBody>
                      {rows.map((item) => <TableRow key={item.id}><TableCell className="pl-8 text-[11px]">{item.description}</TableCell><TableCell className="text-[10px]">{item.itemDate.slice(0, 10)}</TableCell><TableCell className="pr-4 tabular text-right text-[11px]">{formatMoney(item.amount)}</TableCell></TableRow>)}
                    </TableBody></Table></div>
                  </details>
                ))}
              </div>
            ))}
          </CardContent></Card>
        );
      })() : null}
      <ExpenseDialog open={open} onOpenChange={setOpen} propertyId={propertyId!} onDone={async () => { await queryClient.invalidateQueries({ queryKey: ['expenses'] }); await queryClient.invalidateQueries({ queryKey: ['pnl'] }); }} />
    </div>
  );
}

function ExpenseDialog({ open, onOpenChange, propertyId, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; propertyId: string; onDone: () => Promise<void> }) {
  const [accountCode, setAccountCode] = useState('6100'); const [department, setDepartment] = useState('ADMIN');
  const [description, setDescription] = useState(''); const [amount, setAmount] = useState(''); const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => api('/costs/expenses', { method: 'POST', body: { propertyId, accountCode, department, description, amount: Number(amount), paymentMethod: 'BANK_TRANSFER' } }),
    onSuccess: async () => { toast.success('Đã ghi chi phí và bút toán'); setDescription(''); setAmount(''); onOpenChange(false); await onDone(); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Không ghi được chi phí'),
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Ghi chi phí</DialogTitle></DialogHeader>
    <div className="space-y-3"><div><Label>Diễn giải</Label><Input value={description} onChange={(event) => setDescription(event.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3"><div><Label>Loại chi phí</Label><NativeSelect value={accountCode} onChange={(event) => setAccountCode(event.target.value)}>{ACCOUNTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></div>
        <div><Label>Bộ phận</Label><NativeSelect value={department} onChange={(event) => setDepartment(event.target.value)}>{DEPTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></div></div>
      <div><Label>Số tiền</Label><Input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></div><FieldError>{error ?? undefined}</FieldError></div>
    <Button className="mt-3 w-full" loading={mutation.isPending} onClick={() => { if (!description || !Number(amount)) return setError('Nhập diễn giải và số tiền'); setError(null); mutation.mutate(); }}>Ghi chi phí</Button>
  </DialogContent></Dialog>;
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Receipt; label: string; value: string; hint: string }) {
  return <Card className="p-4"><div className="flex justify-between"><p className="label-xs">{label}</p><Icon className="size-4 text-brand" /></div><p className="mt-2 font-display text-2xl text-ink">{value}</p><p className="text-[9px] text-muted-foreground">{hint}</p></Card>;
}
