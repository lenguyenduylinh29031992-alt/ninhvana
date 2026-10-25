'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { ReservationDetail, ReservationSummary } from '@/lib/ops-types';
import { ApiError, api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExportMenu } from '@/components/domain/export-menu';
import { PageHeader } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BookingDialog } from '@/components/domain/booking-dialog';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface ListResponse { items: ReservationSummary[]; total: number; page: number; totalPages: number }

const STATUSES = [
  ['', 'Tất cả trạng thái'], ['CONFIRMED', 'Đã xác nhận'], ['IN_HOUSE', 'Đang lưu trú'], ['CHECKED_OUT', 'Đã trả phòng'], ['CANCELLED', 'Đã huỷ'], ['NO_SHOW', 'Không đến'],
] as const;

export default function ReservationsPage() {
  const { can } = useAccess();
  const { activeProperty, properties } = useActiveProperty();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ReservationSummary | null>(null);
  const propertyId = activeProperty?.id ?? properties.find((property) => property.type === 'HOTEL')?.id ?? properties[0]?.id;

  const list = useQuery<ListResponse>({
    queryKey: ['reservations', propertyId, q, status, page],
    queryFn: () => {
      const params = new URLSearchParams({ propertyId: propertyId ?? '', q, page: String(page), pageSize: '20' });
      if (status) params.set('status', status);
      return api<ListResponse>(`/reservations?${params.toString()}`);
    },
    enabled: Boolean(propertyId) && can('reservation:view'),
  });

  if (!can('reservation:view')) return <PermissionNotice />;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Vận hành · Đặt phòng"
        title="Danh sách đặt phòng"
        description="Tìm theo mã, tên khách, email hoặc số điện thoại."
        actions={<div className="flex items-center gap-2"><ExportMenu dataset="reservations" label="Xuất" /><Button size="sm" onClick={() => setBookingOpen(true)} disabled={!propertyId || !can('reservation:create')}><Plus /> Đặt phòng</Button></div>}
      />

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Mã đặt phòng, tên khách…" className="pl-8" />
            </div>
            <NativeSelect value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="w-[200px]">
              {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect>
          </div>

          {list.isLoading ? <Skeleton className="h-64 w-full" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Mã</TableHead><TableHead>Khách</TableHead><TableHead className="hidden md:table-cell">Lưu trú</TableHead><TableHead className="hidden lg:table-cell">Kênh</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Tổng</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {(list.data?.items ?? []).map((reservation) => (
                  <TableRow key={reservation.id} className="cursor-pointer" onClick={() => setDetailId(reservation.id)}>
                    <TableCell className="font-mono text-[10px]">{reservation.code}</TableCell>
                    <TableCell className="text-[11px]">{reservation.guest.fullName}<span className="block text-[9px] text-muted-foreground">{reservation.guest.phone ?? reservation.guest.email ?? '—'}</span></TableCell>
                    <TableCell className="hidden text-[10px] text-muted-foreground md:table-cell">{reservation.checkIn} → {reservation.checkOut} · {reservation.nights} đêm</TableCell>
                    <TableCell className="hidden lg:table-cell"><Badge tone="outline">{reservation.channel?.code ?? 'DIRECT'}</Badge></TableCell>
                    <TableCell><Badge tone={reservation.status === 'IN_HOUSE' ? 'success' : reservation.status === 'CONFIRMED' ? 'brand' : reservation.status === 'CANCELLED' ? 'danger' : 'neutral'}>{reservation.status}</Badge></TableCell>
                    <TableCell className="tabular text-right text-[11px]">{formatMoney(reservation.totalAmount)}</TableCell>
                    <TableCell className="text-right">
                      {['CONFIRMED', 'PENDING'].includes(reservation.status) && can('reservation:cancel') ? (
                        <Button size="icon-sm" variant="ghost" onClick={(event) => { event.stopPropagation(); setCancelTarget(reservation); }}><XCircle /></Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">{list.data?.total ?? 0} đặt phòng</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</Button>
              <Button size="sm" variant="secondary" disabled={page >= (list.data?.totalPages ?? 1)} onClick={() => setPage(page + 1)}>Sau</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {propertyId ? <BookingDialog propertyId={propertyId} open={bookingOpen} onOpenChange={setBookingOpen} onCreated={() => { void queryClient.invalidateQueries({ queryKey: ['reservations'] }); }} /> : null}
      <ReservationDetail id={detailId} onClose={() => setDetailId(null)} />
      <CancelDialog target={cancelTarget} onClose={() => setCancelTarget(null)} onDone={async () => { await queryClient.invalidateQueries({ queryKey: ['reservations'] }); await queryClient.invalidateQueries({ queryKey: ['front-desk'] }); }} />
    </div>
  );
}

function ReservationDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useQuery<ReservationDetail>({
    queryKey: ['reservation-detail', id],
    queryFn: () => api<ReservationDetail>(`/reservations/${id}`),
    enabled: Boolean(id),
  });
  const data = detail.data;
  return (
    <Dialog open={Boolean(id)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{data?.guest.fullName ?? 'Đặt phòng'}</DialogTitle><DialogDescription>{data?.code} · {data?.checkIn} → {data?.checkOut}</DialogDescription></DialogHeader>
        {data ? (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-line p-3"><p className="label-xs">Tổng tiền</p><p className="mt-1 font-display text-xl">{formatMoney(data.totals.total)}</p></div>
              <div className="rounded-lg border border-line p-3"><p className="label-xs">Số dư</p><p className="mt-1 font-display text-xl">{formatMoney(data.totals.balance)}</p></div>
            </div>
            <p className="text-muted-foreground">{data.rooms.length} phòng · {data.nights} đêm · {data.adults} người lớn</p>
            <div className="space-y-1">
              {data.rooms.map((room) => <div key={room.id} className="flex justify-between border-b border-line/60 py-1"><span>{room.roomNumber} · {room.roomType.name}</span><span className="tabular">{formatMoney(room.totalAmount)}</span></div>)}
            </div>
            {data.specialRequests ? <p className="rounded-lg bg-muted/60 p-2 text-[11px]">Yêu cầu: {data.specialRequests}</p> : null}
          </div>
        ) : <Skeleton className="h-40 w-full" />}
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ target, onClose, onDone }: { target: ReservationSummary | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => api(`/reservations/${target?.id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: async () => { toast.success('Đã huỷ đặt phòng'); onClose(); await onDone(); },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Không huỷ được'),
  });
  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Huỷ {target?.code}</DialogTitle><DialogDescription>Thao tác được ghi vào nhật ký kiểm toán.</DialogDescription></DialogHeader>
        <Label htmlFor="cancel-reason">Lý do</Label>
        <Textarea id="cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Khách đổi kế hoạch…" />
        <FieldError>{error ?? undefined}</FieldError>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Giữ lại</Button>
          <Button size="sm" variant="danger" loading={mutation.isPending} onClick={() => { if (reason.trim().length < 5) return setError('Nhập lý do tối thiểu 5 ký tự'); setError(null); mutation.mutate(); }}>Huỷ đặt phòng</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
