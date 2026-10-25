'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gem, Search, Star, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface GuestRow {
  id: string;
  code: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  vipLevel: number;
  totalStays: number;
  totalNights: number;
  lifetimeValue: number;
  lastStayAt: string | null;
  reservations: number;
}

interface GuestDetail {
  id: string;
  code: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  vipLevel: number;
  notes: string | null;
  lifetimeValue: number;
  preferences: Array<{ id: string; category: string; value: string }>;
  documents: Array<{ id: string; type: string; maskedNumber: string }>;
  reservations: Array<{ id: string; code: string; status: string; checkIn: string; checkOut: string; property: string }>;
  folios: Array<{ id: string; number: string; status: string; balance: number; property: string }>;
}

export default function GuestsPage() {
  const { can } = useAccess();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery<{ items: GuestRow[]; total: number; totalPages: number }>({
    queryKey: ['guests', q, page],
    queryFn: () => api(`/guests?q=${encodeURIComponent(q)}&page=${page}&pageSize=25`),
    enabled: can('guest:view'),
  });

  if (!can('guest:view')) return <PermissionNotice />;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Vận hành · Khách hàng" title="Hồ sơ khách" description="Lịch sử lưu trú, chi tiêu và hạng thành viên." actions={<Badge tone="outline"><Users className="size-3" /> {list.data?.total ?? 0} khách</Badge>} />
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Tên, email, điện thoại, mã khách…" className="pl-8" />
          </div>
          {list.isLoading ? <Skeleton className="h-64 w-full" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Khách</TableHead><TableHead>Liên hệ</TableHead><TableHead>Hạng</TableHead><TableHead className="text-right">Lưu trú</TableHead><TableHead className="text-right">Chi tiêu</TableHead><TableHead>Lần cuối</TableHead></TableRow></TableHeader>
              <TableBody>
                {(list.data?.items ?? []).map((guest) => (
                  <TableRow key={guest.id} className="cursor-pointer" onClick={() => setSelected(guest.id)}>
                    <TableCell><span className="text-xs font-medium">{guest.fullName}</span><span className="block font-mono text-[9px] text-muted-foreground">{guest.code}</span></TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{guest.phone ?? '—'}<span className="block">{guest.email ?? ''}</span></TableCell>
                    <TableCell>{guest.vipLevel > 0 ? <Badge tone="champagne"><Star className="size-3" /> VIP {guest.vipLevel}</Badge> : <Badge tone="neutral">Thường</Badge>}</TableCell>
                    <TableCell className="text-right text-[11px]">{guest.totalStays} lần · {guest.totalNights} đêm</TableCell>
                    <TableCell className="tabular text-right text-[11px]">{formatMoney(guest.lifetimeValue)}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{guest.lastStayAt?.slice(0, 10) ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex justify-between">
            <p className="text-[10px] text-muted-foreground">Trang {page}/{list.data?.totalPages ?? 1}</p>
            <div className="flex gap-2"><button className="text-xs text-champagne disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button><button className="text-xs text-champagne disabled:opacity-40" disabled={page >= (list.data?.totalPages ?? 1)} onClick={() => setPage(page + 1)}>Sau</button></div>
          </div>
        </CardContent>
      </Card>
      <GuestDetail id={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function GuestDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useQuery<GuestDetail>({ queryKey: ['guest', id], queryFn: () => api<GuestDetail>(`/guests/${id}`), enabled: Boolean(id) });
  const guest = detail.data;
  return (
    <Dialog open={Boolean(id)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{guest?.fullName ?? 'Khách'}<Gem className="size-4 text-champagne" /></DialogTitle><DialogDescription>{guest?.code} · {guest?.nationality ?? '—'}</DialogDescription></DialogHeader>
        {!guest ? <Skeleton className="h-40 w-full" /> : (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-line p-2"><p className="label-xs">Liên hệ</p><p className="mt-1">{guest.phone ?? '—'}</p><p className="text-[10px] text-muted-foreground">{guest.email ?? '—'}</p></div>
              <div className="rounded-lg border border-line p-2"><p className="label-xs">Giá trị trọn đời</p><p className="mt-1 font-display text-lg">{formatMoney(guest.lifetimeValue)}</p></div>
            </div>
            <div className="flex gap-2">
              {guest.documents.map((document) => <Badge key={document.id} tone="outline">{document.type}: {document.maskedNumber}</Badge>)}
              {guest.preferences.map((preference) => <Badge key={preference.id} tone="neutral">{preference.value}</Badge>)}
            </div>
            <div>
              <p className="label-xs mb-1">Lịch sử lưu trú</p>
              {(guest.reservations ?? []).map((reservation) => (
                <div key={reservation.id} className="flex justify-between border-b border-line/60 py-1"><span>{reservation.checkIn} → {reservation.checkOut} · {reservation.property}</span><Badge tone="outline">{reservation.status}</Badge></div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
