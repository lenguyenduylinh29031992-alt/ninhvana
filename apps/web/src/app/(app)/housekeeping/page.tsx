'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, ClipboardList, Sparkles, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { HousekeepingBoard } from '@/lib/ops-types';
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

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ dọn',
  IN_PROGRESS: 'Đang dọn',
  DONE: 'Đã dọn',
  VERIFIED: 'Đã kiểm tra',
  BLOCKED: 'Báo hỏng',
};

export default function HousekeepingPage() {
  const { can } = useAccess();
  const { activeProperty, properties } = useActiveProperty();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'ACTIVE' | 'DONE'>('ACTIVE');
  const propertyId =
    activeProperty?.id ?? properties.find((property) => property.type === 'HOTEL')?.id ?? properties[0]?.id;

  const board = useQuery<HousekeepingBoard>({
    queryKey: ['housekeeping', propertyId],
    queryFn: () => api<HousekeepingBoard>(`/housekeeping/tasks?propertyId=${propertyId}`),
    enabled: Boolean(propertyId) && can('housekeeping:view'),
    refetchInterval: 30_000,
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/housekeeping/tasks/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: async () => {
      toast.success('Đã cập nhật phòng');
      await queryClient.invalidateQueries({ queryKey: ['housekeeping'] });
      await queryClient.invalidateQueries({ queryKey: ['front-desk'] });
    },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không cập nhật được'),
  });

  if (!can('housekeeping:view')) return <PermissionNotice />;

  const items = (board.data?.items ?? []).filter((task) =>
    filter === 'DONE' ? ['DONE', 'VERIFIED'].includes(task.status) : !['DONE', 'VERIFIED'].includes(task.status),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Vận hành · Buồng phòng"
        title="Bảng công việc buồng phòng"
        description="Cập nhật theo phòng, dùng tốt trên điện thoại của nhân viên."
        actions={
          <div className="flex gap-1">
            <Button size="sm" variant={filter === 'ACTIVE' ? 'primary' : 'secondary'} onClick={() => setFilter('ACTIVE')}>
              Đang xử lý ({(board.data?.counts.pending ?? 0) + (board.data?.counts.inProgress ?? 0) + (board.data?.counts.blocked ?? 0)})
            </Button>
            <Button size="sm" variant={filter === 'DONE' ? 'primary' : 'secondary'} onClick={() => setFilter('DONE')}>Hoàn tất ({board.data?.counts.done ?? 0})</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini label="Chờ dọn" value={board.data?.counts.pending ?? 0} tone="brand" />
        <Mini label="Đang dọn" value={board.data?.counts.inProgress ?? 0} tone="warning" />
        <Mini label="Hoàn tất" value={board.data?.counts.done ?? 0} tone="success" />
        <Mini label="Báo hỏng" value={board.data?.counts.blocked ?? 0} tone="danger" />
      </div>

      {board.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-48" />)}</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-xs text-muted-foreground">Không có công việc trong nhóm này.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((task) => {
            const done = (task.checklist ?? []).filter((item) => item.done).length;
            const total = task.checklist?.length ?? 0;
            return (
              <Card key={task.id} className={cn(task.priority === 1 && 'border-danger/30')}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-display text-2xl text-ink">Phòng {task.room.number}</p>
                      <p className="text-[10px] text-muted-foreground">{task.room.roomType} · {task.room.floor ?? '—'}</p>
                    </div>
                    <Badge tone={task.status === 'PENDING' ? 'brand' : task.status === 'IN_PROGRESS' ? 'warning' : task.status === 'BLOCKED' ? 'danger' : 'success'}>
                      {STATUS_LABEL[task.status] ?? task.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    <Badge tone="outline">{task.type === 'DEEP_CLEAN' ? 'Dọn sâu' : task.type === 'TURNDOWN' ? 'Turn-down' : 'Dọn phòng'}</Badge>
                    {task.priority === 1 ? <Badge tone="danger"><TriangleAlert className="size-3" /> Ưu tiên</Badge> : null}
                    {task.assignedTo ? <span>{task.assignedTo.fullName}</span> : null}
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><ClipboardList className="size-3" /> Checklist</span>
                      <span>{done}/{total}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {task.status === 'PENDING' ? (
                      <Button size="sm" variant="secondary" disabled={!can('housekeeping:update')} loading={update.isPending} onClick={() => update.mutate({ id: task.id, status: 'IN_PROGRESS' })}><Sparkles /> Bắt đầu</Button>
                    ) : null}
                    {['IN_PROGRESS', 'PENDING'].includes(task.status) ? (
                      <Button size="sm" disabled={!can('housekeeping:update')} loading={update.isPending} onClick={() => update.mutate({ id: task.id, status: 'DONE' })}><CheckCheck /> Hoàn tất</Button>
                    ) : null}
                    {task.status === 'DONE' ? (
                      <Button size="sm" variant="secondary" disabled={!can('housekeeping:update')} onClick={() => update.mutate({ id: task.id, status: 'VERIFIED' })}>Kiểm tra</Button>
                    ) : null}
                    {!['DONE', 'VERIFIED', 'BLOCKED'].includes(task.status) ? (
                      <Button size="sm" variant="ghost" disabled={!can('housekeeping:update')} onClick={() => update.mutate({ id: task.id, status: 'BLOCKED' })}>Báo hỏng</Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone: string }) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-forest' : tone === 'warning' ? 'text-warning' : 'text-brand';
  return (
    <Card className="p-3">
      <p className="label-xs">{label}</p>
      <p className={cn('font-display text-2xl', color)}>{value}</p>
    </Card>
  );
}
