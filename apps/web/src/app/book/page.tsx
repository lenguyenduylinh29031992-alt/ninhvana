'use client';
import { localDate } from '@/lib/dates';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, BedDouble, CalendarDays, Check, MapPin, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FieldError, Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface PublicProperty {
  code: string;
  name: string;
  city: string;
  country: string;
  starRating: number;
  address: string;
  currency: string;
}

interface RoomOffer {
  roomTypeId: string;
  code: string;
  name: string;
  description: string | null;
  maxOccupancy: number;
  available: number;
  total: number;
  averageRate: number;
  nights: Array<{ date: string; rate: number; available: number }>;
}

interface Availability {
  property: { code: string; name: string; city: string; starRating: number; currency: string };
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: RoomOffer[];
}

interface Created {
  code: string;
  status: string;
  property: { name: string; city: string; address: string };
  roomType: string;
  checkIn: string;
  checkOut: string;
  guest: string;
  totals: { total: number; balance: number };
  payment: { mode: string; note: string };
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export default function BookingEnginePage() {
  const [propertyCode, setPropertyCode] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [adults, setAdults] = useState(2);
  const [submitted, setSubmitted] = useState(false);
  const [selected, setSelected] = useState<RoomOffer | null>(null);
  const [guest, setGuest] = useState({ firstName: '', lastName: '', email: '', phone: '', specialRequests: '' });
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  useEffect(() => {
    const today = localDate();
    setCheckIn(addDays(today, 7));
    setCheckOut(addDays(today, 9));
  }, []);

  const properties = useQuery<PublicProperty[]>({
    queryKey: ['public-properties'],
    queryFn: () => api<PublicProperty[]>('/public/booking/properties'),
  });

  useEffect(() => {
    if (!propertyCode && properties.data?.length) setPropertyCode(properties.data[0]!.code);
  }, [properties.data, propertyCode]);

  const availability = useQuery<Availability>({
    queryKey: ['public-availability', propertyCode, checkIn, checkOut, adults],
    queryFn: () => api<Availability>(`/public/booking/availability?propertyCode=${propertyCode}&checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}`),
    enabled: submitted && Boolean(propertyCode) && Boolean(checkIn) && Boolean(checkOut),
  });

  const create = useMutation({
    mutationFn: () =>
      api<Created>('/public/booking/reservations', {
        method: 'POST',
        body: {
          propertyCode,
          checkIn,
          checkOut,
          roomTypeId: selected?.roomTypeId,
          adults,
          children: 0,
          guest: {
            firstName: guest.firstName,
            lastName: guest.lastName,
            email: guest.email,
            phone: guest.phone,
          },
          ...(guest.specialRequests ? { specialRequests: guest.specialRequests } : {}),
        },
      }),
    onSuccess: (data) => {
      setCreated(data);
      setSelected(null);
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Không hoàn tất được đặt phòng'),
  });

  const property = properties.data?.find((item) => item.code === propertyCode);
  const nights = useMemo(() => (checkIn && checkOut ? Math.max(0, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000)) : 0), [checkIn, checkOut]);

  if (created) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
        <Card className="w-full max-w-xl p-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-forest-soft text-forest"><Check className="size-7" /></span>
          <p className="label-xs mt-4">Đặt phòng thành công</p>
          <h1 className="mt-1 font-display text-4xl text-ink">Hẹn gặp quý khách</h1>
          <p className="mt-2 text-xs text-muted-foreground">Mã đặt phòng <span className="font-mono text-ink">{created.code}</span> · {created.status}</p>
          <div className="mt-5 space-y-2 rounded-xl border border-line bg-surface p-4 text-left text-xs">
            <Row label="Khách sạn" value={`${created.property.name} · ${created.property.city}`} />
            <Row label="Hạng phòng" value={created.roomType} />
            <Row label="Lưu trú" value={`${created.checkIn} → ${created.checkOut}`} />
            <Row label="Khách" value={created.guest} />
            <Row label="Tổng tiền" value={formatMoney(created.totals.total)} strong />
            <Row label="Thanh toán" value={created.payment.note} />
          </div>
          <div className="mt-5 flex justify-center gap-2">
            <Button asChild variant="secondary"><Link href="/book">Đặt phòng khác</Link></Button>
            <Button asChild><Link href="/login">Đăng nhập nội bộ</Link></Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/book" className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full border border-brand/40 font-display text-sm text-brand">GS</span>
          <span><span className="block font-display text-lg tracking-wide text-ink">NINHVANA</span><span className="block text-[8px] uppercase tracking-[0.3em] text-muted-foreground">Hospitality</span></span>
        </Link>
        <div className="flex items-center gap-3 text-[11px]">
          <Link href="/login" className="text-muted-foreground hover:text-ink">Đăng nhập</Link>
          <Badge tone="brand"><Sparkles className="size-3" /> Đặt trực tiếp, giá tốt nhất</Badge>
        </div>
      </header>

      <section className="relative overflow-hidden border-y border-line bg-gradient-to-br from-brand-soft/70 via-canvas to-canvas">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <p className="label-xs">Bộ sưu tập khách sạn 5 sao</p>
          <h1 className="mt-2 max-w-2xl font-display text-5xl leading-[1.1] text-ink md:text-6xl">
            Nghỉ dưỡng tại nơi <em className="text-brand">tĩnh lặng</em> giữa lòng thành phố.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Đặt phòng trực tiếp với NinhVaNa — xác nhận tức thì, miễn phí huỷ trước 48 giờ, đưa đón sân bay và đặc quyền ẩm thực.
          </p>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-6 max-w-6xl px-5">
        <Card className="p-4 shadow-lg">
          <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_0.8fr_auto] md:items-end">
            <div>
              <Label htmlFor="book-property">Khách sạn</Label>
              <NativeSelect id="book-property" value={propertyCode} onChange={(event) => { setPropertyCode(event.target.value); setSubmitted(false); }}>
                {(properties.data ?? []).map((item) => <option key={item.code} value={item.code}>{item.name} · {item.city}</option>)}
              </NativeSelect>
            </div>
            <div><Label htmlFor="book-in">Nhận phòng</Label><Input id="book-in" type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} /></div>
            <div><Label htmlFor="book-out">Trả phòng</Label><Input id="book-out" type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} /></div>
            <div>
              <Label htmlFor="book-adults">Khách</Label>
              <NativeSelect id="book-adults" value={adults} onChange={(event) => setAdults(Number(event.target.value))}>
                {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} người lớn</option>)}
              </NativeSelect>
            </div>
            <Button size="lg" onClick={() => { setSubmitted(true); setError(null); }} disabled={nights <= 0}>
              Tìm phòng <ArrowRight />
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">{property ? `${property.name} · ${property.address} · ${property.starRating} sao` : 'Đang tải khách sạn…'} {nights > 0 ? `· ${nights} đêm` : ''}</p>
        </Card>
      </div>

      <section className="mx-auto max-w-6xl px-5 py-10">
        {submitted && availability.isLoading ? <p className="text-xs text-muted-foreground">Đang kiểm tra phòng trống…</p> : null}
        {submitted && availability.data ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl text-ink">Phòng dành cho quý khách</h2>
              <span className="text-[10px] text-muted-foreground">{availability.data.rooms.length} hạng phòng còn trống</span>
            </div>
            {availability.data.rooms.map((room) => {
              const isSelected = selected?.roomTypeId === room.roomTypeId;
              return (
              <Card key={room.roomTypeId} className={cn('overflow-hidden transition-all', isSelected && 'border-2 border-brand bg-brand-soft/35 ring-2 ring-brand/25 shadow-md')}>
                <CardContent className="grid gap-4 p-4 md:grid-cols-[180px_1fr_auto] md:items-center">
                  <div className="flex h-24 items-center justify-center rounded-lg bg-gradient-to-br from-brand-soft to-muted">
                    <BedDouble className="size-8 text-brand" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2"><h3 className="font-display text-xl text-ink">{room.name}</h3><Badge tone="outline">Tối đa {room.maxOccupancy} khách</Badge></div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{room.description ?? 'Không gian rộng rãi, ánh sáng tự nhiên, tiện nghi 5 sao.'}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="size-3" /> {adults} khách</span>
                      <span className="flex items-center gap-1"><CalendarDays className="size-3" /> {availability.data.nights} đêm</span>
                      <span className="flex items-center gap-1"><MapPin className="size-3" /> {availability.data.property.city}</span>
                      <span className="text-forest">Còn {room.available} phòng</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-muted-foreground">Từ</p>
                    <p className="font-display text-2xl text-ink">{formatMoney(room.averageRate)}</p>
                    <p className="text-[9px] text-muted-foreground">/đêm · tổng {formatMoney(room.total)}</p>
                    <Button className="mt-2" size="sm" variant={isSelected ? 'primary' : 'secondary'} aria-pressed={isSelected} onClick={() => { setSelected(room); setError(null); }}>{isSelected ? <><Check className="size-3.5" /> Đã chọn</> : 'Chọn phòng'}</Button>
                  </div>
                </CardContent>
              </Card>
              );
            })}
            {availability.data.rooms.length === 0 ? <p className="rounded-xl border border-line bg-surface p-8 text-center text-xs text-muted-foreground">Không còn phòng cho khoảng ngày này. Vui lòng chọn ngày khác.</p> : null}
          </div>
        ) : null}

        {!submitted ? (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[{ icon: ShieldCheck, title: 'Xác nhận tức thì', text: 'Hệ thống giữ phòng và xác nhận ngay khi đặt.' }, { icon: Sparkles, title: 'Đặc quyền trực tiếp', text: 'Nâng hạng khi còn phòng, late check-out 14:00.' }, { icon: MapPin, title: 'Vị trí trung tâm', text: 'Hồ Hoàn Kiếm và phố cổ trong bán kính 1 km.' }].map((item) => (
              <div key={item.title} className="rounded-xl border border-line bg-surface p-4">
                <item.icon className="size-4 text-brand" />
                <p className="mt-2 font-display text-lg text-ink">{item.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <Card className="max-h-[92vh] w-full max-w-lg overflow-y-auto p-5">
            <div className="flex items-start justify-between">
              <div><p className="label-xs">Hoàn tất đặt phòng</p><h2 className="font-display text-2xl text-ink">{selected.name}</h2><p className="text-[10px] text-muted-foreground">{checkIn} → {checkOut} · {nights} đêm · {adults} khách</p></div>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Đóng</Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="g-first">Tên</Label><Input id="g-first" value={guest.firstName} onChange={(event) => setGuest({ ...guest, firstName: event.target.value })} /></div>
              <div><Label htmlFor="g-last">Họ</Label><Input id="g-last" value={guest.lastName} onChange={(event) => setGuest({ ...guest, lastName: event.target.value })} /></div>
              <div><Label htmlFor="g-email">Email</Label><Input id="g-email" type="email" value={guest.email} onChange={(event) => setGuest({ ...guest, email: event.target.value })} /></div>
              <div><Label htmlFor="g-phone">Điện thoại</Label><Input id="g-phone" value={guest.phone} onChange={(event) => setGuest({ ...guest, phone: event.target.value })} /></div>
            </div>
            <div className="mt-3"><Label htmlFor="g-notes">Yêu cầu đặc biệt</Label><Input id="g-notes" value={guest.specialRequests} onChange={(event) => setGuest({ ...guest, specialRequests: event.target.value })} placeholder="Tầng cao, phòng yên tĩnh…" /></div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-xs"><span>Tổng cộng</span><span className="font-display text-xl">{formatMoney(selected.total)}</span></div>
            <p className="mt-2 text-[9px] text-muted-foreground">Thanh toán tại khách sạn. Miễn phí huỷ trước 48 giờ.</p>
            <FieldError>{error ?? undefined}</FieldError>
            <Button className="mt-3 w-full" loading={create.isPending} onClick={() => {
              if (!guest.firstName || !guest.lastName || !guest.email || !guest.phone) return setError('Vui lòng nhập đủ họ tên, email và điện thoại');
              setError(null);
              create.mutate();
            }}>Xác nhận đặt phòng</Button>
          </Card>
        </div>
      ) : null}

      <footer className="border-t border-line px-5 py-6 text-center text-[10px] text-muted-foreground">
        NINHVANA · HỆ THỐNG QUẢN TRỊ KHÁCH SẠN · Đặt phòng trực tiếp được bảo đảm bởi hệ thống PMS
      </footer>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line/60 pb-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-display text-base text-ink' : 'text-right text-ink'}>{value}</span>
    </div>
  );
}
