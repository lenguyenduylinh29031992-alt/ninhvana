'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, ExternalLink, HandCoins, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAccess } from '@/lib/session';
import { useActiveProperty } from '@/lib/property-context';
import { ExportMenu } from '@/components/domain/export-menu';
import { PermissionNotice } from '@/components/domain/permission-notice';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Employee { id: string; code: string; fullName: string; position: string; department: string; baseSalary: number; status: string }
interface Attendance { id: string; employeeId: string; date: string; hours: number; status: string; employee: { id: string; code: string; fullName: string; department: string } }
interface Department { code: string; name: string; nameEn: string | null; division: string; group: string; isRevenueCenter: boolean; sortOrder: number }
interface PayrollLine { employeeId: string; employeeCode: string; employeeName: string; gross: number; advanceAmount: number; net: number }
interface Run { id: string; period: string; status: string; gross: number; net: number; deductions: number; lines: PayrollLine[] }

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
  const { activeProperty, properties } = useActiveProperty();
  const propertyId = activeProperty?.id ?? properties.find((property) => property.type === 'HOTEL')?.id ?? properties[0]?.id;
  const enabled = Boolean(propertyId) && can('payroll:view');
  const employees = useQuery<Employee[]>({ queryKey: ['employees', propertyId], queryFn: () => api(`/hr/employees?propertyId=${propertyId}`), enabled });
  const attendance = useQuery<Attendance[]>({ queryKey: ['attendance', propertyId, MONTH_START, MONTH_END], queryFn: () => api(`/hr/attendance?propertyId=${propertyId}&from=${MONTH_START}&to=${MONTH_END}`), enabled });
  const runs = useQuery<Run[]>({ queryKey: ['payroll', propertyId], queryFn: () => api(`/hr/payroll?propertyId=${propertyId}`), enabled });
  const departments = useQuery<Department[]>({ queryKey: ['departments', propertyId], queryFn: () => api(`/hr/departments?propertyId=${propertyId}`), enabled });
  if (!can('payroll:view')) return <PermissionNotice />;

  const marketing = (employees.data ?? []).filter((employee) => employee.department === 'TIKTOK');
  const team = marketing.length ? marketing : (employees.data ?? []);
  const run = (runs.data ?? []).find((item) => item.period === '2026-10') ?? (runs.data ?? [])[0];
  const lineFor = (employeeId: string) => run?.lines.find((line) => line.employeeId === employeeId);
  const recordFor = (employeeId: string, day: number) => (attendance.data ?? []).find((record) => record.employeeId === employeeId && record.date.slice(0, 10) === `2026-10-${String(day).padStart(2, '0')}`);
  const totalWork = team.reduce((sum, employee) => sum + DAYS.reduce((days, day) => days + (recordFor(employee.id, day)?.status === 'PRESENT' ? 1 : recordFor(employee.id, day)?.status === 'HALF_DAY' ? 0.5 : 0), 0), 0);
  const totalAdvance = team.reduce((sum, employee) => sum + Number(lineFor(employee.id)?.advanceAmount ?? 0), 0);
  const totalNet = team.reduce((sum, employee) => sum + Number(lineFor(employee.id)?.net ?? 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Nhân sự · Marketing TikTok"
        title="Nhân sự & chấm công"
        description="Đội Marketing TikTok — chấm công tháng 10/2026 và bảng lương thực lãnh kèm tạm ứng, đồng bộ từ Google Sheet."
        actions={<div className="flex flex-wrap items-center gap-2"><ExportMenu dataset="employees" label="Xuất nhân sự" /><ExportMenu dataset="payroll" label="Xuất lương" /></div>}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label="Nhân sự Marketing" value={String(team.length)} hint="Bộ phận Marketing TikTok" />
        <Kpi icon={CalendarCheck2} label="Tổng công thực tế" value={totalWork.toLocaleString('vi-VN')} hint="Đủ công + nửa công" />
        <Kpi icon={HandCoins} label="Tạm ứng tháng 10" value={formatMoney(totalAdvance)} hint="Theo bảng lương" />
        <Kpi icon={HandCoins} label="Thực lãnh tháng 10" value={formatMoney(totalNet)} hint={run ? `Kỳ ${run.period} · ${run.status}` : 'Chưa có kỳ lương'} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div><p className="font-display text-lg text-ink">Đội Marketing TikTok</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mã nhân viên · chức danh · lương cơ bản</p></div>
            <Badge tone="brand">{team.length} nhân sự</Badge>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead className="pl-4">Mã</TableHead><TableHead>Họ tên</TableHead><TableHead>Chức danh</TableHead><TableHead className="text-right">Lương cơ bản</TableHead><TableHead className="text-right">Tạm ứng</TableHead><TableHead className="pr-4 text-right">Thực lãnh 10/2026</TableHead></TableRow></TableHeader>
            <TableBody>
              {team.map((employee) => {
                const line = lineFor(employee.id);
                return <TableRow key={employee.id}>
                  <TableCell className="pl-4 font-mono text-[11px]">{employee.code}</TableCell>
                  <TableCell className="text-xs">{employee.fullName}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{employee.position}</TableCell>
                  <TableCell className="tabular text-right text-xs">{formatMoney(Number(employee.baseSalary))}</TableCell>
                  <TableCell className="tabular text-right text-xs">{formatMoney(Number(line?.advanceAmount ?? 0))}</TableCell>
                  <TableCell className="tabular pr-4 text-right text-xs text-brand">{formatMoney(Number(line?.net ?? 0))}</TableCell>
                </TableRow>;
              })}
              {team.length === 0 ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-xs text-muted-foreground">Chưa có nhân sự Marketing TikTok. Chạy script đồng bộ Google Sheet để nạp dữ liệu.</TableCell></TableRow> : null}
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
            {(departments.data ?? []).map((department) => <div key={department.code} className="flex items-start justify-between gap-3 bg-surface p-3">
              <div><p className="text-xs font-medium text-ink">{department.name}</p><p className="mt-0.5 font-mono text-[9px] text-muted-foreground">{department.code} · {department.group}</p></div>
              <div className="flex shrink-0 flex-col items-end gap-1"><Badge tone={department.division === 'RESTAURANT' ? 'brand' : department.division === 'HOTEL' ? 'success' : 'outline'}>{department.division === 'RESTAURANT' ? 'Nhà hàng' : department.division === 'HOTEL' ? 'Khách sạn' : 'Dùng chung'}</Badge>{department.isRevenueCenter ? <span className="text-[9px] text-brand">Trung tâm doanh thu</span> : null}</div>
            </div>)}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div><p className="font-display text-lg text-ink">Bảng chấm công — tháng 10/2026</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">● đủ công · ◐ nửa công · — nghỉ tuần</p></div>
          <a href={SHEETS.attendance} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] text-brand hover:underline">Mở Google Sheet <ExternalLink className="size-3" /></a>
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

      <div className="grid gap-3 md:grid-cols-3">
        <SourceCard title="Chấm công & lịch nghỉ" href={SHEETS.attendance} note="Nguồn: bảng theo dõi công tháng 10/2026" />
        <SourceCard title="Bảng lương & tạm ứng" href={SHEETS.payroll} note="Nguồn: bảng lương thực lãnh tháng 10/2026" />
        <SourceCard title="Chi phí đi chợ TikTok" href={SHEETS.shopping} note="Nguồn: chi phí team TikTok tháng 11/2026" />
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: string; hint: string }) {
  return <Card><CardContent className="p-4"><div className="flex items-start justify-between"><p className="label-xs">{label}</p><Icon className="size-4 text-brand" /></div><p className="mt-2 font-display text-2xl text-ink">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{hint}</p></CardContent></Card>;
}

function SourceCard({ title, href, note }: { title: string; href: string; note: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className="card-surface flex items-center justify-between gap-3 p-4 transition hover:border-brand/40"><div><p className="text-sm font-medium text-ink">{title}</p><p className="mt-1 text-[10px] text-muted-foreground">{note}</p></div><ExternalLink className="size-4 shrink-0 text-brand" /></a>;
}
