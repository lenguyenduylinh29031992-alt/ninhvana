'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { roleName } from '@grand-suite/shared';
import {
  Copy,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError, Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/feedback';
import { ApiError, api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAccess } from '@/lib/session';

interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

export default function ProfilePage() {
  const { user, refetch } = useAccess();
  const { t, locale, setLocale, formatDateTime } = useI18n();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setPhone('');
    }
  }, [user]);

  const profileMutation = useMutation({
    mutationFn: () =>
      api('/auth/profile', {
        method: 'PATCH',
        body: { fullName, ...(phone ? { phone } : {}), locale },
      }),
    onSuccess: async () => {
      toast.success('Đã cập nhật hồ sơ');
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      await refetch();
    },
    onError: (cause) => setProfileError(cause instanceof ApiError ? cause.message : 'Không lưu được'),
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      }),
    onSuccess: () => {
      toast.success('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
      queryClient.clear();
      router.replace('/login');
    },
    onError: (cause) => setPasswordError(cause instanceof ApiError ? cause.message : 'Không đổi được'),
  });

  const setupMutation = useMutation({
    mutationFn: () => api<TwoFactorSetup>('/auth/2fa/setup', { method: 'POST' }),
    onSuccess: (data) => {
      setSetup(data);
      setRecoveryCodes(null);
      setTotpCode('');
      setTwoFactorError(null);
    },
    onError: (cause) => setTwoFactorError(cause instanceof ApiError ? cause.message : 'Không khởi tạo được'),
  });

  const enableMutation = useMutation({
    mutationFn: () => api<{ recoveryCodes: string[] }>('/auth/2fa/enable', { method: 'POST', body: { code: totpCode } }),
    onSuccess: async (data) => {
      setRecoveryCodes(data.recoveryCodes);
      setSetup(null);
      toast.success('Đã bật xác thực hai lớp');
      await queryClient.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (cause) => setTwoFactorError(cause instanceof ApiError ? cause.message : 'Mã không hợp lệ'),
  });

  const disableMutation = useMutation({
    mutationFn: () =>
      api('/auth/2fa/disable', {
        method: 'POST',
        body: { code: disableCode, password: disablePassword },
      }),
    onSuccess: async () => {
      toast.success('Đã tắt xác thực hai lớp');
      setDisableCode('');
      setDisablePassword('');
      setTwoFactorError(null);
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      await refetch();
    },
    onError: (cause) => setTwoFactorError(cause instanceof ApiError ? cause.message : 'Không tắt được'),
  });

  if (!user) return null;

  const roleCodes = [...new Set(user.roles.map((role) => role.roleCode))];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Tài khoản"
        title={user.fullName}
        description="Hồ sơ cá nhân, bảo mật đăng nhập và xác thực hai lớp."
        actions={<Badge tone="champagne">{roleName(roleCodes[0] ?? '', locale)}</Badge>}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Hồ sơ</CardTitle>
              <CardDescription>Thông tin hiển thị trên giao diện và chứng từ nội bộ.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="fullName">Họ và tên</Label>
                  <Input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} />
                </div>
                <div>
                  <Label htmlFor="phone">Điện thoại</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+84 …"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="locale">Ngôn ngữ</Label>
                  <NativeSelect
                    id="locale"
                    value={locale}
                    onChange={(event) => setLocale(event.target.value as 'vi' | 'en')}
                  >
                    <option value="vi">Tiếng Việt</option>
                    <option value="en">English</option>
                  </NativeSelect>
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={user.email} disabled />
                </div>
              </div>
              <FieldError>{profileError ?? undefined}</FieldError>
              <div className="flex justify-end">
                <Button size="sm" loading={profileMutation.isPending} onClick={() => profileMutation.mutate()}>
                  Lưu hồ sơ
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Đổi mật khẩu</CardTitle>
              <CardDescription>Đổi mật khẩu sẽ thu hồi mọi phiên đăng nhập hiện có.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="newPassword">Mật khẩu mới</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Nhập lại</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <FieldError>{passwordError ?? undefined}</FieldError>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={passwordMutation.isPending}
                  onClick={() => {
                    if (newPassword.length < 10) return setPasswordError('Mật khẩu tối thiểu 10 ký tự');
                    if (newPassword !== confirmPassword) return setPasswordError('Mật khẩu nhập lại không khớp');
                    setPasswordError(null);
                    passwordMutation.mutate();
                  }}
                >
                  <KeyRound /> Đổi mật khẩu
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle className="text-lg">Xác thực hai lớp (TOTP)</CardTitle>
                <CardDescription>
                  Bảo vệ tài khoản bằng mã 6 số từ ứng dụng Authenticator. Khuyến nghị cho vai trò quản trị.
                </CardDescription>
              </div>
              <Badge tone={user.twoFactorEnabled ? 'success' : 'neutral'}>
                {user.twoFactorEnabled ? <ShieldCheck className="size-3" /> : <ShieldOff className="size-3" />}
                {user.twoFactorEnabled ? 'Đang bật' : 'Đang tắt'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {user.twoFactorEnabled ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Để tắt, nhập mật khẩu hiện tại và mã xác thực đang hiệu lực.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      type="password"
                      placeholder="Mật khẩu"
                      value={disablePassword}
                      onChange={(event) => setDisablePassword(event.target.value)}
                    />
                    <Input
                      placeholder="Mã 6 số"
                      inputMode="numeric"
                      value={disableCode}
                      onChange={(event) => setDisableCode(event.target.value)}
                    />
                  </div>
                  <FieldError>{twoFactorError ?? undefined}</FieldError>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={disableMutation.isPending}
                    onClick={() => {
                      setTwoFactorError(null);
                      disableMutation.mutate();
                    }}
                  >
                    <ShieldOff /> Tắt xác thực hai lớp
                  </Button>
                </div>
              ) : setup ? (
                <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
                  <img
                    src={setup.qrDataUrl}
                    alt="Mã QR xác thực hai lớp"
                    className="size-[180px] rounded-xl border border-line bg-white p-2"
                  />
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Quét mã QR bằng Google Authenticator / Authy, hoặc nhập thủ công khoá:
                    </p>
                    <code className="block break-all rounded-lg bg-muted px-2 py-1.5 font-mono text-[11px]">
                      {setup.secret}
                    </code>
                    <Input
                      placeholder="Nhập mã 6 số để xác nhận"
                      inputMode="numeric"
                      maxLength={6}
                      value={totpCode}
                      onChange={(event) => setTotpCode(event.target.value)}
                    />
                    <FieldError>{twoFactorError ?? undefined}</FieldError>
                    <Button
                      size="sm"
                      loading={enableMutation.isPending}
                      onClick={() => {
                        setTwoFactorError(null);
                        enableMutation.mutate();
                      }}
                    >
                      Bật xác thực
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" variant="secondary" loading={setupMutation.isPending} onClick={() => setupMutation.mutate()}>
                    <Smartphone /> Thiết lập ngay
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Sẽ hiển thị mã QR và 8 mã khôi phục dùng một lần.
                  </p>
                  <FieldError>{twoFactorError ?? undefined}</FieldError>
                </div>
              )}

              {recoveryCodes ? (
                <div className="rounded-xl border border-warning/25 bg-warning-soft p-3">
                  <p className="text-xs font-medium text-warning">Lưu 8 mã khôi phục này ngay</p>
                  <p className="mt-1 text-[10px] text-warning/80">
                    Mỗi mã chỉ dùng được một lần nếu mất thiết bị.
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px] text-ink">
                    {recoveryCodes.map((code) => (
                      <span key={code}>{code}</span>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => {
                      void navigator.clipboard.writeText(recoveryCodes.join('\n'));
                      toast.success('Đã sao chép mã khôi phục');
                    }}
                  >
                    <Copy /> Sao chép
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tài khoản</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <InfoRow icon={Mail} label="Email" value={user.email} />
              <InfoRow icon={UserRound} label="Mã người dùng" value={user.id.slice(-8)} />
              <InfoRow
                icon={MapPin}
                label="Phạm vi"
                value={user.orgWide ? 'Toàn tập đoàn' : `${user.properties.length} cơ sở`}
              />
              <InfoRow
                icon={Lock}
                label="Đăng nhập gần nhất"
                value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}
              />
              <div className="border-t border-line pt-3">
                <p className="label-xs mb-2">Vai trò</p>
                <div className="flex flex-wrap gap-1">
                  {roleCodes.map((code) => (
                    <Badge key={code} tone="outline">
                      {roleName(code, locale)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="label-xs mb-2">Cơ sở được truy cập</p>
                <ul className="space-y-1 text-[11px] text-muted-foreground">
                  {user.properties.map((property) => (
                    <li key={property.id}>
                      {property.name} · {property.code}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bảo mật phiên</CardTitle>
              <CardDescription>{t('auth.secureNotice')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-[11px] text-muted-foreground">
              <p>• Access token 15 phút, refresh token xoay vòng 30 ngày.</p>
              <p>• Phát hiện tái sử dụng refresh token sẽ thu hồi toàn bộ phiên.</p>
              <p>• Mọi thao tác nhạy cảm được ghi nhật ký bất biến.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-label text-muted-foreground">{label}</p>
        <p className="truncate text-[11px] text-ink">{value}</p>
      </div>
    </div>
  );
}
