'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { useAccess } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/feedback';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface BudgetRow { id: string; department: string; period: string; category: string; planned: number; actual: number; notes: string | null }
interface BudgetResponse { rows: BudgetRow[]; summary: { planned: number; actual: number } }
interface Department { id: string; code: string; name: string }

const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value) + ' đ';
const month = () => new Date().toISOString().slice(0, 7);

export default function BudgetsPage() {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(month());
  const [department, setDepartment] = useState('ROOMS');
  const [category, setCategory] = useState('Chi phí vận hành');
  const [planned, setPlanned] = useState('');
  const [actual, setActual] = useState('');

  const budgets = useQuery<BudgetResponse>({
    queryKey: ['budgets', period],
    queryFn: () => api<BudgetResponse>(`/budgets?period=${encodeURIComponent(period)}`),
    enabled: can('budget:view'),
  });
  const departments = useQuery<Department[]>({ queryKey: ['hr-departments'], queryFn: () => api('/hr/departments'), enabled: can('budget:view') });

  const save = useMutation({
    mutationFn: () => api('/budgets', { method: 'POST', body: { department, period, category, planned: Number(planned || 0), actual: Number(actual || 0) } }),
    onSuccess: async () => { toast.success('Đã lưu ngân sách'); setPlanned(''); setActual(''); await queryClient.invalidateQueries({ queryKey: ['budgets'] }); },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không lưu được ngân sách'),
  });

  if (!can('budget:view')) return <PermissionNotice />;
  const rows = budgets.data?.rows ?? [];
  const summary = budgets.data?.summary ?? { planned: 0, actual: 0 };
  const variance = summary.planned - summary.actual;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Giai đoạn 4 · Tài chính" title="Ngân sách bộ phận" description="Lập ngân sách theo kỳ và bộ phận, theo dõi thực chi và chênh lệch ngay trên một bảng." actions={<Badge tone={variance >= 0 ? 'success' : 'danger'}>{variance >= 0 ? 'Trong ngân sách' : 'Vượt ngân sách'}</Badge>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="label-xs">Kế hoạch</p><p className="mt-1 font-display text-2xl text-ink">{money(summary.planned)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="label-xs">Thực chi</p><p className="mt-1 font-display text-2xl text-ink">{money(summary.actual)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="label-xs">Chênh lệch</p><p className={`mt-1 font-display text-2xl ${variance >= 0 ? 'text-forest' : 'text-danger'}`}>{money(variance)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Thêm / cập nhật dòng ngân sách</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-1"><Label>Kỳ</Label><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
          <div className="md:col-span-1"><Label>Bộ phận</Label><NativeSelect value={department} onChange={(e) => setDepartment(e.target.value)}>{(departments.data ?? []).map((d) => <option key={d.id} value={d.code}>{d.name}</option>)}</NativeSelect></div>
          <div className="md:col-span-1"><Label>Danh mục</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Chi phí vận hành" /></div>
          <div className="md:col-span-1"><Label>Kế hoạch</Label><Input inputMode="numeric" value={planned} onChange={(e) => setPlanned(e.target.value)} placeholder="0" /></div>
          <div className="md:col-span-1"><Label>Thực chi</Label><Input inputMode="numeric" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0" /></div>
          <div className="flex items-end md:col-span-1"><Button className="w-full" disabled={!can('budget:manage') || save.isPending || !planned} onClick={() => save.mutate()}><Plus /> Lưu dòng</Button></div>
        </CardContent>
      </Card>

      <Card><CardContent className="p-0"><Table>
        <TableHeader><TableRow><TableHead>Bộ phận</TableHead><TableHead>Danh mục</TableHead><TableHead className="text-right">Kế hoạch</TableHead><TableHead className="text-right">Thực chi</TableHead><TableHead className="text-right">Chênh lệch</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.department}</TableCell><TableCell>{row.category}</TableCell><TableCell className="text-right tabular">{money(row.planned)}</TableCell><TableCell className="text-right tabular">{money(row.actual)}</TableCell><TableCell className={`text-right tabular ${row.planned - row.actual >= 0 ? 'text-forest' : 'text-danger'}`}>{money(row.planned - row.actual)}</TableCell></TableRow>)}
          {rows.length === 0 ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground"><Wallet className="mx-auto mb-2 size-6 opacity-50" />Chưa có dòng ngân sách cho kỳ này.</TableCell></TableRow> : null}
        </TableBody>
      </Table></CardContent></Card>
    </div>
  );
}
