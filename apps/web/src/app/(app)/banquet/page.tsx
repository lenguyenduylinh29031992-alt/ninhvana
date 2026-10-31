'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarHeart, Plus, Users } from 'lucide-react';
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

interface EventRow { id: string; code: string; name: string; eventDate: string; startTime: string | null; endTime: string | null; venue: string | null; guests: number; status: string; contractValue: number; deposit: number; contactName: string | null; contactPhone: string | null }
interface EventResponse { rows: EventRow[]; summary: { value: number; deposit: number; guests: number } }

const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value) + ' đ';
const today = () => new Date().toISOString().slice(0, 10);
const STATUS: Record<string, string> = { TENTATIVE: 'Dự kiến', CONFIRMED: 'Đã xác nhận', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã huỷ' };

export default function BanquetPage() {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState(today());
  const [venue, setVenue] = useState('Sảnh tiệc');
  const [guests, setGuests] = useState('50');
  const [contractValue, setContractValue] = useState('');
  const [deposit, setDeposit] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [status, setStatus] = useState('TENTATIVE');

  const events = useQuery<EventResponse>({ queryKey: ['banquet'], queryFn: () => api('/banquet'), enabled: can('banquet:view') });
  const save = useMutation({
    mutationFn: () => api('/banquet', { method: 'POST', body: { name, eventDate, venue, guests: Number(guests || 1), contractValue: Number(contractValue || 0), deposit: Number(deposit || 0), contactName, contactPhone, status } }),
    onSuccess: async () => { toast.success('Đã lưu tiệc/sự kiện'); setName(''); setContractValue(''); setDeposit(''); await queryClient.invalidateQueries({ queryKey: ['banquet'] }); },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không lưu được sự kiện'),
  });
  const update = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: string }) => api(`/banquet/${id}`, { method: 'PATCH', body: { status: nextStatus } }),
    onSuccess: async () => { toast.success('Đã cập nhật trạng thái'); await queryClient.invalidateQueries({ queryKey: ['banquet'] }); },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không cập nhật được'),
  });

  if (!can('banquet:view')) return <PermissionNotice />;
  const summary = events.data?.summary ?? { value: 0, deposit: 0, guests: 0 };
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Giai đoạn 2 · Thương mại" title="Tiệc & sự kiện" description="Hợp đồng tiệc, sảnh tổ chức, số khách, giá trị hợp đồng và tiền cọc trong một nơi." actions={<Badge tone="outline"><CalendarHeart className="size-3" />{events.data?.rows.length ?? 0} sự kiện</Badge>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="label-xs">Giá trị hợp đồng</p><p className="mt-1 font-display text-2xl text-ink">{money(summary.value)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="label-xs">Đã đặt cọc</p><p className="mt-1 font-display text-2xl text-forest">{money(summary.deposit)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="label-xs">Tổng khách</p><p className="mt-1 font-display text-2xl text-ink">{summary.guests} <Users className="inline size-4 text-muted-foreground" /></p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Tạo hợp đồng tiệc</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2"><Label>Tên sự kiện</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tiệc cưới / hội nghị" /></div>
          <div><Label>Ngày</Label><Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></div>
          <div><Label>Sảnh</Label><Input value={venue} onChange={(e) => setVenue(e.target.value)} /></div>
          <div><Label>Số khách</Label><Input inputMode="numeric" value={guests} onChange={(e) => setGuests(e.target.value)} /></div>
          <div><Label>Giá trị hợp đồng</Label><Input inputMode="numeric" value={contractValue} onChange={(e) => setContractValue(e.target.value)} /></div>
          <div><Label>Đặt cọc</Label><Input inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} /></div>
          <div><Label>Liên hệ</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} /></div>
          <div><Label>Điện thoại</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div>
          <div><Label>Trạng thái</Label><NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect></div>
          <div className="flex items-end md:col-span-5"><Button disabled={!can('banquet:manage') || !name || save.isPending} onClick={() => save.mutate()}><Plus /> Lưu sự kiện</Button></div>
        </CardContent>
      </Card>
      <Card><CardContent className="p-0"><Table>
        <TableHeader><TableRow><TableHead>Mã</TableHead><TableHead>Sự kiện</TableHead><TableHead>Ngày</TableHead><TableHead>Sảnh</TableHead><TableHead className="text-right">Khách</TableHead><TableHead className="text-right">Hợp đồng</TableHead><TableHead className="text-right">Cọc</TableHead><TableHead>Trạng thái</TableHead></TableRow></TableHeader>
        <TableBody>
          {(events.data?.rows ?? []).map((event) => <TableRow key={event.id}><TableCell className="font-mono text-[10px]">{event.code}</TableCell><TableCell><p className="font-medium">{event.name}</p><p className="text-[10px] text-muted-foreground">{event.contactName} {event.contactPhone}</p></TableCell><TableCell>{event.eventDate.slice(0, 10)} {event.startTime}</TableCell><TableCell>{event.venue}</TableCell><TableCell className="text-right">{event.guests}</TableCell><TableCell className="text-right">{money(event.contractValue)}</TableCell><TableCell className="text-right">{money(event.deposit)}</TableCell><TableCell><NativeSelect value={event.status} disabled={!can('banquet:manage')} onChange={(e) => update.mutate({ id: event.id, nextStatus: e.target.value })}>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect></TableCell></TableRow>)}
        </TableBody>
      </Table>{events.data?.rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Chưa có tiệc/sự kiện.</p> : null}</CardContent></Card>
    </div>
  );
}
