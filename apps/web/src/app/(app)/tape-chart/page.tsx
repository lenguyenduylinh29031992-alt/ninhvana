'use client';
import { localDate } from '@/lib/dates';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionNotice } from '@/components/domain/permission-notice';
import { cn } from '@/lib/utils';

interface TapeBooking {
  id: string;
  reservationId: string;
  code: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guest: string;
  vipLevel: number;
  channel: string;
  nights: number;
  total: number;
}

interface TapeRoom {
  id: string;
  number: string;
  floor: string | null;
  status: string;
  roomType: { id: string; name: string; code: string };
  bookings: TapeBooking[];
}

interface TapeChart {
  propertyId: string;
  from: string;
  to: string;
  rooms: TapeRoom[];
}

function iso(date: Date): string {
  return localDate(date);
}
function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export default function TapeChartPage() {
  const { can } = useAccess();
  const { activeProperty, properties } = useActiveProperty();
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState(() => new Date());
  const [dragging, setDragging] = useState<TapeBooking | null>(null);
  const propertyId =
    activeProperty?.id ?? properties.find((property) => property.type === 'HOTEL')?.id ?? properties[0]?.id;

  const dates = useMemo(() => Array.from({ length: 14 }).map((_, index) => iso(addDays(anchor, index))), [anchor]);
  const from = dates[0]!;
  const to = iso(addDays(anchor, 14));

  const chart = useQuery<TapeChart>({
    queryKey: ['tape-chart', propertyId, from],
    queryFn: () => api<TapeChart>(`/rooms/tape-chart?propertyId=${propertyId}&from=${from}&to=${to}`),
    enabled: Boolean(propertyId) && can('room:view'),
  });

  const move = useMutation({
    mutationFn: ({ booking, roomId }: { booking: TapeBooking; roomId: string }) =>
      api(`/reservations/rooms/${booking.id}/move`, {
        method: 'PATCH',
        body: { roomId, checkIn: booking.checkIn, checkOut: booking.checkOut },
      }),
    onSuccess: async () => {
      toast.success('Đã đổi phòng');
      await queryClient.invalidateQueries({ queryKey: ['tape-chart'] });
    },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không đổi được phòng'),
  });

  if (!can('room:view')) return <PermissionNotice />;

  const rooms = chart.data?.rooms ?? [];
  const occupancy = dates.map((date) => {
    const occupied = rooms.filter((room) => room.bookings.some((booking) => booking.checkIn <= date && booking.checkOut > date)).length;
    return { date, occupied, total: rooms.length, pct: rooms.length ? Math.round((occupied / rooms.length) * 100) : 0 };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Vận hành · Sơ đồ phòng"
        title="Sơ đồ phòng"
        description="Kéo thanh đặt phòng sang phòng khác để đổi phòng. Màu thể hiện trạng thái lưu trú."
        actions={
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="secondary" onClick={() => setAnchor(addDays(anchor, -7))}><ChevronLeft /></Button>
            <Badge tone="outline">{from} → {iso(addDays(anchor, 13))}</Badge>
            <Button size="icon-sm" variant="secondary" onClick={() => setAnchor(addDays(anchor, 7))}><ChevronRight /></Button>
          </div>
        }
      />

      {chart.isLoading ? <Skeleton className="h-96 w-full" /> : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[120px_repeat(14,minmax(0,1fr))] border-b border-line bg-muted/40">
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-label text-muted-foreground">Phòng</div>
                {dates.map((date) => (
                  <div key={date} className="border-l border-line px-1 py-2 text-center">
                    <p className="text-[10px] font-medium text-ink">{date.slice(8)}/{date.slice(5, 7)}</p>
                    <p className="text-[9px] text-muted-foreground">{['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(`${date}T00:00:00Z`).getUTCDay()]}</p>
                  </div>
                ))}
              </div>
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="grid grid-cols-[120px_repeat(14,minmax(0,1fr))] border-b border-line/70 last:border-b-0"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragging) move.mutate({ booking: dragging, roomId: room.id });
                    setDragging(null);
                  }}
                >
                  <div className="flex flex-col justify-center px-3 py-2">
                    <span className="text-xs font-medium text-ink">{room.number}</span>
                    <span className="text-[9px] text-muted-foreground">{room.roomType.code} · {room.status}</span>
                  </div>
                  <div className="relative border-l border-line" style={{ height: 48, gridColumn: '2 / span 14' }}>
                    <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}>
                      {dates.map((date) => (
                        <div key={date} className={cn('border-r border-line/50', date === iso(new Date()) && 'bg-brand-soft/40')} />
                      ))}
                    </div>
                    {room.bookings.map((booking) => {
                      const start = dates.findIndex((date) => date >= booking.checkIn);
                      const end = dates.findIndex((date) => date >= booking.checkOut);
                      const startIndex = start === -1 ? 0 : start;
                      const endIndex = end === -1 ? dates.length : end;
                      const span = endIndex - startIndex;
                      if (span <= 0) return null;
                      return (
                        <button
                          key={booking.id}
                          type="button"
                          draggable
                          onDragStart={() => setDragging(booking)}
                          onDragEnd={() => setDragging(null)}
                          title={`${booking.guest} · ${booking.code} · ${booking.checkIn} → ${booking.checkOut}`}
                          className={cn(
                            'absolute bottom-1 top-1 z-10 flex items-center gap-1 overflow-hidden rounded-md px-1.5 text-left text-[9px] text-white shadow-sm',
                            booking.status === 'IN_HOUSE' ? 'bg-forest' : booking.status === 'CONFIRMED' ? 'bg-brand' : 'bg-ink',
                          )}
                          style={{
                            left: `calc(${(startIndex / dates.length) * 100}% + 1px)`,
                            width: `calc(${(span / dates.length) * 100}% - 2px)`,
                          }}
                        >
                          <GripVertical className="size-2.5 shrink-0 opacity-60" />
                          <span className="truncate font-medium">{booking.guest}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-wrap gap-4 p-3">
          {occupancy.map((day) => (
            <div key={day.date} className="flex items-center gap-2 text-[10px]">
              <span className="text-muted-foreground">{day.date.slice(5)}</span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full', day.pct > 80 ? 'bg-danger' : day.pct > 60 ? 'bg-warning' : 'bg-forest')} style={{ width: `${day.pct}%` }} />
              </div>
              <span className="tabular">{day.pct}%</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
