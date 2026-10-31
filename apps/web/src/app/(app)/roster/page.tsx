'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { useAccess } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/feedback';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface Shift { id: string; department: string; employeeName: string; date: string; startTime: string; endTime: string; role: string | null; status: string; notes: string | null }
interface Employee { id: string; fullName: string; department: string }
interface Department { id: string; code: string; name: string }

const date = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

export default function RosterPage() {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(date(-3));
  const [to, setTo] = useState(date(10));
  const [department, setDepartment] = useState('ROOMS');
  const [employeeName, setEmployeeName] = useState('');
  const [workDate, setWorkDate] = useState(date());
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');

  const shifts = useQuery<{ rows: Shift[] }>({ queryKey: ['roster', from, to], queryFn: () => api(`/roster?from=${from}&to=${to}`), enabled: can('roster:view') });
  const employees = useQuery<Employee[]>({ queryKey: ['hr-employees'], queryFn: () => api('/hr/employees'), enabled: can('roster:view') });
  const departments = useQuery<Department[]>({ queryKey: ['hr-departments'], queryFn: () => api('/hr/departments'), enabled: can('roster:view') });

  const create = useMutation({
    mutationFn: () => api('/roster', { method: 'POST', body: { department, employeeName, date: workDate, startTime, endTime } }),
    onSuccess: async () => { toast.success('Đã xếp ca'); await queryClient.invalidateQueries({ queryKey: ['roster'] }); },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không xếp được ca'),
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/roster/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: async () => { toast.success('Đã cập nhật ca'); await queryClient.invalidateQueries({ queryKey: ['roster'] }); },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không cập nhật được ca'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/roster/${id}`, { method: 'DELETE' }),
    onSuccess: async () => { toast.success('Đã xoá ca'); await queryClient.invalidateQueries({ queryKey: ['roster'] }); },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không xoá được ca'),
  });

  if (!can('roster:view')) return <PermissionNotice />;
  const grouped = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const shift of shifts.data?.rows ?? []) { const list = map.get(shift.date.slice(0, 10)) ?? []; list.push(shift); map.set(shift.date.slice(0, 10), list); }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shifts.data]);

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Giai đoạn 4 · Nhân sự" title="Xếp ca làm việc" description="Phân ca theo ngày, bộ phận và nhân viên; theo dõi trạng thái và đối chiếu chấm công." actions={<Badge tone="outline"><CalendarDays className="size-3" />{shifts.data?.rows.length ?? 0} ca</Badge>} />
      <Card>
        <CardHeader><CardTitle className="text-lg">Xếp ca mới</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <div><Label>Bộ phận</Label><NativeSelect value={department} onChange={(e) => setDepartment(e.target.value)}>{(departments.data ?? []).map((d) => <option key={d.id} value={d.code}>{d.name}</option>)}</NativeSelect></div>
          <div><Label>Nhân viên</Label><NativeSelect value={employeeName} onChange={(e) => setEmployeeName(e.target.value)}><option value="">Chọn nhân viên</option>{(employees.data ?? []).filter((e) => !department || e.department === department).map((e) => <option key={e.id} value={e.fullName}>{e.fullName}</option>)}</NativeSelect></div>
          <div><Label>Ngày</Label><Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} /></div>
          <div><Label>Bắt đầu</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
          <div><Label>Kết thúc</Label><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
          <div className="flex items-end"><Button className="w-full" disabled={!can('roster:manage') || !employeeName || create.isPending} onClick={() => create.mutate()}><Plus /> Xếp ca</Button></div>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-end gap-2"><div><Label>Từ</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div><Label>Đến</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
      <div className="space-y-3">
        {grouped.map(([day, list]) => <Card key={day}><CardHeader className="py-3"><CardTitle className="text-base">{new Date(`${day}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}</CardTitle></CardHeader><CardContent className="space-y-2">
          {list.map((shift) => <div key={shift.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 text-xs"><span className="min-w-28 font-medium">{shift.startTime} – {shift.endTime}</span><span className="flex-1">{shift.employeeName} <span className="text-muted-foreground">· {shift.department}</span></span><Badge tone={shift.status === 'CONFIRMED' ? 'success' : shift.status === 'CANCELLED' ? 'danger' : 'neutral'}>{shift.status}</Badge>{can('roster:manage') ? <><Button variant="ghost" size="icon-sm" aria-label="Xác nhận" onClick={() => update.mutate({ id: shift.id, status: 'CONFIRMED' })}><Check /></Button><Button variant="ghost" size="icon-sm" aria-label="Huỷ" onClick={() => update.mutate({ id: shift.id, status: 'CANCELLED' })}><X /></Button><Button variant="ghost" size="icon-sm" aria-label="Xoá" onClick={() => remove.mutate(shift.id)}><Trash2 /></Button></> : null}</div>)}
        </CardContent></Card>)}
        {grouped.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Chưa có ca trong khoảng ngày này.</CardContent></Card> : null}
      </div>
    </div>
  );
}
