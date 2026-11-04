'use client';
import { localDate } from '@/lib/dates';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Check, FileSignature, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/feedback';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface RoomType { id: string; code: string; name: string; baseRate: number }
interface Approval { id: string; departmentCode: string; departmentName: string; status: string; approverName: string | null; signature: string | null; comment: string | null }
interface RateRequest { id: string; roomType: { id: string; code: string; name: string; baseRate: number }; currentRate: number; proposedRate: number; effectiveFrom: string; effectiveTo: string | null; reason: string; status: string; requestedByName: string; createdAt: string; approvals: Approval[] }

const DEPARTMENTS = [
  { code: 'FINANCE', label: 'Tài chính & Kế toán' },
  { code: 'SALES', label: 'Kinh doanh & Tiếp thị' },
  { code: 'ADMIN', label: 'Ban giám đốc / Hành chính' },
];
const STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
};

export default function RateApprovalsPage() {
  const { can, user } = useAccess();
  const { activeProperty, properties } = useActiveProperty();
  const propertyId = activeProperty?.id ?? properties[0]?.id;
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ roomTypeId: '', proposedRate: '', effectiveFrom: localDate(), effectiveTo: '', reason: '', departments: ['FINANCE', 'SALES', 'ADMIN'] });
  const [target, setTarget] = useState<{ request: RateRequest; approval: Approval } | null>(null);
  const [signature, setSignature] = useState(user?.fullName ?? '');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const enabled = Boolean(propertyId) && can('rate:update');
  const types = useQuery<RoomType[]>({ queryKey: ['room-types', propertyId], queryFn: () => api(`/rooms/types?propertyId=${propertyId}`), enabled });
  const requests = useQuery<RateRequest[]>({ queryKey: ['rate-requests', propertyId], queryFn: () => api(`/rates/requests?propertyId=${propertyId}`), enabled });

  const create = useMutation({
    mutationFn: () => api<RateRequest>('/rates/requests', { method: 'POST', body: {
      propertyId, roomTypeId: form.roomTypeId, proposedRate: Number(form.proposedRate), effectiveFrom: form.effectiveFrom,
      ...(form.effectiveTo ? { effectiveTo: form.effectiveTo } : {}), reason: form.reason, departments: form.departments,
    } }),
    onSuccess: async () => { toast.success('Đã gửi yêu cầu duyệt giá'); setForm({ ...form, proposedRate: '', reason: '' }); await queryClient.invalidateQueries({ queryKey: ['rate-requests'] }); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Không gửi được yêu cầu'),
  });
  const decide = useMutation({
    mutationFn: ({ action }: { action: 'approve' | 'reject' }) => api(`/rates/requests/${target?.request.id}/${action}`, { method: 'POST', body: { departmentCode: target?.approval.departmentCode, signature, comment: comment || undefined } }),
    onSuccess: async () => { toast.success('Đã ghi nhận chữ ký duyệt'); setTarget(null); setComment(''); await queryClient.invalidateQueries({ queryKey: ['rate-requests'] }); },
    onError: (cause) => toast.error(cause instanceof Error ? cause.message : 'Không ký được'),
  });
  if (!can('rate:update')) return <PermissionNotice />;

  const selectedType = types.data?.find((type) => type.id === form.roomTypeId);
  return <div className="space-y-4">
    <PageHeader eyebrow="Thương mại · Kiểm soát giá" title="Phê duyệt & ký giá phòng" description="Chỉ lãnh đạo cấp cao được đề xuất thay đổi giá. Yêu cầu được gửi tới Tài chính, Kinh doanh và Ban giám đốc để ký duyệt online." actions={<Badge tone="brand"><BadgeCheck className="size-3" /> Quy trình duyệt</Badge>} />

    <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
      <Card><CardContent className="space-y-3 p-4">
        <div><p className="font-display text-xl text-ink">Đề xuất giá mới</p><p className="mt-1 text-[10px] text-muted-foreground">Gửi đến các bộ phận liên quan để duyệt trước khi áp dụng.</p></div>
        <div><Label htmlFor="roomType">Loại phòng</Label><NativeSelect id="roomType" value={form.roomTypeId} onChange={(event) => { const type = types.data?.find((item) => item.id === event.target.value); setForm({ ...form, roomTypeId: event.target.value, proposedRate: type ? String(type.baseRate) : form.proposedRate }); }}><option value="">Chọn loại phòng</option>{(types.data ?? []).map((type) => <option key={type.id} value={type.id}>{type.name} · {formatMoney(Number(type.baseRate))}</option>)}</NativeSelect></div>
        <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="rate">Giá đề xuất (VND)</Label><Input id="rate" type="number" min={1} value={form.proposedRate} onChange={(event) => setForm({ ...form, proposedRate: event.target.value })} /></div><div><Label htmlFor="from">Hiệu lực từ</Label><Input id="from" type="date" value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} /></div></div>
        <div><Label htmlFor="to">Hiệu lực đến (không bắt buộc)</Label><Input id="to" type="date" value={form.effectiveTo} onChange={(event) => setForm({ ...form, effectiveTo: event.target.value })} /></div>
        <div><Label htmlFor="reason">Lý do thay đổi</Label><Textarea id="reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Ví dụ: điều chỉnh giá mùa cao điểm, tăng giá do nâng cấp phòng…" /></div>
        <div><Label>Bộ phận cần ký duyệt</Label><div className="space-y-1.5">{DEPARTMENTS.map((department) => <label key={department.code} className="flex items-center gap-2 text-xs text-ink"><input type="checkbox" checked={form.departments.includes(department.code)} onChange={(event) => setForm({ ...form, departments: event.target.checked ? [...form.departments, department.code] : form.departments.filter((code) => code !== department.code) })} />{department.label}</label>)}</div></div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <Button className="w-full" disabled={create.isPending || !form.roomTypeId || !form.proposedRate || form.reason.trim().length < 5 || !form.departments.length} onClick={() => { setError(''); create.mutate(); }}><Send className="size-4" /> {create.isPending ? 'Đang gửi…' : 'Gửi yêu cầu duyệt'}</Button>
        <p className="text-[10px] leading-relaxed text-muted-foreground">Giá hiện tại: {selectedType ? formatMoney(Number(selectedType.baseRate)) : '—'} · Sau khi tất cả bộ phận duyệt, giá mới được áp dụng vào loại phòng và biểu giá BAR.</p>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><div><p className="font-display text-lg text-ink">Yêu cầu gần đây</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Lịch sử đề xuất và chữ ký</p></div><Badge tone="outline">{requests.data?.length ?? 0}</Badge></div>
        <div className="max-h-[620px] space-y-2 overflow-y-auto p-3">
          {(requests.data ?? []).map((request) => <div key={request.id} className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-medium text-ink">{request.roomType.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{formatMoney(Number(request.currentRate))} → <span className="font-medium text-brand">{formatMoney(Number(request.proposedRate))}</span> · từ {request.effectiveFrom.slice(0, 10)}</p></div><Badge tone={STATUS[request.status]?.tone ?? 'outline'}>{STATUS[request.status]?.label ?? request.status}</Badge></div>
            <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{request.reason}</p>
            <div className="mt-2 flex flex-wrap gap-1">{request.approvals.map((approval) => <button key={approval.id} type="button" disabled={request.status !== 'PENDING' || approval.status !== 'PENDING'} onClick={() => { setTarget({ request, approval }); setSignature(user?.fullName ?? ''); }} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 text-[10px] text-muted-foreground disabled:cursor-default"><span className={approval.status === 'APPROVED' ? 'text-forest' : approval.status === 'REJECTED' ? 'text-danger' : 'text-warning'}>{approval.status === 'APPROVED' ? <Check className="size-3" /> : approval.status === 'REJECTED' ? <X className="size-3" /> : <FileSignature className="size-3" />}</span>{approval.departmentName}{approval.approverName ? ` · ${approval.approverName}` : ''}</button>)}</div>
          </div>)}
          {requests.data?.length === 0 ? <p className="p-8 text-center text-xs text-muted-foreground">Chưa có yêu cầu duyệt giá.</p> : null}
        </div>
      </CardContent></Card>
    </div>

    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) setTarget(null); }}><DialogContent>
      <DialogHeader><DialogTitle>Ký duyệt giá phòng</DialogTitle><DialogDescription>{target?.approval.departmentName} · {target?.request.roomType.name} · {target ? formatMoney(Number(target.request.proposedRate)) : ''}</DialogDescription></DialogHeader>
      <div className="space-y-3"><div><Label htmlFor="signature">Chữ ký / họ tên</Label><Input id="signature" value={signature} onChange={(event) => setSignature(event.target.value)} /></div><div><Label htmlFor="comment">Ý kiến duyệt</Label><Textarea id="comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Đồng ý / cần điều chỉnh…" /></div><div className="flex gap-2"><Button className="flex-1" disabled={!signature.trim() || decide.isPending} onClick={() => decide.mutate({ action: 'approve' })}><Check className="size-4" /> Ký duyệt</Button><Button variant="secondary" className="flex-1" disabled={!signature.trim() || decide.isPending} onClick={() => decide.mutate({ action: 'reject' })}><X className="size-4" /> Từ chối</Button></div></div>
    </DialogContent></Dialog>
  </div>;
}
