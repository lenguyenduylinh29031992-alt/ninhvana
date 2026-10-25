'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, BadgeCheck, FileJson, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AuditLogRecord, Paginated } from '@grand-suite/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, PageHeader } from '@/components/ui/feedback';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { activityLabel, entityLabel } from '@/lib/activity';
import { useI18n } from '@/lib/i18n';
import { useAccess } from '@/lib/session';
import { PermissionNotice } from '@/components/domain/permission-notice';

const ENTITY_OPTIONS = [
  'User',
  'Property',
  'Role',
  'SystemSetting',
  'TaxRate',
  'ExchangeRate',
  'IntegrationConfig',
  'RefreshToken',
  'System',
];

export default function AuditPage() {
  const { can } = useAccess();
  const { formatDateTime } = useI18n();
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditLogRecord | null>(null);

  const query = useQuery<Paginated<AuditLogRecord>>({
    queryKey: ['audit', { search, entityType, from, to, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (search.trim()) params.set('q', search.trim());
      if (entityType) params.set('entityType', entityType);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api<Paginated<AuditLogRecord>>(`/audit?${params.toString()}`);
    },
    enabled: can('audit:view'),
  });

  const verify = useMutation({
    mutationFn: () => api<{ valid: boolean; checked: number; brokenAt?: string }>('/audit/verify'),
  });

  if (!can('audit:view')) return <PermissionNotice />;

  const chainStatus = verify.data;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quản trị hệ thống"
        title="Nhật ký kiểm toán"
        description="Bản ghi chỉ-ghi (append-only) với chuỗi băm liên kết. Bất kỳ sửa/xoá nào cũng làm đứt chuỗi và bị phát hiện."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => verify.mutate()}
              loading={verify.isPending}
            >
              <ShieldCheck />
              Kiểm tra chuỗi băm
            </Button>
            {chainStatus ? (
              <Badge tone={chainStatus.valid ? 'success' : 'danger'}>
                {chainStatus.valid ? <BadgeCheck className="size-3" /> : <ShieldAlert className="size-3" />}
                {chainStatus.valid
                  ? `Hợp lệ · ${chainStatus.checked} bản ghi`
                  : `Phát hiện sai lệch tại ${chainStatus.brokenAt?.slice(-8)}`}
              </Badge>
            ) : null}
          </>
        }
      />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center gap-2 pb-4">
          <div className="relative min-w-[190px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo hành động, đối tượng, người thực hiện…"
              className="h-9 pl-8 text-xs"
            />
          </div>
          <NativeSelect
            value={entityType}
            onChange={(event) => {
              setEntityType(event.target.value);
              setPage(1);
            }}
            className="h-9 w-auto min-w-[150px] text-xs"
          >
            <option value="">Mọi đối tượng</option>
            {ENTITY_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </NativeSelect>
          <Input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            className="h-9 w-auto text-xs"
            aria-label="Từ ngày"
          />
          <Input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className="h-9 w-auto text-xs"
            aria-label="Đến ngày"
          />
          <span className="ml-auto text-[11px] text-muted-foreground">
            {query.data?.total ?? 0} bản ghi
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : (query.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={Activity}
              title="Chưa có bản ghi nào"
              description="Thao tác nhạy cảm sẽ xuất hiện tại đây ngay khi được thực hiện."
              className="m-5"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Thời điểm</TableHead>
                  <TableHead>Hành động</TableHead>
                  <TableHead className="hidden md:table-cell">Đối tượng</TableHead>
                  <TableHead>Người thực hiện</TableHead>
                  <TableHead className="hidden lg:table-cell">IP</TableHead>
                  <TableHead className="hidden xl:table-cell">Chuỗi băm</TableHead>
                  <TableHead className="pr-5 text-right">Chi tiết</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap pl-5 text-[11px] tabular text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                    </TableCell>
                    <TableCell>
                      <span className="text-[12px] font-medium text-ink">{activityLabel(item.action)}</span>
                      {item.reason ? (
                        <span className="mt-0.5 block max-w-[220px] truncate text-[10px] text-muted-foreground">
                          {item.reason}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge tone="outline">
                        {entityLabel(item.entityType)}
                        {item.entityId ? ` · ${item.entityId.slice(-6)}` : ''}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[11px]">{item.actorName ?? 'Hệ thống'}</TableCell>
                    <TableCell className="hidden text-[10px] tabular text-muted-foreground lg:table-cell">
                      {item.ip ?? '—'}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {item.hashSelf.slice(0, 10)}…
                      </code>
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => setDetail(item)} aria-label="Xem chi tiết">
                        <FileJson />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <p className="text-[11px] text-muted-foreground">
              Trang {query.data?.page ?? 1} / {query.data?.totalPages ?? 1}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                Trước
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= (query.data?.totalPages ?? 1)}
                onClick={() => setPage((value) => value + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => (!open ? setDetail(null) : undefined)}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>{detail ? activityLabel(detail.action) : ''}</DialogTitle>
            <DialogDescription>
              {detail ? `${entityLabel(detail.entityType)} · ${formatDateTime(detail.createdAt)}` : ''}
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-4">
                <Meta label="Người thực hiện" value={detail.actorName ?? 'Hệ thống'} />
                <Meta label="IP" value={detail.ip ?? '—'} />
                <Meta label="Request ID" value={detail.requestId?.slice(0, 12) ?? '—'} />
                <Meta label="Mã băm" value={`${detail.hashSelf.slice(0, 12)}…`} />
              </div>
              {detail.reason ? (
                <div className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-[11px] text-warning">
                  Lý do: {detail.reason}
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <JsonBlock title="Trước thay đổi" value={detail.before} />
                <JsonBlock title="Sau thay đổi" value={detail.after} />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-label text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[11px] text-ink">{value}</p>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1.5 text-[9px] uppercase tracking-label text-muted-foreground">{title}</p>
      <pre className="max-h-[240px] overflow-auto rounded-lg border border-line bg-muted/50 p-3 font-mono text-[10px] leading-relaxed text-ink">
        {value === null || value === undefined ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
