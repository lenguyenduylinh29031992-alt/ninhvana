'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgePercent,
  Banknote,
  FileText,
  Globe2,
  Pencil,
  Plus,
  Save,
  Settings2,
  Sheet,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import type { ExchangeRateRecord, SettingRecord, TaxRateRecord } from '@grand-suite/shared';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/feedback';
import { FieldError, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError, api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAccess } from '@/lib/session';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface CurrencyInfo {
  code: string;
  name: string;
  nameEn: string;
  symbol: string;
  decimals: number;
  isActive: boolean;
}

interface TemplateInfo {
  id: string;
  type: string;
  name: string;
  locale: string;
  isDefault: boolean;
  updatedAt: string;
}

const SETTING_CATEGORY_LABELS: Record<string, string> = {
  branding: 'Nhận diện thương hiệu',
  finance: 'Tài chính',
  approval: 'Hạn mức phê duyệt',
  security: 'Bảo mật',
  operations: 'Vận hành',
  notifications: 'Thông báo',
  loyalty: 'Khách hàng thân thiết',
  rooms: 'Phòng',
  pos: 'Nhà hàng',
  general: 'Chung',
};

const TAX_TYPE_LABELS: Record<string, string> = {
  VAT: 'VAT',
  SERVICE_CHARGE: 'Phí dịch vụ',
  LODGING: 'Phí lưu trú',
  WITHHOLDING: 'Thuế khấu trừ',
  OTHER: 'Khác',
};

