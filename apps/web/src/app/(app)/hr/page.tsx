'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, ExternalLink, HandCoins, Loader2, Plus, RefreshCw, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { ExportMenu } from '@/components/domain/export-menu';
import { PermissionNotice } from '@/components/domain/permission-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Employee { id: string; code: string; fullName: string; position: string; department: string; baseSalary: number; status: string }
interface Attendance { id: string; employeeId: string; date: string; hours: number; status: string; employee: { id: string; code: string; fullName: string; department: string } }
interface Department { code: string; name: string; nameEn: string | null; division: string; group: string; isRevenueCenter: boolean; sortOrder: number }
interface PayrollLine { employeeId: string; employeeCode: string; employeeName: string; gross: number; advanceAmount: number; net: number }
interface Run { id: string; period: string; status: string; gross: number; net: number; deductions: number; lines: PayrollLine[] }
interface SheetSync { key: string; lastSyncedAt: string | null; status: string; message: string | null; rows: number }

const SHEETS = {
  attendance: 'https://docs.google.com/spreadsheets/d/1jb5s3KvVwZJyDqTr4_QZI7gUeKJS9WAyM_9jz6blBLE/edit?gid=536156494#gid=536156494',
  payroll: 'https://docs.google.com/spreadsheets/d/1bBYbKMhKxJkMJxVV2boIrO4lPYnCHrC-RKTiMWpppVE/edit?gid=0#gid=0',
  shopping: 'https://docs.google.com/spreadsheets/d/15H1_7oQ28ejuHiIOXlmZeeZDpN02eajQGLynmPhxjM4/edit?gid=1350094361#gid=1350094361',
};
const MONTH_START = '2026-10-01';
const MONTH_END = '2026-10-31';
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

const STATUS_META: Record<string, { label: string; symbol: string; className: string }> = {
  PRESENT: { label: 'Đủ công', symbol: '●', className: 'text-forest' },
  HALF_DAY: { label: 'Nửa công', symbol: '◐', className: 'text-warning' },
  WEEKLY_OFF: { label: 'Nghỉ tuần', symbol: '—', className: 'text-muted-foreground/50' },
  ABSENT: { label: 'Vắng', symbol: '×', className: 'text-danger' },
};

