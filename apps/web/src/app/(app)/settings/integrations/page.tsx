'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cable, CheckCircle2, KeyRound, PlugZap, ShieldCheck, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/feedback';
import { FieldError, Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAccess } from '@/lib/session';
import { cn } from '@/lib/utils';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface IntegrationInfo {
  id: string;
  provider: string;
  category: string;
  displayName: string;
  status: 'DISABLED' | 'SANDBOX' | 'ACTIVE' | 'ERROR';
  hasCredentials: boolean;
  settings: unknown;
  lastCheckedAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  OTA: 'Kênh OTA',
  SOCIAL: 'Mạng xã hội & nhắn tin',
  PAYMENT: 'Cổng thanh toán',
  EINVOICE: 'Hoá đơn điện tử',
  EMAIL: 'Email',
  OCR: 'Nhận dạng chứng từ',
  LOCK: 'Khoá thông minh',
  OTHER: 'Khác',
};

const STATUS_META: Record<IntegrationInfo['status'], { label: string; tone: 'success' | 'brand' | 'neutral' | 'danger' }> = {
  ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
  SANDBOX: { label: 'Sandbox / Mock', tone: 'brand' },
  DISABLED: { label: 'Tắt', tone: 'neutral' },
  ERROR: { label: 'Lỗi kết nối', tone: 'danger' },
};

export default function IntegrationsPage() {
  const { can } = useAccess();
  const { formatDateTime } = useI18n();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<IntegrationInfo | null>(null);

  const canManage = can('integration:manage');

  const query = useQuery<IntegrationInfo[]>({
    queryKey: ['integrations'],
    queryFn: () => api<IntegrationInfo[]>('/integrations'),
    enabled: can('integration:view'),
  });

  if (!can('integration:view')) return <PermissionNotice />;

  const groups = new Map<string, IntegrationInfo[]>();
  for (const integration of query.data ?? []) {
    const list = groups.get(integration.category) ?? [];
    list.push(integration);
    groups.set(integration.category, list);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quản trị hệ thống"
        title="Tích hợp & kênh kết nối"
        description="Mỗi kênh là một connector độc lập theo cùng một giao diện: kéo đặt phòng, đẩy tồn phòng/giá, xử lý webhook. Mặc định chạy mock/sandbox."
        actions={
          <Badge tone="outline">
            <PlugZap className="size-3" />
            {query.data?.length ?? 0} connector
          </Badge>
        }
      />

      <div className="grid gap-3 rounded-xl border border-brand/25 bg-brand-soft/50 p-4 sm:grid-cols-[auto_1fr]">
        <ShieldCheck className="mt-0.5 size-5 text-brand" />
        <div className="text-[11px] leading-relaxed text-ink">
          <p className="font-medium">Kết nối an toàn, mock-first</p>
          <p className="mt-1 text-muted-foreground">
            Thông tin xác thực được mã hoá AES-256-GCM và không bao giờ trả lại qua API. Ở chế độ
            mock, connector mô phỏng đầy đủ pull/push, retry và dead-letter queue để demo trọn vẹn.
            Khi có API key thật, chỉ cần dán vào đây và chuyển trạng thái sang “Đang hoạt động”.
          </p>
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : (
        [...groups.entries()].map(([category, items]) => (
          <section key={category} className="space-y-2">
            <div className="flex items-center gap-2">
              <Cable className="size-3.5 text-brand" />
              <h2 className="text-xs font-semibold uppercase tracking-label text-muted-foreground">
                {CATEGORY_LABELS[category] ?? category}
              </h2>
              <span className="text-[10px] text-muted-foreground/70">{items.length}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((integration) => {
                const meta = STATUS_META[integration.status];
                return (
                  <Card key={integration.id} className="flex flex-col">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">{integration.displayName}</CardTitle>
                          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                            {integration.provider}
                          </p>
                        </div>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="mt-auto space-y-2">
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {integration.hasCredentials ? (
                          <>
                            <CheckCircle2 className="size-3 text-forest" /> Đã lưu thông tin xác thực
                          </>
                        ) : (
                          <>
                            <KeyRound className="size-3" /> Chưa cấu hình API key (mock)
                          </>
                        )}
                      </div>
                      {integration.lastError ? (
                        <p className="flex items-start gap-1 text-[10px] text-danger">
                          <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                          {integration.lastError}
                        </p>
                      ) : null}
                      <div className="flex items-center justify-between border-t border-line/70 pt-2">
                        <span className="text-[9px] text-muted-foreground">
                          {formatDateTime(integration.updatedAt)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!canManage}
                          onClick={() => setSelected(integration)}
                        >
                          Cấu hình
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))
      )}

      <ConfigureDialog
        integration={selected}
        onClose={() => setSelected(null)}
        onSaved={async () => {
          setSelected(null);
          await queryClient.invalidateQueries({ queryKey: ['integrations'] });
        }}
      />
    </div>
  );
}

function ConfigureDialog({
  integration,
  onClose,
  onSaved,
}: {
  integration: IntegrationInfo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState<IntegrationInfo['status']>('SANDBOX');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [initialised, setInitialised] = useState<string | null>(null);

  const key = integration?.id ?? '';
  if (key !== initialised) {
    setInitialised(key);
    setDisplayName(integration?.displayName ?? '');
    setStatus(integration?.status ?? 'SANDBOX');
    setApiKey('');
    setApiSecret('');
    setError(null);
  }

  const mutation = useMutation({
    mutationFn: () =>
      api(`/integrations/${integration?.provider}`, {
        method: 'PATCH',
        body: {
          displayName,
          status,
          ...(apiKey || apiSecret
            ? { credentials: { apiKey: apiKey || undefined, apiSecret: apiSecret || undefined } }
            : {}),
        },
      }),
    onSuccess: () => {
      toast.success('Đã lưu cấu hình kết nối');
      onSaved();
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Không lưu được'),
  });

  return (
    <Dialog
      open={Boolean(integration)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{integration?.displayName}</DialogTitle>
          <DialogDescription>
            Provider <span className="font-mono">{integration?.provider}</span> · thông tin xác thực
            được mã hoá trước khi lưu.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="int-name">Tên hiển thị</Label>
            <Input
              id="int-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="int-status">Trạng thái</Label>
            <NativeSelect
              id="int-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as IntegrationInfo['status'])}
            >
              <option value="SANDBOX">Sandbox / Mock</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="DISABLED">Tắt</option>
              <option value="ERROR">Lỗi kết nối</option>
            </NativeSelect>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="int-key">API Key / Token</Label>
              <Input
                id="int-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Để trống nếu không đổi"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="int-secret">Secret</Label>
              <Input
                id="int-secret"
                type="password"
                value={apiSecret}
                onChange={(event) => setApiSecret(event.target.value)}
                placeholder="Để trống nếu không đổi"
                autoComplete="off"
              />
            </div>
          </div>
          <p className={cn('rounded-lg bg-muted/60 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground')}>
            Với OTA/mạng xã hội, API key thật cần được nhà cung cấp phê duyệt và whitelist IP. Thiếu
            key, connector sẽ chạy ở chế độ mock phục vụ demo.
          </p>
          <FieldError>{error ?? undefined}</FieldError>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Huỷ
          </Button>
          <Button size="sm" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Lưu cấu hình
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