export default function SettingsPage() {
  const { can } = useAccess();
  const { formatDateTime } = useI18n();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('general');
  const [editingSetting, setEditingSetting] = useState<SettingRecord | null>(null);
  const [editingTax, setEditingTax] = useState<TaxRateRecord | 'new' | null>(null);
  const [fxOpen, setFxOpen] = useState(false);

  const canEdit = can('settings:update');

  const settings = useQuery<SettingRecord[]>({
    queryKey: ['settings'],
    queryFn: () => api<SettingRecord[]>('/settings'),
  });
  const taxes = useQuery<TaxRateRecord[]>({
    queryKey: ['tax-rates'],
    queryFn: () => api<TaxRateRecord[]>('/tax-rates'),
  });
  const rates = useQuery<ExchangeRateRecord[]>({
    queryKey: ['exchange-rates'],
    queryFn: () => api<ExchangeRateRecord[]>('/exchange-rates?base=USD'),
  });
  const currencies = useQuery<CurrencyInfo[]>({
    queryKey: ['currencies'],
    queryFn: () => api<CurrencyInfo[]>('/currencies'),
  });
  const templates = useQuery<TemplateInfo[]>({
    queryKey: ['document-templates'],
    queryFn: () => api<TemplateInfo[]>('/document-templates'),
  });

  const groupedSettings = useMemo(() => {
    const map = new Map<string, SettingRecord[]>();
    for (const setting of settings.data ?? []) {
      const list = map.get(setting.category) ?? [];
      list.push(setting);
      map.set(setting.category, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [settings.data]);

  if (!can('settings:view')) return <PermissionNotice />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quản trị hệ thống"
        title="Cấu hình hệ thống"
        description="Thuế, tỷ giá, quy tắc vận hành và mẫu in dùng chung cho toàn bộ cơ sở. Thay đổi nhạy cảm bắt buộc nhập lý do."
        actions={
          <Badge tone="outline">
            <Settings2 className="size-3" />
            {settings.data?.length ?? 0} khoá cấu hình
          </Badge>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="general">
            <Settings2 className="mr-1.5 size-3.5" /> Chung
          </TabsTrigger>
          <TabsTrigger value="taxes">
            <BadgePercent className="mr-1.5 size-3.5" /> Thuế & phí
          </TabsTrigger>
          <TabsTrigger value="fx">
            <Banknote className="mr-1.5 size-3.5" /> Tỷ giá
          </TabsTrigger>
          <TabsTrigger value="currencies">
            <Globe2 className="mr-1.5 size-3.5" /> Tiền tệ
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText className="mr-1.5 size-3.5" /> Mẫu in
          </TabsTrigger>
          {can('payroll:view') ? (
            <TabsTrigger value="sheets">
              <Sheet className="mr-1.5 size-3.5" /> Chấm công & lương
            </TabsTrigger>
          ) : null}
          {can('expense:view') ? (
            <TabsTrigger value="other-costs">
              <Receipt className="mr-1.5 size-3.5" /> Chi phí khác
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          {settings.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            groupedSettings.map(([category, items]) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="text-lg">{SETTING_CATEGORY_LABELS[category] ?? category}</CardTitle>
                  <CardDescription>Áp dụng cho phạm vi ghi trên từng khoá.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-5">Khoá</TableHead>
                        <TableHead>Giá trị</TableHead>
                        <TableHead className="hidden md:table-cell">Phạm vi</TableHead>
                        <TableHead className="hidden lg:table-cell">Cập nhật</TableHead>
                        <TableHead className="pr-5 text-right">Sửa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((setting) => (
                        <TableRow key={setting.id}>
                          <TableCell className="pl-5">
                            <span className="font-mono text-[11px] text-ink">{setting.key}</span>
                            {setting.description ? (
                              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                {setting.description}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-ink">
                              {typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value)}
                            </code>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge tone={setting.scope === 'ORG' ? 'brand' : 'outline'}>
                              {setting.scope === 'ORG' ? 'Tập đoàn' : setting.scope}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden text-[10px] text-muted-foreground lg:table-cell">
                            {formatDateTime(setting.updatedAt)}
                          </TableCell>
                          <TableCell className="pr-5 text-right">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={!canEdit}
                              onClick={() => setEditingSetting(setting)}
                              aria-label={`Sửa ${setting.key}`}
                            >
                              <Pencil />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="taxes">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Biểu thuế & phí</CardTitle>
                <CardDescription>
                  Áp dụng khi tính folio, hoá đơn và báo cáo. Không hardcode trong mã nguồn.
                </CardDescription>
              </div>
              {canEdit ? (
                <Button size="sm" variant="secondary" onClick={() => setEditingTax('new')}>
                  <Plus /> Thêm
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Mã</TableHead>
                    <TableHead>Tên</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Thuế suất</TableHead>
                    <TableHead className="hidden md:table-cell">Tài khoản GL</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="pr-5 text-right">Sửa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(taxes.data ?? []).map((tax) => (
                    <TableRow key={tax.id}>
                      <TableCell className="pl-5 font-mono text-[11px]">{tax.code}</TableCell>
                      <TableCell className="text-[12px]">{tax.name}</TableCell>
                      <TableCell>
                        <Badge tone="outline">{TAX_TYPE_LABELS[tax.type] ?? tax.type}</Badge>
                      </TableCell>
                      <TableCell className="tabular text-[13px] font-medium">
                        {Number(tax.rate).toFixed(0)}%
                      </TableCell>
                      <TableCell className="hidden font-mono text-[10px] text-muted-foreground md:table-cell">
                        {tax.glAccountCode ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge tone={tax.isActive ? 'success' : 'neutral'}>
                          {tax.isActive ? 'Đang dùng' : 'Tắt'}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={!canEdit}
                          onClick={() => setEditingTax(tax)}
                          aria-label={`Sửa ${tax.code}`}
                        >
                          <Pencil />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fx">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Tỷ giá quy đổi</CardTitle>
                <CardDescription>
                  Tỷ giá theo ngày, dùng để quy đổi USD/EUR/KRW/JPY/CNY về VND tại thời điểm chứng từ.
                </CardDescription>
              </div>
              {canEdit ? (
                <Button size="sm" variant="secondary" onClick={() => setFxOpen(true)}>
                  <Plus /> Thêm tỷ giá
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Ngày</TableHead>
                    <TableHead>Cặp tiền tệ</TableHead>
                    <TableHead>Tỷ giá</TableHead>
                    <TableHead className="hidden md:table-cell">Nguồn</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rates.data ?? []).slice(0, 40).map((rate) => (
                    <TableRow key={rate.id}>
                      <TableCell className="pl-5 text-[11px] tabular text-muted-foreground">
                        {rate.effectiveDate}
                      </TableCell>
                      <TableCell className="text-[12px] font-medium">
                        {rate.base}/{rate.quote}
                      </TableCell>
                      <TableCell className="tabular text-[13px]">
                        {Number(rate.rate).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="hidden text-[10px] text-muted-foreground md:table-cell">
                        {rate.source ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="px-5 py-3 text-[10px] text-muted-foreground">
                Hiển thị 40 bản ghi gần nhất · {rates.data?.length ?? 0} bản ghi tải về.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="currencies">
          <Card>
            <CardHeader>
              <CardTitle>Tiền tệ</CardTitle>
              <CardDescription>Tiền tệ cơ sở là VND; các ngoại tệ dùng để niêm yết và thanh toán.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Mã</TableHead>
                    <TableHead>Tên</TableHead>
                    <TableHead>Ký hiệu</TableHead>
                    <TableHead>Số thập phân</TableHead>
                    <TableHead className="pr-5">Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(currencies.data ?? []).map((currency) => (
                    <TableRow key={currency.code}>
                      <TableCell className="pl-5 font-mono text-[11px]">{currency.code}</TableCell>
                      <TableCell className="text-[12px]">{currency.name}</TableCell>
                      <TableCell className="text-[13px]">{currency.symbol}</TableCell>
                      <TableCell className="tabular text-[12px]">{currency.decimals}</TableCell>
                      <TableCell className="pr-5">
                        <Badge tone={currency.isActive ? 'success' : 'neutral'}>
                          {currency.isActive ? 'Hoạt động' : 'Tắt'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Mẫu in chứng từ</CardTitle>
              <CardDescription>Folio, hoá đơn GTGT, phiếu đăng ký, BEO và phiếu lương.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Loại</TableHead>
                    <TableHead>Tên mẫu</TableHead>
                    <TableHead>Ngôn ngữ</TableHead>
                    <TableHead className="hidden md:table-cell">Mặc định</TableHead>
                    <TableHead className="pr-5">Cập nhật</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(templates.data ?? []).map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="pl-5">
                        <Badge tone="outline">{template.type}</Badge>
                      </TableCell>
                      <TableCell className="text-[12px]">{template.name}</TableCell>
                      <TableCell className="text-[11px] uppercase">{template.locale}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {template.isDefault ? <Badge tone="brand">Mặc định</Badge> : '—'}
                      </TableCell>
                      <TableCell className="pr-5 text-[10px] text-muted-foreground">
                        {formatDateTime(template.updatedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        {can('payroll:view') ? (
          <TabsContent value="sheets">
            <SheetSettings canManage={can('payroll:manage')} />
          </TabsContent>
        ) : null}
        {can('expense:view') ? (
          <TabsContent value="other-costs">
            <OtherCostSettings canManage={can('expense:create')} />
          </TabsContent>
        ) : null}
      </Tabs>

      <SettingDialog
        setting={editingSetting}
        onClose={() => setEditingSetting(null)}
        onSaved={async () => {
          setEditingSetting(null);
          await queryClient.invalidateQueries({ queryKey: ['settings'] });
        }}
      />
      <TaxDialog
        value={editingTax}
        onClose={() => setEditingTax(null)}
        onSaved={async () => {
          setEditingTax(null);
          await queryClient.invalidateQueries({ queryKey: ['tax-rates'] });
        }}
      />
      <ExchangeRateDialog
        open={fxOpen}
        onOpenChange={setFxOpen}
        onSaved={async () => {
          setFxOpen(false);
          await queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
        }}
      />
    </div>
  );
}

function SettingDialog({
  setting,
  onClose,
  onSaved,
}: {
  setting: SettingRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isSensitive = setting
    ? ['approval.', 'security.', 'finance.'].some((prefix) => setting.key.startsWith(prefix))
    : false;

  const mutation = useMutation({
    mutationFn: () => {
      let parsed: unknown = value;
      try {
        parsed = JSON.parse(value);
      } catch {
        /* treat as plain string */
      }
      return api('/settings', {
        method: 'PUT',
        body: {
          scope: setting?.scope ?? 'ORG',
          key: setting?.key,
          value: parsed,
          category: setting?.category,
          reason: reason || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success('Đã lưu cấu hình');
      onSaved();
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Không lưu được'),
  });

  return (
    <Dialog
      open={Boolean(setting)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl">{setting?.key}</DialogTitle>
          <DialogDescription>
            Phạm vi {setting?.scope === 'ORG' ? 'tập đoàn' : setting?.scope}. Giá trị JSON hoặc chuỗi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="setting-value">Giá trị</Label>
            <Textarea
              id="setting-value"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="font-mono text-xs"
              placeholder='Ví dụ: 5 hoặc {"threshold": 5000000}'
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="setting-reason">
              Lý do {isSensitive ? <span className="text-danger">*</span> : '(tuỳ chọn)'}
            </Label>
            <Input
              id="setting-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ví dụ: cập nhật hạn mức duyệt chi quý 4"
            />
          </div>
          <FieldError>{error ?? undefined}</FieldError>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            size="sm"
            loading={mutation.isPending}
            onClick={() => {
              if (isSensitive && reason.trim().length < 5) {
                setError('Cấu hình tài chính bảo mật cần lý do ít nhất 5 ký tự');
                return;
              }
              setError(null);
              mutation.mutate();
            }}
          >
            <Save /> Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaxDialog({
  value,
  onClose,
  onSaved,
}: {
  value: TaxRateRecord | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = value === 'new';
  const existing = isNew ? null : value;
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [rate, setRate] = useState('8');
  const [type, setType] = useState('VAT');
  const [glAccountCode, setGlAccountCode] = useState('3331');
  const [isActive, setIsActive] = useState(true);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [initialised, setInitialised] = useState<string | null>(null);

  // Reset local state whenever a different record is opened.
  const key = isNew ? 'new' : (existing?.id ?? '');
  if (key !== initialised) {
    setInitialised(key);
    setCode(existing?.code ?? '');
    setName(existing?.name ?? '');
    setRate(existing ? String(Number(existing.rate)) : '8');
    setType(existing?.type ?? 'VAT');
    setGlAccountCode(existing?.glAccountCode ?? '3331');
    setIsActive(existing?.isActive ?? true);
    setReason('');
    setError(null);
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (isNew) {
        return api('/tax-rates', {
          method: 'POST',
          body: {
            code: code.toUpperCase(),
            name,
            rate: Number(rate),
            type,
            isIncluded: false,
            glAccountCode,
            isActive,
          },
        });
      }
      return api(`/tax-rates/${existing?.id}`, {
        method: 'PATCH',
        body: {
          name,
          rate: Number(rate),
          type,
          glAccountCode,
          isActive,
          reason: reason || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success('Đã lưu biểu thuế');
      onSaved();
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Không lưu được'),
  });

  return (
    <Dialog
      open={Boolean(value)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? 'Thêm biểu thuế' : 'Sửa biểu thuế'}</DialogTitle>
          <DialogDescription>Áp dụng cho dòng folio và hoá đơn mới.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tax-code">Mã</Label>
              <Input
                id="tax-code"
                value={code}
                disabled={!isNew}
                onChange={(event) => setCode(event.target.value)}
                placeholder="VAT8"
              />
            </div>
            <div>
              <Label htmlFor="tax-type">Loại</Label>
              <NativeSelect id="tax-type" value={type} onChange={(event) => setType(event.target.value)}>
                {Object.entries(TAX_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div>
            <Label htmlFor="tax-name">Tên hiển thị</Label>
            <Input id="tax-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tax-rate">Thuế suất (%)</Label>
              <Input
                id="tax-rate"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="tax-gl">Tài khoản GL</Label>
              <Input
                id="tax-gl"
                value={glAccountCode}
                onChange={(event) => setGlAccountCode(event.target.value)}
                placeholder="3331"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            Đang áp dụng
          </label>
          {!isNew ? (
            <div>
              <Label htmlFor="tax-reason">Lý do thay đổi (bắt buộc nếu đổi thuế suất)</Label>
              <Input
                id="tax-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Theo Nghị quyết …"
              />
            </div>
          ) : null}
          <FieldError>{error ?? undefined}</FieldError>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            size="sm"
            loading={mutation.isPending}
            onClick={() => {
              if (!name.trim() || (!existing && !code.trim())) {
                setError('Vui lòng nhập mã và tên');
                return;
              }
              setError(null);
              mutation.mutate();
            }}
          >
            <Save /> Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExchangeRateDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [base, setBase] = useState('USD');
  const [rate, setRate] = useState('26000');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api('/exchange-rates', {
        method: 'POST',
        body: { base, quote: 'VND', rate: Number(rate), effectiveDate: date, source: 'manual' },
      }),
    onSuccess: () => {
      toast.success('Đã lưu tỷ giá');
      onSaved();
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Không lưu được'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm tỷ giá</DialogTitle>
          <DialogDescription>Quy đổi về VND, áp dụng cho chứng từ phát sinh từ ngày đã chọn.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fx-base">Ngoại tệ</Label>
              <NativeSelect id="fx-base" value={base} onChange={(event) => setBase(event.target.value)}>
                {['USD', 'EUR', 'KRW', 'JPY', 'CNY'].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="fx-date">Ngày hiệu lực</Label>
              <Input id="fx-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="fx-rate">Tỷ giá (1 {base} = ? VND)</Label>
            <Input
              id="fx-rate"
              type="number"
              step="0.0001"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              className="tabular"
            />
          </div>
          <FieldError>{error ?? undefined}</FieldError>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            size="sm"
            loading={mutation.isPending}
            onClick={() => {
              if (!date || Number(rate) <= 0) {
                setError('Ngày và tỷ giá phải hợp lệ');
                return;
              }
              setError(null);
              mutation.mutate();
            }}
          >
            <Save /> Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}



interface SheetDepartment { code: string; name: string }

interface SheetSource {
  key: string;
  url: string;
  label: string | null;
  department: string;
  enabled: boolean;
  status: string;
  message: string | null;
  rows: number;
  lastSyncedAt: string | null;
  period: string | null;
  gid: string | null;
}

function SheetSettings({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, { url: string; label: string; department: string; enabled: boolean; gid: string }>>({});
  const [newKind, setNewKind] = useState<'attendance' | 'payroll'>('attendance');
  const [newGid, setNewGid] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('TIKTOK');
  const [filterPeriod, setFilterPeriod] = useState(new Date().toISOString().slice(0, 7));
  const sources = useQuery<SheetSource[]>({ queryKey: ['sheet-config'], queryFn: () => api('/hr/sheets/config') });
  const departments = useQuery<SheetDepartment[]>({ queryKey: ['sheet-departments'], queryFn: () => api('/hr/departments') });
  useEffect(() => {
    if (!sources.data) return;
    setDrafts(Object.fromEntries(sources.data.map((source) => [source.key, { url: source.url, label: source.label ?? '', department: source.department, enabled: source.enabled, gid: source.gid ?? '' }])));
  }, [sources.data]);
  const save = useMutation({
    mutationFn: (payload: { key: string; url: string; label: string; department: string; enabled: boolean; gid: string; period: string | null }) =>
      api('/hr/sheets/config', { method: 'PUT', body: payload }),
    onSuccess: async () => { toast.success('Đã lưu cấu hình Google Sheet'); await queryClient.invalidateQueries({ queryKey: ['sheet-config'] }); },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không lưu được cấu hình'),
  });
  const syncAll = useMutation({
    mutationFn: () => api(`/hr/sheets/sync?period=${new Date().toISOString().slice(0, 7)}`, { method: 'POST' }),
    onSuccess: async () => { toast.success('Đã bắt đầu đồng bộ Google Sheet tháng hiện tại'); await queryClient.invalidateQueries({ queryKey: ['sheet-config'] }); },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không đồng bộ được'),
  });
  const visibleSources = (sources.data ?? []).filter((source) => source.key.split(':')[0] !== 'shopping'
    && (filterDepartment === 'ALL' || source.department === filterDepartment)
    && (!filterPeriod || source.period === filterPeriod));
  const departmentCodes = [filterDepartment];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div><CardTitle>Chấm công & tính lương từ Google Sheet</CardTitle><CardDescription>Mỗi nguồn gắn với một bộ phận. Dán link Google Sheet công khai hoặc link export CSV; hệ thống tự đồng bộ mỗi 15 phút.</CardDescription></div>
        <Button size="sm" variant="secondary" disabled={!canManage || syncAll.isPending} onClick={() => syncAll.mutate()}><RefreshCw className={syncAll.isPending ? 'animate-spin' : ''} /> Đồng bộ tất cả</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-muted/20 p-3">
          <div className="min-w-44"><Label>Bộ phận</Label><NativeSelect aria-label="Lọc bộ phận chấm công" value={filterDepartment} onChange={(event) => setFilterDepartment(event.target.value)}>{(departments.data ?? []).map((department) => <option key={department.code} value={department.code}>{department.name}</option>)}{!(departments.data ?? []).some((department) => department.code === filterDepartment) ? <option value={filterDepartment}>{filterDepartment}</option> : null}</NativeSelect></div>
          <div className="min-w-40"><Label>Ngày tháng</Label><Input aria-label="Lọc tháng chấm công" type="month" value={filterPeriod} onChange={(event) => setFilterPeriod(event.target.value)} /></div>
          <Badge tone="outline">{visibleSources.length} nguồn</Badge>
          <span className="ml-auto text-[10px] text-muted-foreground">Chỉ hiển thị đúng bộ phận và tháng; form bên dưới thêm nhanh đúng kỳ.</span>
        </div>
        <div className="rounded-xl border border-dashed border-brand/40 bg-brand-soft/30 p-3">
          <p className="mb-2 text-sm font-medium text-ink">Thêm nhanh tab Google Sheet</p>
          <div className="grid gap-2 md:grid-cols-[0.9fr_0.8fr_1.5fr_auto]">
            <div><Label>Loại</Label><NativeSelect value={newKind} onChange={(e) => setNewKind(e.target.value as typeof newKind)}><option value="attendance">Chấm công</option><option value="payroll">Tính lương</option></NativeSelect></div>
            <div><Label>GID</Label><Input value={newGid} onChange={(e) => setNewGid(e.target.value)} placeholder="536156494" /></div>
            <div><Label>Link Google Sheet</Label><Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/..." /></div>
            <div className="flex items-end"><Button size="sm" disabled={!canManage || !newGid || !newUrl || save.isPending} onClick={() => save.mutate({ key: `${newKind}:${filterPeriod}:${filterDepartment}`, url: newUrl, label: `${newKind === 'attendance' ? 'Chấm công' : 'Tính lương'} ${filterPeriod}`, department: filterDepartment, enabled: true, gid: newGid, period: filterPeriod })}>Thêm</Button></div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Đang thêm cho {filterDepartment} · {filterPeriod}. Đổi bộ phận/tháng ở hàng lọc phía trên; hệ thống dùng đúng gid của kỳ đó.</p>
        </div>
        {departmentCodes.map((departmentCode) => {
          const departmentName = departments.data?.find((department) => department.code === departmentCode)?.name ?? departmentCode;
          const departmentSources = visibleSources.filter((source) => source.department === departmentCode);
          return (
            <div key={departmentCode} className="space-y-2 rounded-xl border border-line bg-muted/20 p-3">
              <div className="flex items-center justify-between border-b border-line/70 pb-2"><div><p className="font-display text-lg text-ink">{departmentName}</p><p className="text-[10px] uppercase tracking-label text-muted-foreground">Chấm công · tính lương</p></div><Badge tone="outline">{departmentSources.length} nguồn</Badge></div>
              {departmentSources.length === 0 ? <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-muted-foreground">Chưa có tab Google Sheet cho {departmentName} trong tháng này. Thêm nhanh ở trên.</p> : null}
              {departmentSources.map((source) => {
                const draft = drafts[source.key] ?? { url: source.url, label: source.label ?? '', department: source.department, enabled: source.enabled, gid: source.gid ?? '' };
                const kind = source.key.split(':')[0];
                const title = kind === 'attendance' ? 'Chấm công' : 'Tính lương';
                return (
                  <div key={source.key} className="rounded-xl border border-line bg-surface p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium text-ink">{title}{source.period ? ` · ${source.period}` : ''}</p><p className="text-[10px] text-muted-foreground">{source.rows} dòng · {source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString('vi-VN') : 'Chưa đồng bộ'} · {source.status}</p></div><Badge tone={source.enabled ? 'success' : 'neutral'}>{source.enabled ? 'Đang bật' : 'Đã tắt'}</Badge></div>
                    <div className="grid gap-2 md:grid-cols-[1.6fr_1fr_0.7fr_0.7fr_auto]">
                      <div><Label>Link Google Sheet</Label><Input value={draft.url} disabled={!canManage} onChange={(e) => setDrafts((current) => ({ ...current, [source.key]: { ...draft, url: e.target.value } }))} /></div>
                      <div><Label>Tên hiển thị</Label><Input value={draft.label} disabled={!canManage} onChange={(e) => setDrafts((current) => ({ ...current, [source.key]: { ...draft, label: e.target.value } }))} /></div>
                      <div><Label>Bộ phận</Label><Input value={draft.department} disabled={!canManage} onChange={(e) => setDrafts((current) => ({ ...current, [source.key]: { ...draft, department: e.target.value.toUpperCase() } }))} /></div>
                      <div><Label>GID</Label><Input value={draft.gid} disabled={!canManage} onChange={(e) => setDrafts((current) => ({ ...current, [source.key]: { ...draft, gid: e.target.value } }))} /></div>
                      <div className="flex items-end gap-2"><Button size="sm" disabled={!canManage || save.isPending} onClick={() => save.mutate({ key: source.key, url: draft.url, label: draft.label, department: draft.department, enabled: draft.enabled, gid: draft.gid, period: source.period })}>Lưu</Button><Button size="sm" variant="secondary" disabled={!canManage} onClick={() => setDrafts((current) => ({ ...current, [source.key]: { ...draft, enabled: !draft.enabled } }))}>{draft.enabled ? 'Tắt' : 'Bật'}</Button></div>
                    </div>
                    {source.message ? <p className="mt-2 text-[10px] text-muted-foreground">{source.message}</p> : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function OtherCostSettings({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [department, setDepartment] = useState('TIKTOK');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [drafts, setDrafts] = useState<Record<string, { url: string; label: string; enabled: boolean; gid: string }>>({});
  const [newUrl, setNewUrl] = useState('');
  const [newGid, setNewGid] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const sources = useQuery<SheetSource[]>({ queryKey: ['sheet-config'], queryFn: () => api('/hr/sheets/config') });
  const departments = useQuery<SheetDepartment[]>({ queryKey: ['sheet-departments'], queryFn: () => api('/hr/departments') });
  useEffect(() => {
    if (!sources.data) return;
    setDrafts(Object.fromEntries(sources.data.map((source) => [source.key, { url: source.url, label: source.label ?? '', enabled: source.enabled, gid: source.gid ?? '' }])));
  }, [sources.data]);
  const save = useMutation({
    mutationFn: (payload: { key: string; url: string; label: string; department: string; enabled: boolean; gid: string; period: string | null }) =>
      api('/hr/sheets/config', { method: 'PUT', body: payload }),
    onSuccess: async () => { toast.success('Đã lưu cấu hình Chi phí khác'); await queryClient.invalidateQueries({ queryKey: ['sheet-config'] }); },
    onError: (cause) => toast.error(cause instanceof ApiError ? cause.message : 'Không lưu được cấu hình'),
  });
  const rows = (sources.data ?? []).filter((source) => source.key.split(':')[0] === 'shopping' && source.department === department && source.period === period);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chi phí khác</CardTitle>
        <CardDescription>Google Sheet chi phí đi chợ / mua sắm. Chọn bộ phận, năm và tháng để chỉ hiển thị cấu hình của tháng đó.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-muted/20 p-3">
          <div className="min-w-48"><Label>Bộ phận</Label><NativeSelect aria-label="Chọn bộ phận chi phí khác" value={department} onChange={(event) => setDepartment(event.target.value)}>{(departments.data ?? []).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}{!(departments.data ?? []).some((item) => item.code === department) ? <option value={department}>{department}</option> : null}</NativeSelect></div>
          <div className="min-w-40"><Label>Ngày tháng</Label><Input aria-label="Chọn tháng chi phí khác" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></div>
          <Badge tone="outline">{period} · {rows.length} nguồn</Badge>
          <span className="ml-auto text-[10px] text-muted-foreground">Chỉ hiển thị cấu hình đúng bộ phận và tháng.</span>
        </div>

        {rows.length === 0 ? <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-muted-foreground">Chưa có cấu hình Chi phí khác cho {department} tháng {period}.</p> : null}
        {rows.map((source) => {
          const draft = drafts[source.key] ?? { url: source.url, label: source.label ?? '', enabled: source.enabled, gid: source.gid ?? '' };
          return (
            <div key={source.key} className="space-y-2 rounded-xl border border-line bg-muted/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium text-ink">Chi phí khác · {period}</p><p className="text-[10px] text-muted-foreground">{source.rows} dòng · {source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString('vi-VN') : 'Chưa đồng bộ'} · {source.status}</p></div><Badge tone={source.enabled ? 'success' : 'neutral'}>{source.enabled ? 'Đang bật' : 'Đã tắt'}</Badge></div>
              <div className="grid gap-2 md:grid-cols-[1.5fr_1fr_0.7fr_auto]">
                <div><Label>Link Google Sheet</Label><Input value={draft.url} disabled={!canManage} onChange={(event) => setDrafts((current) => ({ ...current, [source.key]: { ...draft, url: event.target.value } }))} /></div>
                <div><Label>Tên hiển thị</Label><Input value={draft.label} disabled={!canManage} onChange={(event) => setDrafts((current) => ({ ...current, [source.key]: { ...draft, label: event.target.value } }))} /></div>
                <div><Label>GID</Label><Input value={draft.gid} disabled={!canManage} onChange={(event) => setDrafts((current) => ({ ...current, [source.key]: { ...draft, gid: event.target.value } }))} /></div>
                <div className="flex items-end gap-2"><Button size="sm" disabled={!canManage || save.isPending} onClick={() => save.mutate({ key: source.key, url: draft.url, label: draft.label, department, enabled: draft.enabled, gid: draft.gid, period })}>Lưu</Button><Button size="sm" variant="secondary" disabled={!canManage} onClick={() => setDrafts((current) => ({ ...current, [source.key]: { ...draft, enabled: !draft.enabled } }))}>{draft.enabled ? 'Tắt' : 'Bật'}</Button></div>
              </div>
              {source.message ? <p className="text-[10px] text-muted-foreground">{source.message}</p> : null}
            </div>
          );
        })}

        <div className="rounded-xl border border-dashed border-brand/40 bg-brand-soft/30 p-3">
          <p className="mb-2 text-sm font-medium text-ink">Thêm cấu hình Chi phí khác cho {department} · {period}</p>
          <div className="grid gap-2 md:grid-cols-[1.5fr_0.8fr_1fr_auto]">
            <div><Label>Link Google Sheet</Label><Input value={newUrl} onChange={(event) => setNewUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/..." /></div>
            <div><Label>GID</Label><Input value={newGid} onChange={(event) => setNewGid(event.target.value)} placeholder="1350094361" /></div>
            <div><Label>Tên hiển thị</Label><Input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder={`Chi phí khác ${period}`} /></div>
            <div className="flex items-end"><Button size="sm" disabled={!canManage || !newUrl || !newGid || save.isPending} onClick={() => save.mutate({ key: `shopping:${period}:${department}`, url: newUrl, label: newLabel || `Chi phí khác ${period}`, department, enabled: true, gid: newGid, period })}>Thêm</Button></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
