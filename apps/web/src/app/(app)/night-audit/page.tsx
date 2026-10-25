'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, Coins, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError, Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionNotice } from '@/components/domain/permission-notice';

interface AuditRun {
  id: string;
  businessDate?: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  stats: Record<string, unknown> | null;
  error: string | null;
}

interface NightAuditReport {
  businessDate: string;
  audit: AuditRun | null;
  revenue: {
    total: number;
    taxes: number;
    serviceCharge: number;
    commissions: number;
    netAfterCommission: number;
    byDepartment: Array<{ department: string; amount: number }>;
    byChannel: Array<{ channelCode: string; channelName: string; amount: number }>;
  };
  payments: { total: number; byMethod: Array<{ method: string; amount: number }> };
  exceptions: {
    openFolios: Array<{ id: string; number: string; guest: string; balance: number }>;
    pendingArrivals: number;
    pendingDepartures: number;
    unpostedNights: number;
    dirtyRooms: number;
  };
  ledger: { debit: number; credit: number; balanced: boolean };
}

interface Check {
  key: string;
  label: string;
  expected: number;
  actual: number;
  difference: number;
  ok: boolean;
}

export default function NightAuditPage() {
  const { can } = useAccess();
  const { activeProperty, properties } = useActiveProperty();
  const queryClient = useQueryClient();
  const propertyId = activeProperty?.id ?? properties[0]?.id;
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const [error, setError] = useState<string | null>(null);

  const report = useQuery<NightAuditReport>({
    queryKey: ['night-audit', propertyId, date],
    queryFn: () => api<NightAuditReport>(`/night-audit/report?propertyId=${propertyId}&businessDate=${date}`),
    enabled: Boolean(propertyId) && Boolean(date) && can('night-audit:view'),
  });

  const checks = useQuery<{ checks: Check[]; balanced: boolean }>({
    queryKey: ['night-audit-checks', propertyId, date],
    queryFn: () => api(`/accounting/reconciliation?propertyId=${propertyId}&from=${date}&to=${date}`),
    enabled: Boolean(propertyId) && Boolean(date) && can('finance:view'),
  });

  const history = useQuery<AuditRun[]>({
    queryKey: ['night-audit-history', propertyId],
    queryFn: () => api<AuditRun[]>(`/night-audit/latest?propertyId=${propertyId}`),
    enabled: Boolean(propertyId) && can('night-audit:view'),
  });

  const run = useMutation({
    mutationFn: () =>
      api<NightAuditReport>('/night-audit/run', { method: 'POST', body: { propertyId, businessDate: date } }),
    onSuccess: async () => {
      toast.success(`Đã khoá sổ ngày ${date}`);
      await queryClient.invalidateQueries({ queryKey: ['night-audit'] });
      await queryClient.invalidateQueries({ queryKey: ['night-audit-history'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : 'Không chạy được kiểm toán'),
  });

  if (!can('night-audit:view')) return <PermissionNotice />;

  const data = report.data;
  const completed = data?.audit?.status === 'COMPLETED';

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Tài chính · Kiểm toán đêm"
        title="Night Audit"
        description="Khoá ngày nghiệp vụ, kết chuyển doanh thu phòng, hoa hồng OTA và đối soát sổ cái."
        actions={
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="audit-date" className="mb-1 block">Ngày nghiệp vụ</Label>
              <Input id="audit-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <Button size="sm" loading={run.isPending} disabled={!can('night-audit:run') || completed} onClick={() => { setError(null); run.mutate(); }}>
              <LockKeyhole /> {completed ? 'Đã khoá sổ' : 'Chạy kiểm toán'}
            </Button>
          </div>
        }
      />

      <FieldError>{error ?? undefined}</FieldError>

      {report.isLoading ? <Skeleton className="h-64 w-full" /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Doanh thu ngày" value={formatMoney(data?.revenue.total ?? 0)} hint={`Sau hoa hồng ${formatMoney(data?.revenue.netAfterCommission ?? 0)}`} icon={Coins} />
            <Kpi label="Thuế GTGT" value={formatMoney(data?.revenue.taxes ?? 0)} hint={`Phí dịch vụ ${formatMoney(data?.revenue.serviceCharge ?? 0)}`} icon={ClipboardCheck} />
            <Kpi label="Tiền thu" value={formatMoney(data?.payments.total ?? 0)} hint={`${data?.payments.byMethod.length ?? 0} phương thức`} icon={CheckCircle2} />
            <Kpi label="Trạng thái sổ" value={data?.ledger.balanced ? 'Cân bằng' : 'Lệch'} hint={`Nợ ${formatMoney(data?.ledger.debit ?? 0)} · Có ${formatMoney(data?.ledger.credit ?? 0)}`} icon={ShieldCheck} danger={!data?.ledger.balanced} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Doanh thu theo bộ phận</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(data?.revenue.byDepartment ?? []).map((row) => (
                  <div key={row.department}>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">{row.department}</span><span className="tabular">{formatMoney(row.amount)}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-brand" style={{ width: `${data?.revenue.total ? (row.amount / data.revenue.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
                {(data?.revenue.byDepartment ?? []).length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">Chưa có doanh thu cho ngày này.</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Thu tiền theo phương thức</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(data?.payments.byMethod ?? []).map((row) => (
                  <div key={row.method} className="flex items-center justify-between border-b border-line/60 py-1.5 text-xs">
                    <span className="text-muted-foreground">{row.method}</span>
                    <span className="tabular font-medium">{formatMoney(row.amount)}</span>
                  </div>
                ))}
                {(data?.payments.byMethod ?? []).length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">Chưa ghi nhận thanh toán.</p> : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Đối soát tự động</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead className="pl-5">Hạng mục</TableHead><TableHead className="text-right">Kỳ vọng</TableHead><TableHead className="text-right">Thực tế</TableHead><TableHead className="text-right">Lệch</TableHead><TableHead className="pr-5">Kết quả</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(checks.data?.checks ?? []).map((check) => (
                    <TableRow key={check.key}>
                      <TableCell className="pl-5 text-[11px]">{check.label}</TableCell>
                      <TableCell className="tabular text-right text-[11px]">{formatMoney(check.expected)}</TableCell>
                      <TableCell className="tabular text-right text-[11px]">{formatMoney(check.actual)}</TableCell>
                      <TableCell className="tabular text-right text-[11px]">{formatMoney(check.difference)}</TableCell>
                      <TableCell className="pr-5"><Badge tone={check.ok ? 'success' : 'danger'}>{check.ok ? 'Khớp' : 'Lệch'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Ngoại lệ cần xử lý</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Exception label="Khách chờ nhận phòng" value={data?.exceptions.pendingArrivals ?? 0} />
                <Exception label="Khách chưa trả phòng" value={data?.exceptions.pendingDepartures ?? 0} />
                <Exception label="Đêm chưa hạch toán" value={data?.exceptions.unpostedNights ?? 0} />
                <Exception label="Phòng chưa dọn" value={data?.exceptions.dirtyRooms ?? 0} />
                <div className="mt-3 border-t border-line pt-3">
                  <p className="label-xs mb-2">Folio còn số dư</p>
                  {(data?.exceptions.openFolios ?? []).slice(0, 6).map((folio) => (
                    <div key={folio.id} className="flex justify-between py-1 text-[10px]">
                      <span>{folio.number} · {folio.guest}</span><span className="tabular text-danger">{formatMoney(folio.balance)}</span>
                    </div>
                  ))}
                  {(data?.exceptions.openFolios ?? []).length === 0 ? <p className="text-[10px] text-muted-foreground">Không có folio còn nợ.</p> : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between"><CardTitle>Lịch sử khoá sổ</CardTitle><RotateCcw className="size-3.5 text-muted-foreground" /></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead className="pl-5">Ngày</TableHead><TableHead>Trạng thái</TableHead><TableHead className="pr-5 text-right">Hoàn tất</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(history.data ?? []).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="pl-5 text-[11px]">{item.businessDate ?? '—'}</TableCell>
                        <TableCell><Badge tone={item.status === 'COMPLETED' ? 'success' : item.status === 'FAILED' ? 'danger' : 'outline'}>{item.status}</Badge></TableCell>
                        <TableCell className="pr-5 text-right text-[10px] text-muted-foreground">{item.completedAt ? new Date(item.completedAt).toLocaleString('vi-VN') : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, icon: Icon, danger }: { label: string; value: string; hint: string; icon: typeof Coins; danger?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between"><span className="label-xs">{label}</span><Icon className={danger ? 'size-4 text-danger' : 'size-4 text-brand'} /></div>
      <p className={danger ? 'mt-2 font-display text-2xl text-danger' : 'mt-2 font-display text-2xl text-ink'}>{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
    </Card>
  );
}

function Exception({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={value > 0 ? 'font-medium text-warning' : 'text-muted-foreground'}>{value}</span>
    </div>
  );
}
