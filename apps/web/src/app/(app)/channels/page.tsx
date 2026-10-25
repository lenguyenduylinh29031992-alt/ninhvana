'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Cable, RefreshCw, Radio, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { useAccess } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ExportMenu } from '@/components/domain/export-menu';
import { PageHeader } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionNotice } from '@/components/domain/permission-notice';
import { cn } from '@/lib/utils';

interface ChannelRow {
  id: string;
  code: string;
  name: string;
  type: string;
  commissionPct: number;
  isActive: boolean;
  adapter: boolean;
  integrationStatus: string;
  mappings: number;
  bookings30d: number;
  jobs: { pending: number; dlq: number; failed: number; success: number };
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
}

interface ChannelsResponse {
  totals: { channels: number; ota: number; social: number; mappings: number; bookings30d: number; dlq: number };
  channels: ChannelRow[];
  logs: Array<{ id: string; channelCode: string; channelName: string; direction: string; kind: string; status: string; error: string | null; durationMs: number | null; createdAt: string }>;
}

const TYPE_LABEL: Record<string, string> = { OTA: 'OTA', SOCIAL: 'Mạng xã hội', DIRECT: 'Trực tiếp', B2B: 'B2B', OFFLINE: 'Offline' };

export default function ChannelsPage() {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'ALL' | 'OTA' | 'SOCIAL'>('ALL');

  const channels = useQuery<ChannelsResponse>({
    queryKey: ['channels'],
    queryFn: () => api<ChannelsResponse>('/channels'),
    enabled: can('channel:view'),
    refetchInterval: 30_000,
  });

  const action = useMutation({
    mutationFn: async ({ code, kind }: { code: string; kind: 'push' | 'pull' | 'process' }) => {
      if (kind === 'push') return api(`/channels/${code}/push-ari`, { method: 'POST', body: { days: 3 } });
      if (kind === 'pull') return api(`/channels/${code}/pull?count=1`, { method: 'POST' });
      return api(`/channels/${code}/process?force=true`, { method: 'POST' });
    },
    onSuccess: async () => {
      toast.success('Đã đồng bộ kênh');
      await queryClient.invalidateQueries({ queryKey: ['channels'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Đồng bộ thất bại'),
  });

  if (!can('channel:view')) return <PermissionNotice />;

  const data = channels.data;
  const rows = (data?.channels ?? []).filter((channel) => tab === 'ALL' || channel.type === tab);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Thương mại · Kênh phân phối"
        title="Channel Manager"
        description="Đồng bộ tồn phòng & giá (ARI) hai chiều với OTA và mạng xã hội. Connector mock chạy đầy đủ retry, backoff và dead-letter queue."
        actions={
          <div className="flex items-center gap-2"><ExportMenu dataset="channels" label="Xuất" /><Badge tone={data?.totals.dlq ? 'danger' : 'success'}>
            {data?.totals.dlq ? <TriangleAlert className="size-3" /> : <Cable className="size-3" />}
            {data?.totals.dlq ?? 0} job lỗi
          </Badge></div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Kênh hoạt động" value={data?.totals.channels ?? 0} hint={`${data?.totals.ota ?? 0} OTA · ${data?.totals.social ?? 0} social`} />
        <Kpi label="Mapping hạng phòng" value={data?.totals.mappings ?? 0} hint="8 OTA × 14 hạng phòng" />
        <Kpi label="Booking 30 ngày" value={data?.totals.bookings30d ?? 0} hint="Đã gắn kênh & hoa hồng" />
        <Kpi label="Job đã xử lý" value={(data?.channels ?? []).reduce((acc, channel) => acc + channel.jobs.success, 0)} hint={`${(data?.channels ?? []).reduce((acc, channel) => acc + channel.jobs.pending, 0)} đang chờ`} />
      </div>

      <div className="flex gap-1">
        {(['ALL', 'OTA', 'SOCIAL'] as const).map((value) => (
          <Button key={value} size="sm" variant={tab === value ? 'primary' : 'secondary'} onClick={() => setTab(value)}>
            {value === 'ALL' ? 'Tất cả' : value === 'OTA' ? 'OTA' : 'Mạng xã hội'}
          </Button>
        ))}
      </div>

      {channels.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-44" />)}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((channel) => (
            <Card key={channel.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg text-ink">{channel.name}</p>
                    <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">{channel.code}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={channel.type === 'OTA' ? 'brand' : channel.type === 'SOCIAL' ? 'outline' : 'neutral'}>
                      {TYPE_LABEL[channel.type] ?? channel.type}
                    </Badge>
                    <Badge tone={channel.integrationStatus === 'ACTIVE' ? 'success' : channel.integrationStatus === 'ERROR' ? 'danger' : 'brand'}>
                      {channel.integrationStatus}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                  <div><p className="text-muted-foreground">Hoa hồng</p><p className="tabular font-medium">{channel.commissionPct}%</p></div>
                  <div><p className="text-muted-foreground">Booking 30d</p><p className="tabular font-medium">{channel.bookings30d}</p></div>
                  <div><p className="text-muted-foreground">Mapping</p><p className="tabular font-medium">{channel.mappings}</p></div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1 text-[9px]">
                  <Badge tone="neutral">{channel.jobs.success} ok</Badge>
                  {channel.jobs.failed > 0 ? <Badge tone="warning">{channel.jobs.failed} retry</Badge> : null}
                  {channel.jobs.dlq > 0 ? <Badge tone="danger">{channel.jobs.dlq} DLQ</Badge> : null}
                  <span className={cn('ml-auto', channel.lastSyncStatus === 'FAILED' || channel.lastSyncStatus === 'DLQ' ? 'text-danger' : 'text-muted-foreground')}>
                    {channel.lastSyncAt ? new Date(channel.lastSyncAt).toLocaleTimeString('vi-VN') : 'chưa đồng bộ'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
                  <Button size="sm" variant="secondary" disabled={!channel.adapter || !can('channel:sync') || action.isPending} onClick={() => action.mutate({ code: channel.code, kind: 'push' })}>
                    <ArrowUpFromLine /> Đẩy ARI
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!channel.adapter || !can('channel:sync') || action.isPending} onClick={() => action.mutate({ code: channel.code, kind: 'pull' })}>
                    <ArrowDownToLine /> Kéo booking
                  </Button>
                  {channel.jobs.failed > 0 || channel.jobs.dlq > 0 ? (
                    <Button size="sm" variant="ghost" className="col-span-2" disabled={!can('channel:sync') || action.isPending} onClick={() => action.mutate({ code: channel.code, kind: 'process' })}>
                      <RefreshCw /> Xử lý lại job lỗi
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="font-display text-lg text-ink">Nhật ký đồng bộ</p>
            <Badge tone="outline"><Radio className="size-3" /> {data?.logs.length ?? 0} sự kiện</Badge>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead className="pl-4">Thời gian</TableHead><TableHead>Kênh</TableHead><TableHead>Hướng</TableHead><TableHead>Loại</TableHead><TableHead>Trạng thái</TableHead><TableHead className="pr-4 text-right">Thời lượng</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data?.logs ?? []).slice(0, 20).map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="pl-4 text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString('vi-VN')}</TableCell>
                  <TableCell className="text-[11px]">{log.channelName}</TableCell>
                  <TableCell><Badge tone="outline">{log.direction}</Badge></TableCell>
                  <TableCell className="text-[10px]">{log.kind}</TableCell>
                  <TableCell>
                    <Badge tone={['SUCCESS', 'QUEUED'].includes(log.status) ? 'success' : ['FAILED', 'PARTIAL'].includes(log.status) ? 'warning' : 'danger'}>{log.status}</Badge>
                    {log.error ? <span className="ml-2 text-[9px] text-danger">{log.error.slice(0, 60)}</span> : null}
                  </TableCell>
                  <TableCell className="pr-4 text-right text-[10px] text-muted-foreground">{log.durationMs ? `${log.durationMs} ms` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="p-4">
      <p className="label-xs">{label}</p>
      <p className="mt-1 font-display text-3xl text-ink">{value}</p>
      <p className="text-[9px] text-muted-foreground">{hint}</p>
    </Card>
  );
}
