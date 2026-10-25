'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MessageSquare, Star, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExportMenu } from '@/components/domain/export-menu';
import { PageHeader } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface Segments { total: number; segments: Array<{ key: string; label: string; count: number; value: number }>; topGuests: Array<{ id: string; fullName: string; vipLevel: number; stays: number; lifetimeValue: number }> }
interface Review { id: string; guestName: string; rating: number; title: string; comment: string; response: string | null; status: string; reviewDate: string }
interface Reviews { average: number; count: number; distribution: Array<{ rating: number; count: number }>; items: Review[] }
interface Campaign { id: string; name: string; channel: string; segment: string; subject: string; status: string; recipientsCount: number }

export default function CrmPage() {
  const { can } = useAccess(); const queryClient = useQueryClient();
  const [tab, setTab] = useState<'SEGMENTS' | 'REVIEWS' | 'CAMPAIGNS'>('SEGMENTS');
  const [replyTo, setReplyTo] = useState<Review | null>(null); const [reply, setReply] = useState('');
  const [campaignOpen, setCampaignOpen] = useState(false);
  const segments = useQuery<Segments>({ queryKey: ['crm-segments'], queryFn: () => api('/crm/segments'), enabled: can('crm:view') });
  const reviews = useQuery<Reviews>({ queryKey: ['crm-reviews'], queryFn: () => api('/crm/reviews'), enabled: can('crm:view') });
  const campaigns = useQuery<Campaign[]>({ queryKey: ['crm-campaigns'], queryFn: () => api('/crm/campaigns'), enabled: can('crm:view') });

  const respond = useMutation({ mutationFn: () => api(`/crm/reviews/${replyTo?.id}/reply`, { method: 'POST', body: { response: reply } }), onSuccess: async () => { toast.success('Đã phản hồi đánh giá'); setReplyTo(null); setReply(''); await queryClient.invalidateQueries({ queryKey: ['crm-reviews'] }); } });
  const send = useMutation({ mutationFn: (id: string) => api(`/crm/campaigns/${id}/send`, { method: 'POST' }), onSuccess: async () => { toast.success('Đã gửi chiến dịch (mock)'); await queryClient.invalidateQueries({ queryKey: ['crm-campaigns'] }); } });
  if (!can('crm:view')) return <PermissionNotice />;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Khách hàng · CRM" title="Guest Experience" description="Phân khúc, đánh giá và chiến dịch chăm sóc khách hàng đa cơ sở." actions={<div className="flex items-center gap-2"><ExportMenu dataset="crm-reviews" label="Xuất CRM" /><Badge tone="brand"><Star className="size-3" /> {reviews.data?.average ?? '—'} / 5</Badge></div>} />
      <div className="grid gap-3 sm:grid-cols-3"><Kpi icon={Users} label="Khách hàng" value={segments.data?.total ?? 0} /><Kpi icon={Star} label="Đánh giá trung bình" value={reviews.data?.average ?? 0} /><Kpi icon={Mail} label="Chiến dịch" value={campaigns.data?.length ?? 0} /></div>
      <div className="flex gap-1">{([['SEGMENTS', 'Phân khúc'], ['REVIEWS', 'Đánh giá'], ['CAMPAIGNS', 'Chiến dịch']] as const).map(([value, label]) => <Button key={value} size="sm" variant={tab === value ? 'primary' : 'secondary'} onClick={() => setTab(value)}>{label}</Button>)}</div>

      {tab === 'SEGMENTS' ? <div className="grid gap-4 lg:grid-cols-2"><Card><CardContent className="p-4"><p className="font-display text-lg">Phân khúc</p>{segments.data?.segments.map((segment) => <div key={segment.key} className="mt-2 border-b border-line/60 pb-2"><div className="flex justify-between text-xs"><span>{segment.label}</span><span>{segment.count} khách</span></div><p className="text-[10px] text-muted-foreground">Giá trị trọn đời {formatMoney(segment.value)}</p></div>)}</CardContent></Card><Card><CardContent className="p-4"><p className="font-display text-lg">Top khách hàng</p><Table><TableHeader><TableRow><TableHead>Khách</TableHead><TableHead className="text-right">Lưu trú</TableHead><TableHead className="text-right">Chi tiêu</TableHead></TableRow></TableHeader><TableBody>{segments.data?.topGuests.map((guest) => <TableRow key={guest.id}><TableCell>{guest.fullName} {guest.vipLevel > 0 ? <Badge tone="brand">VIP</Badge> : null}</TableCell><TableCell className="text-right">{guest.stays}</TableCell><TableCell className="tabular text-right">{formatMoney(guest.lifetimeValue)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></div> : null}

      {tab === 'REVIEWS' ? <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead className="pl-4">Khách</TableHead><TableHead>Điểm</TableHead><TableHead>Nội dung</TableHead><TableHead>Ngày</TableHead><TableHead className="pr-4 text-right">Phản hồi</TableHead></TableRow></TableHeader><TableBody>{reviews.data?.items.map((review) => <TableRow key={review.id}><TableCell className="pl-4 text-[11px]">{review.guestName}</TableCell><TableCell><Badge tone={review.rating >= 4 ? 'success' : review.rating >= 3 ? 'warning' : 'danger'}>{review.rating} ★</Badge></TableCell><TableCell className="max-w-[420px] text-[11px]">{review.title}<span className="block text-[9px] text-muted-foreground">{review.comment}</span>{review.response ? <span className="mt-1 block text-[9px] text-forest">↳ {review.response}</span> : null}</TableCell><TableCell className="text-[10px]">{review.reviewDate}</TableCell><TableCell className="pr-4 text-right">{review.status === 'RESPONDED' ? <Badge tone="success">Đã trả lời</Badge> : <Button size="sm" variant="secondary" disabled={!can('crm:manage')} onClick={() => { setReplyTo(review); setReply(''); }}><MessageSquare /> Trả lời</Button>}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card> : null}

      {tab === 'CAMPAIGNS' ? <Card><CardContent className="p-4"><div className="mb-3 flex justify-between"><p className="font-display text-lg">Chiến dịch</p><Button size="sm" disabled={!can('crm:manage')} onClick={() => setCampaignOpen(true)}><Mail /> Tạo chiến dịch</Button></div><Table><TableHeader><TableRow><TableHead>Tên</TableHead><TableHead>Kênh</TableHead><TableHead>Phân khúc</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Người nhận</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{campaigns.data?.map((campaign) => <TableRow key={campaign.id}><TableCell className="text-[11px]">{campaign.name}</TableCell><TableCell>{campaign.channel}</TableCell><TableCell><Badge tone="outline">{campaign.segment}</Badge></TableCell><TableCell><Badge tone={campaign.status === 'SENT' ? 'success' : 'outline'}>{campaign.status}</Badge></TableCell><TableCell className="text-right">{campaign.recipientsCount}</TableCell><TableCell className="text-right">{campaign.status === 'DRAFT' ? <Button size="sm" variant="secondary" disabled={!can('crm:manage')} onClick={() => send.mutate(campaign.id)}>Gửi</Button> : null}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card> : null}

      <Dialog open={Boolean(replyTo)} onOpenChange={(open) => { if (!open) setReplyTo(null); }}><DialogContent><DialogHeader><DialogTitle>Phản hồi đánh giá</DialogTitle></DialogHeader><p className="text-xs text-muted-foreground">“{replyTo?.comment}”</p><Textarea className="mt-2" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Cảm ơn quý khách…" /><Button className="mt-2 w-full" loading={respond.isPending} onClick={() => { if (!reply.trim()) return; respond.mutate(); }}>Gửi phản hồi</Button></DialogContent></Dialog>
      <CampaignDialog open={campaignOpen} onOpenChange={setCampaignOpen} onDone={async () => { await queryClient.invalidateQueries({ queryKey: ['crm-campaigns'] }); }} />
    </div>
  );
}

function CampaignDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ name: '', segment: 'VIP', subject: '', body: '' });
  const mutation = useMutation({ mutationFn: () => api('/crm/campaigns', { method: 'POST', body: { ...form, channel: 'EMAIL' } }), onSuccess: async () => { toast.success('Đã tạo chiến dịch'); onOpenChange(false); await onDone(); } });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Chiến dịch mới</DialogTitle></DialogHeader><div className="space-y-2"><div><Label>Tên</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div><Label>Phân khúc</Label><Input value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value })} /></div><div><Label>Tiêu đề</Label><Input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></div><div><Label>Nội dung</Label><Textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></div></div><Button className="mt-2 w-full" loading={mutation.isPending} onClick={() => mutation.mutate()}>Tạo</Button></DialogContent></Dialog>;
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return <Card className="p-4"><div className="flex justify-between"><p className="label-xs">{label}</p><Icon className="size-4 text-brand" /></div><p className="mt-2 font-display text-3xl text-ink">{value}</p></Card>;
}
