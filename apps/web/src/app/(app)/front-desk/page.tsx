'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  BedDouble,
  CalendarCheck,
  CreditCard,
  LogIn,
  LogOut,
  Plus,
  ReceiptText,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { FolioDetail, FrontDeskBoard, ReservationDetail, ReservationSummary } from '@/lib/ops-types';
import { ApiError, api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { useI18n } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError, Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookingDialog } from '@/components/domain/booking-dialog';
import { PermissionNotice } from '@/components/domain/permission-notice';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: 'Đã xác nhận',
  PENDING: 'Chờ xác nhận',
  IN_HOUSE: 'Đang lưu trú',
  CHECKED_OUT: 'Đã trả phòng',
  CANCELLED: 'Đã huỷ',
  NO_SHOW: 'Không đến',
};

export default function FrontDeskPage() {
  const { can } = useAccess();
  const { activeProperty, properties } = useActiveProperty();
  const { formatDate } = useI18n();
  const queryClient = useQueryClient();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const propertyId =
    activeProperty?.id ?? properties.find((property) => property.type === 'HOTEL')?.id ?? properties[0]?.id;

  const board = useQuery<FrontDeskBoard>({
    queryKey: ['front-desk', propertyId],
    queryFn: () => api<FrontDeskBoard>(`/front-office/board?propertyId=${propertyId}`),
    enabled: Boolean(propertyId) && can('reservation:view'),
    refetchInterval: 60_000,
  });

  if (!can('reservation:view')) return <PermissionNotice />;
  const data = board.data;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Vận hành · Lễ tân"
        title="Bàn lễ tân"
        description={`${activeProperty?.name ?? 'Toàn hệ thống'} · Ngày nghiệp vụ ${data ? formatDate(data.businessDate) : '—'}`}
        actions={
          <Button size="sm" onClick={() => setBookingOpen(true)} disabled={!propertyId || !can('reservation:create')}>
            <Plus /> Đặt phòng
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={LogIn} label="Khách đến hôm nay" value={data?.counts.arrivals ?? 0} tone="brand" />
        <Stat icon={Users} label="Đang lưu trú" value={data?.counts.inHouse ?? 0} tone="success" />
        <Stat icon={LogOut} label="Dự kiến trả phòng" value={data?.counts.departures ?? 0} tone="warning" />
        <Stat icon={BedDouble} label="Phòng sẵn sàng" value={data?.counts.availableRooms ?? 0} tone="neutral" />
        <Stat icon={CalendarCheck} label="Phòng cần dọn" value={data?.counts.dirtyRooms ?? 0} tone="danger" />
      </div>

      <Card>
        <CardContent className="p-4">
          {board.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}
            </div>
          ) : (
            <Tabs defaultValue="arrivals">
              <TabsList>
                <TabsTrigger value="arrivals">Đến hôm nay ({data?.arrivals.length ?? 0})</TabsTrigger>
                <TabsTrigger value="inHouse">Đang lưu trú ({data?.inHouse.length ?? 0})</TabsTrigger>
                <TabsTrigger value="departures">Trả phòng ({data?.departures.length ?? 0})</TabsTrigger>
              </TabsList>
              {(['arrivals', 'inHouse', 'departures'] as const).map((tab) => (
                <TabsContent key={tab} value={tab}>
                  <ReservationTable
                    rows={data?.[tab] ?? []}
                    onOpen={setSelectedId}
                    empty={
                      tab === 'arrivals'
                        ? 'Không còn khách chờ nhận phòng.'
                        : tab === 'inHouse'
                          ? 'Chưa có khách lưu trú.'
                          : 'Hôm nay không có khách trả phòng.'
                    }
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      {propertyId ? (
        <BookingDialog
          propertyId={propertyId}
          open={bookingOpen}
          onOpenChange={setBookingOpen}
          onCreated={(reservation) => setSelectedId(reservation.id)}
        />
      ) : null}

      <ReservationDetailDialog
        id={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={async () => {
          await queryClient.invalidateQueries({ queryKey: ['front-desk'] });
          await queryClient.invalidateQueries({ queryKey: ['reservation-detail', selectedId] });
          await queryClient.invalidateQueries({ queryKey: ['folio'] });
        }}
      />
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof LogIn; label: string; value: number; tone: string }) {
  const colors: Record<string, string> = {
    brand: 'bg-brand-soft text-brand',
    success: 'bg-forest-soft text-forest',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    neutral: 'bg-muted text-muted-foreground',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="label-xs">{label}</span>
        <span className={cn('flex size-7 items-center justify-center rounded-full', colors[tone])}><Icon className="size-3.5" /></span>
      </div>
      <p className="mt-2 font-display text-3xl text-ink">{value}</p>
    </Card>
  );
}

function ReservationTable({ rows, onOpen, empty }: { rows: ReservationSummary[]; onOpen: (id: string) => void; empty: string }) {
  if (rows.length === 0) return <p className="py-10 text-center text-xs text-muted-foreground">{empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Khách</TableHead>
          <TableHead>Mã</TableHead>
          <TableHead>Phòng</TableHead>
          <TableHead className="hidden md:table-cell">Lưu trú</TableHead>
          <TableHead className="hidden lg:table-cell">Kênh</TableHead>
          <TableHead className="text-right">Số dư</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((reservation) => (
          <TableRow key={reservation.id} className="cursor-pointer" onClick={() => onOpen(reservation.id)}>
            <TableCell>
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft font-display text-xs text-brand">
                  {reservation.guest.fullName.slice(0, 1)}
                </span>
                <div>
                  <p className="text-xs font-medium text-ink">{reservation.guest.fullName}</p>
                  <p className="text-[9px] text-muted-foreground">{reservation.guest.phone ?? reservation.guest.email ?? '—'}</p>
                </div>
                {reservation.guest.vipLevel > 0 ? <Badge tone="brand">VIP {reservation.guest.vipLevel}</Badge> : null}
              </div>
            </TableCell>
            <TableCell className="font-mono text-[10px]">{reservation.code}</TableCell>
            <TableCell className="text-[11px]">
              {reservation.rooms.map((room) => room.roomNumber).filter(Boolean).join(', ') || '—'}
            </TableCell>
            <TableCell className="hidden text-[10px] text-muted-foreground md:table-cell">
              {reservation.checkIn} → {reservation.checkOut} · {reservation.nights} đêm
            </TableCell>
            <TableCell className="hidden lg:table-cell"><Badge tone="outline">{reservation.channel?.code ?? 'DIRECT'}</Badge></TableCell>
            <TableCell className="text-right">
              <p className="tabular text-xs">{formatMoney(reservation.balance)}</p>
              <StatusBadge status={reservation.status} />
            </TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); onOpen(reservation.id); }}>
                Chi tiết <ArrowRightLeft className="size-3" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'IN_HOUSE' ? 'success' : status === 'CONFIRMED' ? 'brand' : status === 'CANCELLED' ? 'danger' : 'neutral';
  return <Badge tone={tone}>{STATUS_LABEL[status] ?? status}</Badge>;
}

function ReservationDetailDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const { can } = useAccess();
  const [chargeOpen, setChargeOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [initialAmount, setInitialAmount] = useState<number | null>(null);

  const reservation = useQuery<ReservationDetail>({
    queryKey: ['reservation-detail', id],
    queryFn: () => api<ReservationDetail>(`/reservations/${id}`),
    enabled: Boolean(id),
  });
  const folioId = reservation.data?.folios[0]?.id ?? null;
  const folio = useQuery<FolioDetail>({
    queryKey: ['folio', folioId],
    queryFn: () => api<FolioDetail>(`/folios/${folioId}`),
    enabled: Boolean(folioId),
  });

  const action = useMutation({
    mutationFn: async (kind: 'check-in' | 'check-out') => {
      const response = await api<ReservationDetail & { checkoutBalance?: number }>(`/reservations/${id}/${kind}`, {
        method: 'POST',
        body: {},
      });
      return { kind, response };
    },
    onSuccess: async ({ kind, response }) => {
      toast.success(kind === 'check-in' ? 'Đã nhận phòng' : 'Đã trả phòng');
      await onChanged();
      if (kind === 'check-out' && response.checkoutBalance) {
        setInitialAmount(response.checkoutBalance);
        setPaymentOpen(true);
      }
    },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Thao tác thất bại'),
  });

  const invoice = useMutation({
    mutationFn: () => api<{ id: string; number: string }>(`/invoices/folio/${folioId}`, { method: 'POST', body: {} }),
    onSuccess: (created) => {
      toast.success(`Đã xuất hoá đơn ${created.number}`);
      window.open(`/api/v1/invoices/${created.id}/print`, '_blank');
      void onChanged();
    },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không xuất được hoá đơn'),
  });

  const detail = reservation.data;
  const balance = folio.data?.balance ?? detail?.totals.balance ?? 0;

  return (
    <Dialog open={Boolean(id)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            {detail?.guest.fullName ?? 'Đặt phòng'}
            {detail ? <StatusBadge status={detail.status} /> : null}
          </DialogTitle>
          <DialogDescription>
            {detail?.code} · {detail?.checkIn} → {detail?.checkOut} · {detail?.nights} đêm ·{' '}
            {detail?.rooms.map((room) => room.roomNumber).filter(Boolean).join(', ')}
          </DialogDescription>
        </DialogHeader>

        {reservation.isLoading || !detail ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-line p-3">
                <p className="label-xs">Tổng tiền</p>
                <p className="mt-1 font-display text-2xl text-ink">{formatMoney(detail.totals.total)}</p>
                <p className="text-[10px] text-muted-foreground">Đã thu {formatMoney(detail.totals.paid)}</p>
              </div>
              <div className="rounded-xl border border-line p-3">
                <p className="label-xs">Còn lại</p>
                <p className={cn('mt-1 font-display text-2xl', balance > 0 ? 'text-danger' : 'text-forest')}>{formatMoney(balance)}</p>
                <p className="text-[10px] text-muted-foreground">{detail.channel?.name ?? 'Trực tiếp'} · {detail.guest.phone ?? detail.guest.email ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-line p-3">
                <p className="label-xs">Folio</p>
                <p className="mt-1 font-display text-lg text-ink">{detail.folios[0]?.number ?? '—'}</p>
                <p className="text-[10px] text-muted-foreground">{detail.folios[0]?.status ?? '—'} · {detail.rooms.length} phòng</p>
              </div>
            </div>

            <div className="max-h-[220px] overflow-y-auto rounded-xl border border-line">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Diễn giải</TableHead>
                    <TableHead className="hidden sm:table-cell">Ngày</TableHead>
                    <TableHead className="text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(folio.data?.items ?? []).map((item) => (
                    <TableRow key={item.id} className={item.isVoid ? 'opacity-40 line-through' : ''}>
                      <TableCell className="text-[11px]">
                        {item.description}
                        <span className="ml-1 text-[9px] uppercase text-muted-foreground">{item.department}</span>
                      </TableCell>
                      <TableCell className="hidden text-[10px] text-muted-foreground sm:table-cell">{item.businessDate}</TableCell>
                      <TableCell className="tabular text-right text-[11px]">{formatMoney(item.total)}</TableCell>
                    </TableRow>
                  ))}
                  {(folio.data?.items ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="py-6 text-center text-[11px] text-muted-foreground">Chưa có khoản phí nào.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              {['CONFIRMED', 'PENDING'].includes(detail.status) ? (
                <Button size="sm" loading={action.isPending} disabled={!can('reservation:update')} onClick={() => action.mutate('check-in')}>
                  <LogIn /> Nhận phòng
                </Button>
              ) : null}
              {detail.status === 'IN_HOUSE' ? (
                <Button size="sm" variant="secondary" loading={action.isPending} disabled={!can('reservation:update')} onClick={() => action.mutate('check-out')}>
                  <LogOut /> Trả phòng
                </Button>
              ) : null}
              {folioId ? (
                <>
                  <Button size="sm" variant="secondary" disabled={!can('folio:post') || detail.status === 'CANCELLED'} onClick={() => setChargeOpen(true)}>
                    <Plus /> Thêm phí
                  </Button>
                  <Button size="sm" disabled={!can('folio:settle') || balance <= 0} onClick={() => { setInitialAmount(balance); setPaymentOpen(true); }}>
                    <CreditCard /> Thanh toán
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!can('invoice:issue') || balance > 0 || invoice.isPending} onClick={() => invoice.mutate()}>
                    <ReceiptText /> Xuất hoá đơn
                  </Button>
                </>
              ) : null}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>Đóng</Button>
            </div>
          </div>
        )}

        {folioId ? (
          <>
            <ChargeDialog folioId={folioId} open={chargeOpen} onOpenChange={setChargeOpen} onDone={onChanged} />
            <PaymentDialog folioId={folioId} open={paymentOpen} initialAmount={initialAmount} onOpenChange={setPaymentOpen} onDone={onChanged} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ChargeDialog({ folioId, open, onOpenChange, onDone }: { folioId: string; open: boolean; onOpenChange: (open: boolean) => void; onDone: () => Promise<void> }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [department, setDepartment] = useState('FNB');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      api(`/folios/${folioId}/charges`, {
        method: 'POST',
        body: {
          type: department === 'FNB' ? 'FNB_CHARGE' : department === 'ROOMS' ? 'ROOM_CHARGE' : 'OTHER_CHARGE',
          description,
          quantity: 1,
          unitPrice: Number(amount),
          department,
          taxRateCode: 'VAT8',
        },
      }),
    onSuccess: async () => {
      toast.success('Đã ghi phí vào folio');
      setDescription('');
      setAmount('');
      onOpenChange(false);
      await onDone();
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Không ghi được phí'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Thêm phí vào folio</DialogTitle><DialogDescription>Phí được hạch toán ngay vào sổ doanh thu.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="charge-desc">Diễn giải</Label><Input id="charge-desc" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Giặt ủi, minibar, dịch vụ…" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="charge-amount">Số tiền (chưa thuế)</Label><Input id="charge-amount" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
            <div><Label htmlFor="charge-dept">Bộ phận</Label>
              <NativeSelect id="charge-dept" value={department} onChange={(event) => setDepartment(event.target.value)}>
                <option value="FNB">Nhà hàng</option><option value="ROOMS">Phòng</option><option value="SPA">Spa</option><option value="OTHER_OPERATED">Khác</option>
              </NativeSelect>
            </div>
          </div>
          <FieldError>{error ?? undefined}</FieldError>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button size="sm" loading={mutation.isPending} onClick={() => { if (!description || !Number(amount)) return setError('Nhập diễn giải và số tiền'); setError(null); mutation.mutate(); }}>Ghi phí</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ folioId, open, initialAmount, onOpenChange, onDone }: { folioId: string; open: boolean; initialAmount: number | null; onOpenChange: (open: boolean) => void; onDone: () => Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const effectiveAmount = amount || (initialAmount ? String(initialAmount) : '');
  const mutation = useMutation({
    mutationFn: () =>
      api(`/folios/${folioId}/payments`, {
        method: 'POST',
        body: { amount: Number(effectiveAmount), method, ...(reference ? { reference } : {}) },
      }),
    onSuccess: async () => {
      toast.success('Đã ghi nhận thanh toán');
      setAmount('');
      setReference('');
      onOpenChange(false);
      await onDone();
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Thanh toán thất bại'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Thanh toán folio</DialogTitle><DialogDescription>Ghi nhận tiền mặt, thẻ hoặc chuyển khoản và cập nhật sổ quỹ.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="pay-amount">Số tiền</Label><Input id="pay-amount" type="number" value={effectiveAmount} onChange={(event) => setAmount(event.target.value)} /></div>
          <div><Label htmlFor="pay-method">Phương thức</Label>
            <NativeSelect id="pay-method" value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="CASH">Tiền mặt</option><option value="CARD">Thẻ</option><option value="BANK_TRANSFER">Chuyển khoản</option>
              <option value="VIETQR">VietQR</option><option value="VNPAY">VNPay</option><option value="MOMO">MoMo</option><option value="ZALO_PAY">ZaloPay</option><option value="COMPANY_AR">Công nợ công ty</option>
            </NativeSelect>
          </div>
          <div><Label htmlFor="pay-ref">Mã tham chiếu</Label><Input id="pay-ref" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Số uỷ nhiệm chi / mã giao dịch" /></div>
          <FieldError>{error ?? undefined}</FieldError>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button size="sm" loading={mutation.isPending} onClick={() => { if (!Number(effectiveAmount)) return setError('Nhập số tiền'); setError(null); mutation.mutate(); }}>Xác nhận thu</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
