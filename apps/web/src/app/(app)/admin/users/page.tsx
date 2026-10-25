'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roleName, type Paginated, type UserRecord } from '@grand-suite/shared';
import {
  KeyRound,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, PageHeader } from '@/components/ui/feedback';
import { FieldError, Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/primitives';
import { PermissionNotice } from '@/components/domain/permission-notice';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError, api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useActiveProperty } from '@/lib/property-context';
import { useAccess } from '@/lib/session';
import { cn } from '@/lib/utils';

interface RoleInfo {
  code: string;
  name: string;
  nameEn: string;
  scope: 'ORG' | 'PROPERTY';
  level: number;
  permissions: Array<{ code: string }>;
  userCount: number;
}

type UserForm = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  roleCode: string;
  propertyId: string;
  isActive: boolean;
};

const EMPTY_FORM: UserForm = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  roleCode: 'FRONT_DESK',
  propertyId: '',
  isActive: true,
};

export default function UsersPage() {
  const { can, user: sessionUser } = useAccess();
  const { t, locale, formatDateTime } = useI18n();
  const { properties } = useActiveProperty();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);

  const canManage = can('user:manage');

  const rolesQuery = useQuery<RoleInfo[]>({
    queryKey: ['roles'],
    queryFn: () => api<RoleInfo[]>('/roles'),
    enabled: canManage,
  });

  const usersQuery = useQuery<Paginated<UserRecord>>({
    queryKey: ['users', { search, roleFilter, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search.trim()) params.set('q', search.trim());
      if (roleFilter) params.set('roleCode', roleFilter);
      return api<Paginated<UserRecord>>(`/users?${params.toString()}`);
    },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api<UserRecord>(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      toast.success('Đã cập nhật người dùng');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Không cập nhật được'),
  });

  if (!can('user:view')) {
    return <PermissionNotice />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quản trị hệ thống"
        title={t('nav.users')}
        description="Tài khoản, vai trò theo cơ sở và trạng thái truy cập. Mọi thay đổi đều được ghi vào nhật ký kiểm toán."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <UserPlus />
              Thêm người dùng
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center gap-2 pb-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo tên, email, số điện thoại…"
              className="h-9 pl-8 text-xs"
            />
          </div>
          <NativeSelect
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value);
              setPage(1);
            }}
            className="h-9 w-auto min-w-[170px] text-xs"
          >
            <option value="">Tất cả vai trò</option>
            {(rolesQuery.data ?? []).map((role) => (
              <option key={role.code} value={role.code}>
                {roleName(role.code, locale)}
              </option>
            ))}
          </NativeSelect>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {usersQuery.data?.total ?? 0} tài khoản
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {usersQuery.isLoading ? (
            <div className="space-y-2 p-5">
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : (usersQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="Không có người dùng phù hợp"
              description="Thử xoá bộ lọc hoặc tạo tài khoản mới."
              className="m-5"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Người dùng</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead className="hidden md:table-cell">Cơ sở</TableHead>
                  <TableHead className="hidden lg:table-cell">Đăng nhập gần nhất</TableHead>
                  <TableHead>2FA</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="pr-5 text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.data?.items.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-champagne-soft text-[10px] font-semibold text-champagne">
                          {user.fullName
                            .split(' ')
                            .filter(Boolean)
                            .slice(-2)
                            .map((part) => part[0])
                            .join('')}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-ink">{user.fullName}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge key={role.id} tone="outline">
                            {roleName(role.roleCode, locale)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-[11px] text-muted-foreground">
                        {user.roles
                          .map((role) => role.propertyName)
                          .filter(Boolean)
                          .join(', ') || 'Toàn tập đoàn'}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-[11px] tabular text-muted-foreground">
                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Chưa đăng nhập'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {user.twoFactorEnabled ? (
                        <Badge tone="success">
                          <ShieldCheck className="size-3" /> Bật
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Tắt</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={user.isActive}
                          disabled={!canManage || user.id === sessionUser?.id}
                          onCheckedChange={(checked) =>
                            updateUser.mutate({ id: user.id, body: { isActive: checked } })
                          }
                          aria-label={`Kích hoạt ${user.fullName}`}
                        />
                        <span
                          className={cn(
                            'text-[10px] uppercase tracking-wide',
                            user.isActive ? 'text-forest' : 'text-muted-foreground',
                          )}
                        >
                          {user.isActive ? 'Hoạt động' : 'Khoá'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      {canManage ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Thao tác">
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setResetTarget(user)}>
                              <KeyRound className="size-4" />
                              Đặt lại mật khẩu
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              destructive
                              disabled={!user.isActive || user.id === sessionUser?.id}
                              onSelect={() => updateUser.mutate({ id: user.id, body: { isActive: false } })}
                            >
                              <UserX className="size-4" />
                              Vô hiệu hoá
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <p className="text-[11px] text-muted-foreground">
              Trang {usersQuery.data?.page ?? 1} / {usersQuery.data?.totalPages ?? 1}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Trước
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= (usersQuery.data?.totalPages ?? 1)}
                onClick={() => setPage((current) => current + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        roles={rolesQuery.data ?? []}
        properties={properties}
        onCreated={() => {
          setCreateOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['users'] });
        }}
      />

      <ResetPasswordDialog user={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  roles,
  properties,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleInfo[];
  properties: Array<{ id: string; name: string; code: string }>;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedRole = roles.find((role) => role.code === form.roleCode);
  const requiresProperty = selectedRole?.scope === 'PROPERTY';

  const mutation = useMutation({
    mutationFn: () =>
      api<UserRecord>('/users', {
        method: 'POST',
        body: {
          email: form.email,
          fullName: form.fullName,
          phone: form.phone || undefined,
          password: form.password,
          locale: 'vi',
          isActive: form.isActive,
          roles: [
            {
              roleCode: form.roleCode,
              propertyId: requiresProperty ? form.propertyId || null : null,
            },
          ],
        },
      }),
    onSuccess: () => {
      toast.success('Đã tạo người dùng mới');
      setForm(EMPTY_FORM);
      setErrors({});
      onCreated();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors();
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error('Không tạo được người dùng');
      }
    },
  });

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (form.fullName.trim().length < 2) nextErrors.fullName = 'Họ tên quá ngắn';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) nextErrors.email = 'Email không hợp lệ';
    if (form.password.length < 10) nextErrors.password = 'Mật khẩu tối thiểu 10 ký tự';
    if (!form.roleCode) nextErrors.roleCode = 'Chọn vai trò';
    if (requiresProperty && !form.propertyId) nextErrors.propertyId = 'Chọn cơ sở cho vai trò này';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm người dùng</DialogTitle>
          <DialogDescription>
            Tài khoản được gán vai trò theo cơ sở. Người dùng sẽ nhận mật khẩu tạm và buộc đổi sau khi đăng nhập.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fullName">{t('common.name')}</Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                placeholder="Nguyễn Văn A"
                aria-invalid={Boolean(errors.fullName)}
              />
              <FieldError>{errors.fullName}</FieldError>
            </div>
            <div>
              <Label htmlFor="email">{t('common.email')}</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="ten@grandsuite.vn"
                aria-invalid={Boolean(errors.email)}
              />
              <FieldError>{errors.email}</FieldError>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="phone">{t('common.phone')}</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="+84 …"
              />
            </div>
            <div>
              <Label htmlFor="password">Mật khẩu tạm</Label>
              <Input
                id="password"
                type="text"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="Tối thiểu 10 ký tự, có số"
                aria-invalid={Boolean(errors.password)}
              />
              <FieldError>{errors.password}</FieldError>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="role">{t('common.role')}</Label>
              <NativeSelect
                id="role"
                value={form.roleCode}
                onChange={(event) => setForm({ ...form, roleCode: event.target.value, propertyId: '' })}
              >
                {roles
                  .filter((role) => role.code !== 'SUPER_ADMIN')
                  .map((role) => (
                    <option key={role.code} value={role.code}>
                      {role.name} {role.scope === 'ORG' ? '(tập đoàn)' : ''}
                    </option>
                  ))}
              </NativeSelect>
              <FieldError>{errors.roleCode}</FieldError>
            </div>
            <div>
              <Label htmlFor="property">{t('common.property')}</Label>
              <NativeSelect
                id="property"
                value={form.propertyId}
                disabled={!requiresProperty}
                onChange={(event) => setForm({ ...form, propertyId: event.target.value })}
              >
                <option value="">{requiresProperty ? 'Chọn cơ sở' : 'Không áp dụng'}</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </NativeSelect>
              <FieldError>{errors.propertyId}</FieldError>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink">
            <Switch
              checked={form.isActive}
              onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
            />
            Kích hoạt ngay
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              {t('common.cancel')}
            </Button>
          </DialogClose>
          <Button size="sm" onClick={submit} loading={mutation.isPending}>
            <Plus />
            {t('common.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserRecord | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api(`/users/${user?.id}/reset-password`, {
        method: 'POST',
        body: { newPassword: password, requireChange: true, reason },
      }),
    onSuccess: () => {
      toast.success('Đã đặt lại mật khẩu, người dùng phải đổi khi đăng nhập');
      setPassword('');
      setReason('');
      setError(null);
      onClose();
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Không đặt lại được'),
  });

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đặt lại mật khẩu</DialogTitle>
          <DialogDescription>
            {user?.fullName} · {user?.email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="newPassword">Mật khẩu mới</Label>
            <Input
              id="newPassword"
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Tối thiểu 10 ký tự, có chữ và số"
            />
          </div>
          <div>
            <Label htmlFor="reason">Lý do</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ví dụ: nhân viên quên mật khẩu"
            />
          </div>
          <FieldError>{error ?? undefined}</FieldError>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (password.length < 10) return setError('Mật khẩu tối thiểu 10 ký tự');
              if (reason.trim().length < 5) return setError('Vui lòng nhập lý do');
              setError(null);
              mutation.mutate();
            }}
            loading={mutation.isPending}
          >
            <KeyRound />
            Đặt lại
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
