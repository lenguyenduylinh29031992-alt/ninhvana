'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BedDouble, CalendarDays, Check, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { AvailabilityRoom } from '@/lib/ops-types';
import { ApiError, api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError, Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const CHANNELS = [
  ['DIRECT', 'Website trực tiếp'],
  ['WALK_IN', 'Khách đến trực tiếp'],
  ['PHONE', 'Điện thoại'],
  ['BOOKING_COM', 'Booking.com'],
  ['AGODA', 'Agoda'],
  ['EXPEDIA', 'Expedia'],
  ['AIRBNB', 'Airbnb'],
  ['TRAVELOKA', 'Traveloka'],
  ['TRIP_COM', 'Trip.com'],
  ['ZALO', 'Zalo OA'],
  ['FACEBOOK', 'Facebook'],
  ['CORPORATE', 'Hợp đồng doanh nghiệp'],
] as const;

function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function BookingDialog({
  propertyId,
  open,
  onOpenChange,
  onCreated,
}: {
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (reservation: { id: string; code: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [checkIn, setCheckIn] = useState(today());
  const [checkOut, setCheckOut] = useState(addDays(today(), 2));
  const [channelCode, setChannelCode] = useState('DIRECT');
  const [adults, setAdults] = useState(2);
  const [selected, setSelected] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [requests, setRequests] = useState('');
  const [error, setError] = useState<string | null>(null);

  const availability = useQuery<AvailabilityRoom[]>({
    queryKey: ['availability', propertyId, checkIn, checkOut, adults],
    queryFn: () =>
      api<AvailabilityRoom[]>(
        `/reservations/availability?propertyId=${propertyId}&checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}`,
      ),
    enabled: open && Boolean(propertyId) && checkOut > checkIn,
  });

  const selectedRoom = availability.data?.find((room) => room.roomTypeId === selected) ?? null;

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; code: string }>('/reservations', {
        method: 'POST',
        body: {
          propertyId,
          checkIn,
          checkOut,
          channelCode,
          guest: {
            firstName,
            lastName,
            ...(email ? { email } : {}),
            ...(phone ? { phone } : {}),
          },
          rooms: [{ roomTypeId: selected, adults }],
          ...(requests ? { specialRequests: requests } : {}),
        },
      }),
    onSuccess: async (reservation) => {
      toast.success(`Đã tạo ${reservation.code}`);
      await queryClient.invalidateQueries({ queryKey: ['front-desk'] });
      await queryClient.invalidateQueries({ queryKey: ['reservations'] });
      onCreated?.(reservation);
      onOpenChange(false);
      setSelected(null);
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setRequests('');
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Không tạo được đặt phòng'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Đặt phòng mới</DialogTitle>
          <DialogDescription>Kiểm tra tồn phòng theo ngày và chọn hạng phòng trước khi lưu.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="checkIn">Nhận phòng</Label>
            <Input id="checkIn" type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="checkOut">Trả phòng</Label>
            <Input id="checkOut" type="date" value={checkOut} min={addDays(checkIn, 1)} onChange={(event) => setCheckOut(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="adults">Người lớn</Label>
            <NativeSelect id="adults" value={adults} onChange={(event) => setAdults(Number(event.target.value))}>
              {[1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="channel">Kênh</Label>
            <NativeSelect id="channel" value={channelCode} onChange={(event) => setChannelCode(event.target.value)}>
              {CHANNELS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
          {availability.isLoading ? (
            <div className="flex items-center gap-2 p-6 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Đang kiểm tra tồn phòng…</div>
          ) : availability.data?.length ? (
            availability.data.map((room) => (
              <button
                key={room.roomTypeId}
                type="button"
                disabled={room.available === 0}
                onClick={() => setSelected(room.roomTypeId)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                  selected === room.roomTypeId ? 'border-champagne bg-champagne-soft/60' : 'border-line hover:border-champagne/40',
                  room.available === 0 && 'cursor-not-allowed opacity-40',
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <BedDouble className="size-3.5 text-champagne" />
                    <span className="font-display text-lg text-ink">{room.name}</span>
                    <Badge tone={room.available > 3 ? 'success' : 'warning'}>{room.available} phòng</Badge>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {room.bedType ?? '—'} · {room.sizeSqm ?? '—'} m² · tối đa {room.maxOccupancy} khách
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular text-sm font-medium text-ink">{formatMoney(room.total)}</p>
                  <p className="text-[9px] text-muted-foreground">{formatMoney(room.averageNightly)}/đêm · đã gồm thuế & phí</p>
                </div>
                {selected === room.roomTypeId ? <Check className="size-4 text-champagne" /> : null}
              </button>
            ))
          ) : (
            <p className="p-4 text-xs text-muted-foreground">Không còn hạng phòng phù hợp cho khoảng ngày này.</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="lastName">Họ và tên đệm</Label>
            <Input id="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Nguyễn Văn" />
          </div>
          <div>
            <Label htmlFor="firstName">Tên</Label>
            <Input id="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="An" />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="an@example.com" />
          </div>
          <div>
            <Label htmlFor="phone">Điện thoại</Label>
            <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+84 …" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="requests">Yêu cầu đặc biệt</Label>
            <Input id="requests" value={requests} onChange={(event) => setRequests(event.target.value)} placeholder="Phòng tầng cao, giường phụ…" />
          </div>
        </div>

        <FieldError>{error ?? (create.error instanceof ApiError ? create.error.message : undefined)}</FieldError>

        <div className="flex items-center justify-between border-t border-line pt-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <CalendarDays className="size-3.5" />
            {selectedRoom ? `${selectedRoom.name} · ${checkIn} → ${checkOut}` : 'Chọn hạng phòng'}
            <Users className="ml-2 size-3.5" /> {adults} khách
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Huỷ</Button>
            <Button
              size="sm"
              loading={create.isPending}
              disabled={!selected || !firstName || !lastName || checkOut <= checkIn}
              onClick={() => {
                setError(null);
                create.mutate();
              }}
            >
              Xác nhận đặt phòng
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
