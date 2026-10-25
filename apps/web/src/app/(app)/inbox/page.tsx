'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, MessageCircle, Search, Send, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { useAccess } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionNotice } from '@/components/domain/permission-notice';
import { cn } from '@/lib/utils';

interface ConversationRow {
  id: string;
  guestName: string;
  guestHandle: string | null;
  channel: { code: string; name: string; type: string };
  status: string;
  priority: number;
  subject: string | null;
  unreadCount: number;
  lastMessageAt: string;
  lastMessage: string | null;
}

interface InboxResponse {
  counts: { open: number; pending: number; unread: { _sum: { unreadCount: number | null } } };
  items: ConversationRow[];
  total: number;
}

interface Detail {
  id: string;
  guestName: string;
  guestHandle: string | null;
  channel: { code: string; name: string; type: string };
  status: string;
  subject: string | null;
  messages: Array<{ id: string; direction: string; senderName: string; body: string; status: string; sentAt: string }>;
}

const STATUS_LABEL: Record<string, string> = { OPEN: 'Mở', PENDING: 'Chờ xử lý', CLOSED: 'Đã đóng' };

export default function InboxPage() {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'PENDING' | 'CLOSED'>('ALL');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const inbox = useQuery<InboxResponse>({
    queryKey: ['inbox', filter, q],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', pageSize: '40' });
      if (filter !== 'ALL') params.set('status', filter);
      if (q) params.set('q', q);
      return api<InboxResponse>(`/inbox/conversations?${params.toString()}`);
    },
    enabled: can('inbox:view'),
    refetchInterval: 20_000,
  });

  useEffect(() => {
    if (!selected && inbox.data?.items.length) setSelected(inbox.data.items[0]!.id);
  }, [inbox.data, selected]);

  const detail = useQuery<Detail>({
    queryKey: ['inbox-detail', selected],
    queryFn: () => api<Detail>(`/inbox/conversations/${selected}`),
    enabled: Boolean(selected) && can('inbox:view'),
  });

  const send = useMutation({
    mutationFn: () => api(`/inbox/conversations/${selected}/reply`, { method: 'POST', body: { body: reply } }),
    onSuccess: async () => {
      setReply('');
      toast.success('Đã gửi tin nhắn');
      await queryClient.invalidateQueries({ queryKey: ['inbox-detail', selected] });
      await queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không gửi được'),
  });

  const update = useMutation({
    mutationFn: (status: string) => api(`/inbox/conversations/${selected}`, { method: 'PATCH', body: { status } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inbox'] });
      await queryClient.invalidateQueries({ queryKey: ['inbox-detail', selected] });
    },
  });

  if (!can('inbox:view')) return <PermissionNotice />;

  const items = inbox.data?.items ?? [];
  const active = detail.data;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Thương mại · Hộp thư đa kênh"
        title="Social Commerce Inbox"
        description="Facebook, Instagram, Zalo, WhatsApp, TikTok, Telegram, LINE, KakaoTalk, WeChat trong một hộp thư."
        actions={<Badge tone="champagne"><MessageCircle className="size-3" /> {inbox.data?.counts.open ?? 0} hội thoại mở</Badge>}
      />

      <Card className="overflow-hidden">
        <div className="grid min-h-[620px] lg:grid-cols-[340px_1fr]">
          <div className="border-b border-line lg:border-b-0 lg:border-r">
            <div className="space-y-2 border-b border-line p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Tên khách, chủ đề…" className="pl-8" />
              </div>
              <div className="flex flex-wrap gap-1">
                {(['ALL', 'OPEN', 'PENDING', 'CLOSED'] as const).map((value) => (
                  <Button key={value} size="sm" variant={filter === value ? 'primary' : 'ghost'} onClick={() => setFilter(value)}>
                    {value === 'ALL' ? 'Tất cả' : STATUS_LABEL[value]}
                  </Button>
                ))}
              </div>
            </div>
            <div className="max-h-[560px] overflow-y-auto">
              {inbox.isLoading ? <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div> : items.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelected(conversation.id)}
                  className={cn('flex w-full flex-col gap-1 border-b border-line/60 px-3 py-3 text-left transition-colors hover:bg-muted/50', selected === conversation.id && 'bg-champagne-soft/50')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink">{conversation.guestName}</span>
                    <span className="text-[9px] text-muted-foreground">{new Date(conversation.lastMessageAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone="outline">{conversation.channel.code}</Badge>
                    {conversation.unreadCount > 0 ? <Badge tone="danger">{conversation.unreadCount} mới</Badge> : null}
                    {conversation.status === 'PENDING' ? <Badge tone="warning">Chờ</Badge> : null}
                  </div>
                  <p className="line-clamp-1 text-[10px] text-muted-foreground">{conversation.lastMessage ?? conversation.subject ?? '—'}</p>
                </button>
              ))}
              {!inbox.isLoading && items.length === 0 ? <p className="p-6 text-center text-xs text-muted-foreground">Không có hội thoại.</p> : null}
            </div>
          </div>

          <div className="flex min-h-[520px] flex-col">
            {selected && active ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <div>
                    <p className="font-display text-xl text-ink">{active.guestName}</p>
                    <p className="text-[10px] text-muted-foreground">{active.channel.name} · {active.guestHandle ?? '—'} · {active.subject ?? ''}</p>
                  </div>
                  <div className="flex gap-1">
                    {(['OPEN', 'PENDING', 'CLOSED'] as const).map((status) => (
                      <Button key={status} size="sm" variant={active.status === status ? 'primary' : 'secondary'} disabled={!can('inbox:manage')} onClick={() => update.mutate(status)}>
                        {STATUS_LABEL[status]}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
                  {active.messages.map((message) => (
                    <div key={message.id} className={cn('flex', message.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed', message.direction === 'OUTBOUND' ? 'bg-ink text-surface' : 'border border-line bg-surface text-ink')}>
                        <p className="mb-1 flex items-center gap-1 text-[9px] opacity-60">
                          {message.direction === 'INBOUND' ? <UserRound className="size-2.5" /> : <CheckCheck className="size-2.5" />}
                          {message.senderName} · {new Date(message.sentAt).toLocaleString('vi-VN')}
                        </p>
                        {message.body}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-line p-3">
                  <Textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Trả lời khách…" className="min-h-[70px]" />
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[9px] text-muted-foreground">Gửi qua adapter {active.channel.code} · tin nhắn được lưu vào hội thoại</p>
                    <Button size="sm" loading={send.isPending} disabled={!reply.trim() || !can('inbox:manage')} onClick={() => send.mutate()}>
                      <Send /> Gửi
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                <MessageCircle className="size-8 opacity-30" />
                <p className="text-xs">Chọn một hội thoại để xem tin nhắn.</p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