export default function HrPage() {
  const { can } = useAccess();
  const [selectedCode, setSelectedCode] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const { activeProperty, properties } = useActiveProperty();
  const propertyId = activeProperty?.id ?? properties.find((property) => property.type === 'HOTEL')?.id ?? properties[0]?.id;
  const enabled = Boolean(propertyId) && can('payroll:view');
  const employees = useQuery<Employee[]>({ queryKey: ['employees', propertyId], queryFn: () => api(`/hr/employees?propertyId=${propertyId}`), enabled });
  const attendance = useQuery<Attendance[]>({ queryKey: ['attendance', propertyId, MONTH_START, MONTH_END], queryFn: () => api(`/hr/attendance?propertyId=${propertyId}&from=${MONTH_START}&to=${MONTH_END}`), enabled });
  const runs = useQuery<Run[]>({ queryKey: ['payroll', propertyId], queryFn: () => api(`/hr/payroll?propertyId=${propertyId}`), enabled });
  const departments = useQuery<Department[]>({ queryKey: ['departments', propertyId], queryFn: () => api(`/hr/departments?propertyId=${propertyId}`), enabled });
  const sheetStatus = useQuery<SheetSync[]>({ queryKey: ['sheet-sync', propertyId], queryFn: () => api(`/hr/sheets/status?propertyId=${propertyId}`), enabled, refetchInterval: 60_000 });
  const queryClient = useQueryClient();
  const syncSheets = useMutation({ mutationFn: (key?: 'attendance' | 'payroll' | 'shopping') => api(key ? `/hr/sheets/${key}/sync?propertyId=${propertyId}` : `/hr/sheets/sync?propertyId=${propertyId}`, { method: 'POST', body: {} }), onSuccess: async () => { toast.success('Đã đồng bộ Google Sheet'); await Promise.all([queryClient.invalidateQueries({ queryKey: ['sheet-sync'] }), queryClient.invalidateQueries({ queryKey: ['attendance'] }), queryClient.invalidateQueries({ queryKey: ['payroll'] }), queryClient.invalidateQueries({ queryKey: ['employees'] })]); }, onError: (error) => toast.error(error instanceof Error ? error.message : 'Không đồng bộ được Google Sheet') });
  useEffect(() => {
    if (!selectedCode && departments.data?.length) setSelectedCode(departments.data.find((department) => department.code === 'TIKTOK')?.code ?? departments.data[0]!.code);
  }, [departments.data, selectedCode]);

  if (!can('payroll:view')) return <PermissionNotice />;

  const selectedDepartment = (departments.data ?? []).find((department) => department.code === selectedCode);
  const team = (employees.data ?? []).filter((employee) => employee.department === selectedCode);
  const isTikTok = selectedCode === 'TIKTOK';
  const run = (runs.data ?? []).find((item) => item.period === '2026-10') ?? (runs.data ?? [])[0];
  const lineFor = (employeeId: string) => run?.lines.find((line) => line.employeeId === employeeId);
  const recordFor = (employeeId: string, day: number) => (attendance.data ?? []).find((record) => record.employeeId === employeeId && record.date.slice(0, 10) === `2026-10-${String(day).padStart(2, '0')}`);
  const activeCount = team.filter((employee) => employee.status === 'ACTIVE').length;
  const baseSalaryTotal = team.reduce((sum, employee) => sum + Number(employee.baseSalary), 0);
  const positionCount = new Set(team.map((employee) => employee.position)).size;
  const headcount = (code: string) => (employees.data ?? []).filter((employee) => employee.department === code).length;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Nhân sự · Cơ cấu bộ phận"
        title="Nhân sự & chấm công"
        description={`${selectedDepartment?.name ?? 'Chọn bộ phận'} — danh sách nhân viên, vị trí và chấm công tháng 10/2026. Chọn một bộ phận bên dưới để xem danh sách tương ứng.`}
        actions={<div className="flex flex-wrap items-center gap-2">{can('employee:manage') ? <Button size="sm" onClick={() => setAddOpen(true)}><Plus /> Thêm nhân viên</Button> : null}<Button size="sm" variant="secondary" disabled={syncSheets.isPending} onClick={() => syncSheets.mutate()}>{syncSheets.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Đồng bộ Google Sheet</Button><ExportMenu dataset="employees" label="Xuất nhân sự" /><ExportMenu dataset="attendance" label="Xuất chấm công" /><ExportMenu dataset="payroll" label="Xuất lương" /></div>}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-surface px-3 py-2 text-[10px] text-muted-foreground">
        <span className="font-medium text-ink">Đồng bộ Google Sheet tự động mỗi 15 phút</span>
        {(sheetStatus.data ?? []).map((source) => <span key={source.key} className="flex items-center gap-1"><span className={source.status === 'OK' ? 'text-forest' : 'text-danger'}>●</span>{source.key === 'attendance' ? 'Chấm công' : source.key === 'payroll' ? 'Lương' : 'Chi phí'}: {source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString('vi-VN') : 'chưa đồng bộ'} · {source.rows} dòng</span>)}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label="Nhân sự bộ phận" value={String(team.length)} hint={selectedDepartment?.name ?? 'Chưa chọn bộ phận'} />
        <Kpi icon={CalendarCheck2} label="Đang hoạt động" value={String(activeCount)} hint={`${team.length - activeCount} tạm dừng`} />
        <Kpi icon={HandCoins} label="Tổng lương cơ bản" value={formatMoney(baseSalaryTotal)} hint="Theo hồ sơ nhân sự" />
        <Kpi icon={Users} label="Vị trí / chức danh" value={String(positionCount)} hint="Trong bộ phận đang chọn" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div><p className="font-display text-lg text-ink">Nhân viên — {selectedDepartment?.name ?? 'Chưa chọn bộ phận'}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mã nhân viên · họ tên · vị trí · trạng thái</p></div>
            <div className="flex items-center gap-2">{isTikTok ? <Button size="sm" variant="secondary" disabled={syncSheets.isPending} onClick={() => syncSheets.mutate('payroll')}>{syncSheets.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Cập nhật lương</Button> : null}<Badge tone="brand">{team.length} nhân sự</Badge></div>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead className="pl-4">Mã</TableHead><TableHead>Họ tên</TableHead><TableHead>Vị trí</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Lương cơ bản</TableHead>{isTikTok ? <><TableHead className="text-right">Tạm ứng</TableHead><TableHead className="pr-4 text-right">Thực lãnh 10/2026</TableHead></> : null}</TableRow></TableHeader>
            <TableBody>
              {team.map((employee) => {
                const line = lineFor(employee.id);
                return <TableRow key={employee.id}>
                  <TableCell className="pl-4 font-mono text-[11px]">{employee.code}</TableCell>
                  <TableCell className="text-xs">{employee.fullName}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{employee.position}</TableCell>
                  <TableCell><Badge tone={employee.status === 'ACTIVE' ? 'success' : 'outline'}>{employee.status === 'ACTIVE' ? 'Hoạt động' : employee.status}</Badge></TableCell>
                  <TableCell className="tabular text-right text-xs">{formatMoney(Number(employee.baseSalary))}</TableCell>
                  {isTikTok ? <><TableCell className="tabular text-right text-xs">{formatMoney(Number(line?.advanceAmount ?? 0))}</TableCell><TableCell className="tabular pr-4 text-right text-xs text-brand">{formatMoney(Number(line?.net ?? 0))}</TableCell></> : null}
                </TableRow>;
              })}
              {team.length === 0 ? <TableRow><TableCell colSpan={isTikTok ? 7 : 5} className="py-10 text-center text-xs text-muted-foreground">Bộ phận này chưa có nhân viên. Thêm nhân sự hoặc chuyển bộ phận cho tài khoản.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div><p className="font-display text-lg text-ink">Cơ cấu bộ phận</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Khách sạn · Nhà hàng · Bộ phận dùng chung — sẵn sàng phân quyền theo bộ phận</p></div>
            <div className="flex gap-1"><Badge tone="success">{departments.data?.filter((d) => d.division === 'HOTEL').length ?? 0} khách sạn</Badge><Badge tone="brand">{departments.data?.filter((d) => d.division === 'RESTAURANT').length ?? 0} nhà hàng</Badge><Badge tone="outline">{departments.data?.filter((d) => d.division === 'SHARED').length ?? 0} dùng chung</Badge></div>
          </div>
          <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
            {(departments.data ?? []).map((department) => <button key={department.code} type="button" aria-pressed={selectedCode === department.code} onClick={() => setSelectedCode(department.code)} className={cn('flex items-start justify-between gap-3 p-3 text-left transition-colors', selectedCode === department.code ? 'bg-brand-soft ring-1 ring-inset ring-brand' : 'bg-surface hover:bg-muted/50')}>
              <div><p className={cn('text-xs font-medium', selectedCode === department.code ? 'text-brand' : 'text-ink')}>{department.name}</p><p className="mt-0.5 font-mono text-[9px] text-muted-foreground">{department.code} · {department.group} · {headcount(department.code)} người</p></div>
              <div className="flex shrink-0 flex-col items-end gap-1"><Badge tone={department.division === 'RESTAURANT' ? 'brand' : department.division === 'HOTEL' ? 'success' : 'outline'}>{department.division === 'RESTAURANT' ? 'Nhà hàng' : department.division === 'HOTEL' ? 'Khách sạn' : 'Dùng chung'}</Badge>{department.isRevenueCenter ? <span className="text-[9px] text-brand">Trung tâm doanh thu</span> : null}</div>
            </button>)}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div><p className="font-display text-lg text-ink">Bảng chấm công — tháng 10/2026</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">● đủ công · ◐ nửa công · — nghỉ tuần</p></div>
          <div className="flex items-center gap-2"><Button size="sm" variant="secondary" disabled={syncSheets.isPending} onClick={() => syncSheets.mutate('attendance')}>{syncSheets.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Cập nhật chấm công</Button><a href={SHEETS.attendance} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] text-brand hover:underline">Mở Google Sheet <ExternalLink className="size-3" /></a></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-[11px]">
            <thead><tr className="border-b border-line bg-muted/40">{['Nhân sự', ...DAYS.map(String), 'Công', 'Tạm ứng', 'Thực lãnh'].map((label, index) => <th key={`${label}-${index}`} className={`px-1.5 py-2 font-medium text-muted-foreground ${index === 0 ? 'sticky left-0 z-10 min-w-44 bg-muted pl-4 text-left' : 'text-center'}`}>{label}</th>)}</tr></thead>
            <tbody>
              {team.map((employee) => {
                const line = lineFor(employee.id);
                const work = DAYS.reduce((days, day) => days + (recordFor(employee.id, day)?.status === 'PRESENT' ? 1 : recordFor(employee.id, day)?.status === 'HALF_DAY' ? 0.5 : 0), 0);
                return <tr key={employee.id} className="border-b border-line/60 last:border-0">
                  <td className="sticky left-0 z-10 bg-surface py-2 pl-4 pr-2"><p className="font-medium text-ink">{employee.fullName}</p><p className="text-[9px] text-muted-foreground">{employee.code}</p></td>
                  {DAYS.map((day) => {
                    const record = recordFor(employee.id, day);
                    const meta = record ? STATUS_META[record.status] ?? { label: record.status, symbol: '•', className: 'text-muted-foreground' } : null;
                    return <td key={day} className="px-1 py-2 text-center" title={meta ? `${day}/10: ${meta.label}` : `${day}/10: chưa có dữ liệu`}><span className={`text-sm ${meta?.className ?? 'text-line'}`}>{meta?.symbol ?? '·'}</span></td>;
                  })}
                  <td className="px-2 text-center font-medium text-ink">{work.toLocaleString('vi-VN')}</td>
                  <td className="tabular px-2 text-right text-[10px]">{formatMoney(Number(line?.advanceAmount ?? 0))}</td>
                  <td className="tabular px-2 pr-4 text-right text-[10px] text-brand">{formatMoney(Number(line?.net ?? 0))}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} departments={departments.data ?? []} canManage={can('employee:manage')} onSaved={async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['employees'] }), queryClient.invalidateQueries({ queryKey: ['departments'] })]); }} />

      <div className="grid gap-3 md:grid-cols-3">
        <SourceCard title="Chấm công & lịch nghỉ" href={SHEETS.attendance} note="Nguồn: bảng theo dõi công tháng 10/2026" onSync={() => syncSheets.mutate('attendance')} syncing={syncSheets.isPending} />
        <SourceCard title="Bảng lương & tạm ứng" href={SHEETS.payroll} note="Nguồn: bảng lương thực lãnh tháng 10/2026" onSync={() => syncSheets.mutate('payroll')} syncing={syncSheets.isPending} />
        <SourceCard title="Chi phí đi chợ TikTok" href={SHEETS.shopping} note="Nguồn: chi phí team TikTok tháng 11/2026" onSync={() => syncSheets.mutate('shopping')} syncing={syncSheets.isPending} />
      </div>
    </div>
  );
}


