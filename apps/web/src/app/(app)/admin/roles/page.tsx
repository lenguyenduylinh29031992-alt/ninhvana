'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSION_GROUPS, roleName } from '@grand-suite/shared';
import { Lock, Pencil, ShieldCheck, Users } from 'lucide-react';
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
import { FieldError, Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAccess } from '@/lib/session';
import { cn } from '@/lib/utils';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface RoleInfo {
  code: string;
  name: string;
  nameEn: string;
  description: string | null;
  scope: 'ORG' | 'PROPERTY';
  level: number;
  permissions: Array<{ id: string; code: string; category: string }>;
  userCount: number;
}

interface PermissionInfo {
  code: string;
  resource: string;
  action: string;
  category: string;
  description: string | null;
}

export default function RolesPage() {
  const { can } = useAccess();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RoleInfo | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canManage = can('role:manage');

  const rolesQuery = useQuery<RoleInfo[]>({
    queryKey: ['roles'],
    queryFn: () => api<RoleInfo[]>('/roles'),
  });
  const permissionsQuery = useQuery<PermissionInfo[]>({
    queryKey: ['permissions'],
    queryFn: () => api<PermissionInfo[]>('/roles/permissions'),
    enabled: canManage,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api(`/roles/${editing?.code}/permissions`, {
        method: 'PATCH',
        body: { permissions: [...selected], reason },
      }),
    onSuccess: async () => {
      toast.success('Đã cập nhật quyền của vai trò');
      setEditing(null);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      await queryClient.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Không lưu được'),
  });

  const grouped = useMemo(() => {
    const permissions = permissionsQuery.data ?? [];
    return PERMISSION_GROUPS.map((group) => ({
      ...group,
      items: permissions.filter((permission) => group.match.test(permission.code)),
    })).filter((group) => group.items.length > 0);
  }, [permissionsQuery.data]);

  const openEditor = (role: RoleInfo) => {
    setEditing(role);
    setSelected(new Set(role.permissions.map((permission) => permission.code)));
    setReason('');
    setError(null);
  };

  if (!can('user:view')) return <PermissionNotice />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quản trị hệ thống"
        title="Vai trò & quyền"
        description="Ma trận quyền dùng chung cho API và giao diện. Thay đổi có hiệu lực với phiên đăng nhập mới và luôn kèm lý do kiểm toán."
        actions={
          <Badge tone="champagne">
            <ShieldCheck className="size-3" />
            {rolesQuery.data?.length ?? 0} vai trò
          </Badge>
        }
      />

      {rolesQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(rolesQuery.data ?? []).map((role) => (
            <Card key={role.code} className="group relative flex flex-col">
              <CardHeader className="flex-row items-start justify-between pb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{roleName(role.code, locale)}</CardTitle>
                    <Badge tone={role.scope === 'ORG' ? 'champagne' : 'outline'}>
                      {role.scope === 'ORG' ? 'Tập đoàn' : 'Cơ sở'}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {role.code} · cấp {role.level}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canManage || role.code === 'SUPER_ADMIN'}
                  onClick={() => openEditor(role)}
                  className={cn(
                    'focus-ring rounded-lg p-1.5 text-muted-foreground transition-colors',
                    canManage && role.code !== 'SUPER_ADMIN'
                      ? 'hover:bg-muted hover:text-ink'
                      : 'cursor-not-allowed opacity-30',
                  )}
                  aria-label={`Sửa quyền ${role.name}`}
                >
                  {role.code === 'SUPER_ADMIN' ? <Lock className="size-4" /> : <Pencil className="size-4" />}
                </button>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <p className="min-h-[40px] text-xs leading-relaxed text-muted-foreground">
                  {role.description ?? '—'}
                </p>
                <div className="flex items-center gap-4 border-t border-line/70 pt-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-champagne" />
                    {role.permissions.length} quyền
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3.5" />
                    {role.userCount} người dùng
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Quyền của {editing ? roleName(editing.code, locale) : ''}</DialogTitle>
            <DialogDescription>
              Bật/tắt từng quyền. Mọi thay đổi được ghi nhật ký kèm lý do và áp dụng cho phiên đăng nhập mới.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
            {grouped.map((group) => (
              <div key={group.key}>
                <p className="mb-2 text-2xs font-semibold uppercase tracking-label text-muted-foreground">
                  {locale === 'vi' ? group.label : group.labelEn}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {group.items.map((permission) => {
                    const checked = selected.has(permission.code);
                    return (
                      <label
                        key={permission.code}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] transition-colors',
                          checked
                            ? 'border-champagne/40 bg-champagne-soft/40 text-ink'
                            : 'border-line text-muted-foreground hover:bg-muted/50',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 size-3.5 accent-[hsl(var(--champagne))]"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(selected);
                            if (next.has(permission.code)) next.delete(permission.code);
                            else next.add(permission.code);
                            setSelected(next);
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block font-mono text-[10px] text-ink">{permission.code}</span>
                          <span className="block text-[10px] leading-snug text-muted-foreground">
                            {permission.description ?? permission.resource}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            <Label htmlFor="role-reason">Lý do thay đổi (bắt buộc)</Label>
            <Input
              id="role-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ví dụ: bổ sung quyền duyệt chi cho quản lý cơ sở"
            />
            <FieldError>{error ?? undefined}</FieldError>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">{selected.size} quyền được chọn</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                Huỷ
              </Button>
              <Button
                size="sm"
                loading={mutation.isPending}
                onClick={() => {
                  if (reason.trim().length < 5) {
                    setError('Vui lòng nhập lý do (ít nhất 5 ký tự)');
                    return;
                  }
                  setError(null);
                  mutation.mutate();
                }}
              >
                Lưu thay đổi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
