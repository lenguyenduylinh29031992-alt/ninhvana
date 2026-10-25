'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BedDouble, ChefHat, CreditCard, Plus, Send, ShoppingBag, Trash2, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import type { FrontDeskBoard, PosMenuCategory, PosOrder, PosOutlet } from '@/lib/ops-types';
import { ApiError, api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError, Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionNotice } from '@/components/domain/permission-notice';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function PosPage() {
  const { can } = useAccess();
  const { activeProperty, properties } = useActiveProperty();
  const queryClient = useQueryClient();
  const [outletId, setOutletId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);

  const propertyId =
    activeProperty?.id ?? properties.find((property) => property.type === 'HOTEL')?.id ?? properties[0]?.id;

  const outlets = useQuery<PosOutlet[]>({
    queryKey: ['pos-outlets', propertyId],
    queryFn: () => api<PosOutlet[]>(`/pos/outlets?propertyId=${propertyId}`),
    enabled: Boolean(propertyId) && can('pos:view'),
    refetchInterval: 20_000,
  });

  useEffect(() => {
    if (!outletId && outlets.data?.length) {
      setOutletId(outlets.data.find((outlet) => ['RESTAURANT', 'BAR'].includes(outlet.type))?.id ?? outlets.data[0]!.id);
    }
  }, [outletId, outlets.data]);

  const menu = useQuery<PosMenuCategory[]>({
    queryKey: ['pos-menu', outletId],
    queryFn: () => api<PosMenuCategory[]>(`/pos/menu?outletId=${outletId}`),
    enabled: Boolean(outletId),
  });

  const order = useQuery<PosOrder>({
    queryKey: ['pos-order', orderId],
    queryFn: () => api<PosOrder>(`/pos/orders/${orderId}`),
    enabled: Boolean(orderId),
    refetchInterval: 10_000,
  });

  const board = useQuery<FrontDeskBoard>({
    queryKey: ['front-desk', propertyId],
    queryFn: () => api<FrontDeskBoard>(`/front-office/board?propertyId=${propertyId}`),
    enabled: Boolean(propertyId) && can('reservation:view'),
  });

  const outlet = outlets.data?.find((item) => item.id === outletId) ?? null;

  const openOrder = useMutation({
    mutationFn: (tableId?: string) =>
      api<PosOrder>('/pos/orders', {
        method: 'POST',
        body: { outletId, type: tableId ? 'DINE_IN' : 'TAKEAWAY', ...(tableId ? { tableId } : {}) },
      }),
    onSuccess: (created) => {
      setOrderId(created.id);
      void queryClient.invalidateQueries({ queryKey: ['pos-outlets'] });
    },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không mở được order'),
  });

  const addItem = useMutation({
    mutationFn: (menuItemId: string) =>
      api<PosOrder>(`/pos/orders/${orderId}/items`, {
        method: 'POST',
        body: { items: [{ menuItemId, quantity: 1 }] },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pos-order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['pos-outlets'] });
    },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không thêm được món'),
  });

  const send = useMutation({
    mutationFn: () => api(`/pos/orders/${orderId}/send`, { method: 'POST' }),
    onSuccess: () => { toast.success('Đã gửi bếp/bar'); void queryClient.invalidateQueries({ queryKey: ['pos-order', orderId] }); },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không gửi được'),
  });

  const voidOrder = useMutation({
    mutationFn: () => api(`/pos/orders/${orderId}/void`, { method: 'POST', body: { reason: 'Huỷ tại quầy' } }),
    onSuccess: () => {
      toast.success('Đã huỷ order');
      setOrderId(null);
      void queryClient.invalidateQueries({ queryKey: ['pos-outlets'] });
    },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không huỷ được'),
  });

  const closeOrder = async () => {
    setOrderId(null);
    await queryClient.invalidateQueries({ queryKey: ['pos-outlets'] });
    await queryClient.invalidateQueries({ queryKey: ['pos-order'] });
  };

  if (!can('pos:view')) return <PermissionNotice />;
  const detail = order.data;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Vận hành · Nhà hàng"
        title="POS & sơ đồ bàn"
        description="Chọn bàn hoặc mở order mang đi, thêm món, gửi bếp và ghi nợ phòng."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="outline"><Utensils className="size-3" /> {outlet?.name ?? 'Chọn outlet'}</Badge>
            <Button asChild size="sm" variant="ghost"><Link href="/pos/kds"><ChefHat /> Màn hình bếp</Link></Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {(outlets.data ?? []).filter((item) => item.type !== 'BANQUET').map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={item.id === outletId ? 'primary' : 'secondary'}
            onClick={() => { setOutletId(item.id); setOrderId(null); }}
          >
            {item.name}
          </Button>
        ))}
        {outlet ? (
          <Button size="sm" variant="ghost" disabled={openOrder.isPending} onClick={() => openOrder.mutate(undefined)}>
            <ShoppingBag /> Order mang đi
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display text-lg text-ink">Sơ đồ bàn</p>
                <span className="text-[10px] text-muted-foreground">{outlet?.tables.length ?? 0} bàn</span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                {(outlet?.tables ?? []).map((table) => {
                  const open = outlet?.openOrders.find((item) => item.tableId === table.id);
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => {
                        if (open) setOrderId(open.id);
                        else openOrder.mutate(table.id);
                      }}
                      className={cn(
                        'flex min-h-16 flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition-colors',
                        open ? 'border-champagne bg-champagne-soft/70' : 'border-line bg-surface hover:border-champagne/50',
                      )}
                    >
                      <span className="font-display text-base text-ink">{table.name}</span>
                      <span className="text-[9px] text-muted-foreground">{table.seats} chỗ</span>
                      {open ? <span className="mt-1 text-[9px] font-medium text-champagne">{formatMoney(open.total)}</span> : null}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              {menu.isLoading ? <Skeleton className="h-52 w-full" /> : (
                <div className="space-y-4">
                  {(menu.data ?? []).map((category) => (
                    <div key={category.id}>
                      <p className="label-xs mb-2">{category.name}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {category.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            disabled={!orderId || addItem.isPending}
                            onClick={() => addItem.mutate(item.id)}
                            className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-champagne/50 disabled:opacity-40"
                          >
                            <div>
                              <p className="text-[11px] font-medium text-ink">{item.name}</p>
                              <p className="text-[9px] text-muted-foreground">{item.station === 'BAR' ? 'Bar' : 'Bếp'} · {item.price.toLocaleString('vi-VN')} ₫</p>
                            </div>
                            <Plus className="size-3.5 text-champagne" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!orderId ? <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-[10px] text-muted-foreground">Chọn bàn để bắt đầu order.</p> : null}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="font-display text-lg text-ink">{detail?.number ?? 'Chưa có order'}</p>
              {detail ? <Badge tone={detail.status === 'OPEN' ? 'champagne' : 'success'}>{detail.status}</Badge> : null}
            </div>
            {detail ? (
              <>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {detail.table ? `Bàn ${detail.table}` : 'Mang đi'} · {detail.items?.length ?? 0} món
                </p>
                <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto">
                  {(detail.items ?? []).map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-2 border-b border-line/60 pb-2">
                      <div>
                        <p className="text-[11px] text-ink">{item.name} <span className="text-muted-foreground">×{item.quantity}</span></p>
                        <p className="text-[9px] text-muted-foreground">{item.status}{item.sent ? ' · đã gửi' : ''}{item.notes ? ` · ${item.notes}` : ''}</p>
                      </div>
                      <p className="tabular text-[11px]">{formatMoney(item.total)}</p>
                    </div>
                  ))}
                  {(detail.items ?? []).length === 0 ? <p className="py-4 text-center text-[10px] text-muted-foreground">Chưa chọn món.</p> : null}
                </div>
                <div className="mt-3 space-y-1 border-t border-line pt-3 text-[11px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Tạm tính</span><span>{formatMoney(detail.subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Phí dịch vụ</span><span>{formatMoney(detail.serviceCharge)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span>{formatMoney(detail.taxAmount)}</span></div>
                  <div className="flex justify-between border-t border-line pt-2 font-medium"><span>Tổng cộng</span><span className="font-display text-lg">{formatMoney(detail.total)}</span></div>
                </div>
                <div className="mt-3 grid gap-2">
                  <Button size="sm" variant="secondary" loading={send.isPending} disabled={!can('pos:order') || (detail.items?.length ?? 0) === 0} onClick={() => send.mutate()}>
                    <Send /> Gửi bếp/bar
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" disabled={!can('pos:settle') || detail.total <= 0} onClick={() => setPayOpen(true)}><CreditCard /> Thanh toán</Button>
                    <Button size="sm" variant="secondary" disabled={!can('pos:settle') || detail.total <= 0} onClick={() => setChargeOpen(true)}><BedDouble /> Ghi nợ phòng</Button>
                  </div>
                  <Button size="sm" variant="ghost" disabled={!can('pos:void')} onClick={() => voidOrder.mutate()}><Trash2 /> Huỷ order</Button>
                </div>
              </>
            ) : (
              <p className="mt-6 text-center text-[11px] text-muted-foreground">Chọn bàn hoặc mở order mang đi để bắt đầu.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {detail ? (
        <>
          <PayDialog open={payOpen} onOpenChange={setPayOpen} order={detail} onDone={closeOrder} />
          <ChargeDialog
            open={chargeOpen}
            onOpenChange={setChargeOpen}
            order={detail}
            reservations={[...(board.data?.inHouse ?? [])]}
            onDone={closeOrder}
          />
        </>
      ) : null}
    </div>
  );
}

function PayDialog({ open, onOpenChange, order, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; order: PosOrder; onDone: () => Promise<void> }) {
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState(String(order.total));
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => api(`/pos/orders/${order.id}/pay`, { method: 'POST', body: { payments: [{ method, amount: Number(amount) }] } }),
    onSuccess: async () => { toast.success('Đã thanh toán order'); onOpenChange(false); await onDone(); },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Thanh toán thất bại'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Thanh toán {order.number}</DialogTitle><DialogDescription>Tổng cộng {formatMoney(order.total)}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="pos-amount">Số tiền</Label><Input id="pos-amount" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
          <div><Label htmlFor="pos-method">Phương thức</Label>
            <NativeSelect id="pos-method" value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="CASH">Tiền mặt</option><option value="CARD">Thẻ</option><option value="BANK_TRANSFER">Chuyển khoản</option><option value="VIETQR">VietQR</option><option value="MOMO">MoMo</option><option value="VNPAY">VNPay</option>
            </NativeSelect>
          </div>
          <FieldError>{error ?? undefined}</FieldError>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button size="sm" loading={mutation.isPending} onClick={() => { setError(null); mutation.mutate(); }}>Thu tiền</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChargeDialog({ open, onOpenChange, order, reservations, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; order: PosOrder; reservations: Array<{ id: string; code: string; guest: { fullName: string }; rooms: Array<{ roomNumber: string | null }> }>; onDone: () => Promise<void> }) {
  const [reservationId, setReservationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => api(`/pos/orders/${order.id}/charge-to-room`, { method: 'POST', body: { reservationId } }),
    onSuccess: async () => { toast.success('Đã ghi nợ vào folio phòng'); onOpenChange(false); await onDone(); },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Không ghi nợ được'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Ghi nợ phòng</DialogTitle><DialogDescription>{order.number} · {formatMoney(order.total)}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="charge-res">Khách đang lưu trú</Label>
            <NativeSelect id="charge-res" value={reservationId} onChange={(event) => setReservationId(event.target.value)}>
              <option value="">Chọn đặt phòng</option>
              {reservations.map((reservation) => (
                <option key={reservation.id} value={reservation.id}>{reservation.rooms.map((room) => room.roomNumber).join(', ')} · {reservation.guest.fullName} ({reservation.code})</option>
              ))}
            </NativeSelect>
          </div>
          <FieldError>{error ?? undefined}</FieldError>
          {reservations.length === 0 ? <p className="text-[10px] text-muted-foreground">Không có khách đang lưu trú để ghi nợ.</p> : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button size="sm" loading={mutation.isPending} disabled={!reservationId} onClick={() => { setError(null); mutation.mutate(); }}>Ghi nợ</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