function AddEmployeeDialog({ open, onOpenChange, departments, canManage, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; departments: Department[]; canManage: boolean; onSaved: () => Promise<void> }) {
  const [fullName, setFullName] = useState('');
  const [code, setCode] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('Nhân viên');
  const [hireDate, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [baseSalary, setBaseSalary] = useState('6500000');
  const [employmentType, setEmploymentType] = useState<'OFFICIAL' | 'PROBATION'>('OFFICIAL');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('NinhVaNa@2026');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api('/hr/employees/account', { method: 'POST', body: { fullName, code: code || undefined, department, position, hireDate, baseSalary: Number(baseSalary), employmentType, email, password } }),
    onSuccess: async () => { toast.success('Đã tạo nhân viên và tài khoản đăng nhập'); setFullName(''); setCode(''); setEmail(''); onOpenChange(false); await onSaved(); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Không tạo được nhân viên'),
  });
  useEffect(() => { if (open && !department && departments[0]) setDepartment(departments[0].code); }, [open, department, departments]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent wide><DialogHeader><DialogTitle>Thêm nhân viên & tài khoản</DialogTitle><DialogDescription>Tạo hồ sơ nhân sự và tài khoản đăng nhập. Nhân viên thử việc chỉ có quyền dashboard và đơn nghỉ phép.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2">
    <div><Label>Họ và tên</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
    <div><Label>Mã nhân viên</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Tự sinh nếu để trống" /></div>
    <div><Label>Bộ phận</Label><NativeSelect value={department} onChange={(e) => setDepartment(e.target.value)}>{departments.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</NativeSelect></div>
    <div><Label>Chức danh</Label><Input value={position} onChange={(e) => setPosition(e.target.value)} /></div>
    <div><Label>Ngày vào làm</Label><Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} /></div>
    <div><Label>Lương cơ bản</Label><Input inputMode="numeric" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} /></div>
    <div><Label>Loại nhân sự</Label><NativeSelect value={employmentType} onChange={(e) => setEmploymentType(e.target.value as 'OFFICIAL' | 'PROBATION')}><option value="OFFICIAL">Chính thức</option><option value="PROBATION">Thử việc</option></NativeSelect></div>
    <div><Label>Email đăng nhập</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
    <div><Label>Mật khẩu ban đầu</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
  </div>{error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}<div className="mt-4 flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Huỷ</Button><Button size="sm" disabled={!canManage || !fullName || !department || !email || create.isPending} onClick={() => create.mutate()}>{create.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Tạo nhân viên</Button></div></DialogContent></Dialog>;
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: string; hint: string }) {
  return <Card><CardContent className="p-4"><div className="flex items-start justify-between"><p className="label-xs">{label}</p><Icon className="size-4 text-brand" /></div><p className="mt-2 font-display text-2xl text-ink">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{hint}</p></CardContent></Card>;
}

function SourceCard({ title, href, note, onSync, syncing }: { title: string; href: string; note: string; onSync: () => void; syncing: boolean }) {
  return <div className="card-surface flex items-center justify-between gap-3 p-4"><a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 transition hover:text-brand"><p className="text-sm font-medium text-ink">{title}</p><p className="mt-1 text-[10px] text-muted-foreground">{note}</p></a><Button size="sm" variant="secondary" disabled={syncing} onClick={onSync}>{syncing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Cập nhật</Button><ExternalLink className="size-4 shrink-0 text-brand" /></div>;
}
