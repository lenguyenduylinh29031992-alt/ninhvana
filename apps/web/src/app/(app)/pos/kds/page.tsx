'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChefHat, Clock, Flame } from 'lucide-react';
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

interface Ticket {
  id: string;
  station: string;
  status: string;
  priority: number;
  notes: string | null;
  createdAt: string;
  order: { number: string; type: string; table: string | null; outlet: string };
  item: { name: string; quantity: number; notes: string | null } | null;
}

const COLUMNS = [
  { status: 'QUEUED', label: 'Chờ chế biến', icon: Clock, next: 'PREPARING', action: 'Bắt đầu' },
  { status: 'PREPARING', label: 'Đang làm', icon: Flame, next: 'READY', action: 'Xong món' },
  { status: 'READY', label: 'Sẵn sàng', icon: CheckCircle2, next: 'COMPLETED', action: 'Đã phục vụ' },
] as const;

export default function KdsPage() {
  const { can } = useAccess();
  const { activeProperty, properties } = useActiveProperty();
  const queryClient = useQueryClient();
  const propertyId =
    activeProperty?.id ?? properties.find((property) => property.type === 'HOTEL')?.id ?? properties[0]?.id;

  const tickets = useQuery<Ticket[]>({
    queryKey: ['kds', propertyId],
    queryFn: () => api<Ticket[]>(`/pos/kds/tickets?propertyId=${propertyId}`),
    enabled: Boolean(propertyId) && can('kds:view'),
    refetchInterval: 10_000,
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/pos/kds/tickets/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['kds'] }); },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không cập nhật được'),
  });

  if (!can('kds:view')) return <PermissionNotice />;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Vận hành · Bếp"
        title="Màn hình bếp (KDS)"
        description="Ticket từ POS tự động chuyển sang bếp/bar. Cập nhật trạng thái theo thời gian thực."
        actions={<Badge tone="brand"><ChefHat className="size-3" /> {tickets.data?.length ?? 0} ticket</Badge>}
      />
      {tickets.isLoading ? (
        <div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-40" />)}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {COLUMNS.map((column) => {
            const items = (tickets.data ?? []).filter((ticket) => ticket.status === column.status);
            const Icon = column.icon;
            return (
              <Card key={column.status} className="min-h-[300px]">
                <CardContent className="p-3">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-label text-muted-foreground">
                      <Icon className="size-3.5" /> {column.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((ticket) => (
                      <div key={ticket.id} className="rounded-xl border border-line bg-surface p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[9px] text-muted-foreground">{ticket.order.number}</span>
                          <Badge tone={ticket.priority === 1 ? 'danger' : 'outline'}>
                            {ticket.order.table ? `Bàn ${ticket.order.table}` : ticket.order.type}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm font-medium text-ink">
                          {ticket.item?.name ?? 'Món'} <span className="text-muted-foreground">×{ticket.item?.quantity ?? 1}</span>
                        </p>
                        {ticket.item?.notes ? <p className="mt-1 text-[10px] text-warning">“{ticket.item.notes}”</p> : null}
                        <p className="mt-1 text-[9px] text-muted-foreground">{ticket.station === 'BAR' ? 'Bar' : 'Bếp'} · {ticket.order.outlet}</p>
                        <Button
                          size="sm"
                          variant={column.status === 'READY' ? 'primary' : 'secondary'}
                          className="mt-2 w-full"
                          disabled={!can('kds:update')}
                          loading={update.isPending && update.variables?.id === ticket.id}
                          onClick={() => update.mutate({ id: ticket.id, status: column.next })}
                        >
                          {column.action}
                        </Button>
                      </div>
                    ))}
                    {items.length === 0 ? <p className="py-8 text-center text-[10px] text-muted-foreground">Trống</p> : null}
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
