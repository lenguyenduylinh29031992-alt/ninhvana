'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Monitor, RefreshCw, Server, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';

interface Health { status: string; version?: string; environment?: string; uptimeSeconds?: number; timestamp?: string }
const RELEASES = [
  { date: '2026-10-26', version: '0.1.0', title: 'Loại phòng, duyệt giá & dữ liệu thử', items: ['27 phòng theo sơ đồ A1/A2/A3', 'Quy trình ký duyệt giá phòng trực tuyến', 'Dữ liệu demo có thể xoá cho khách/đặt phòng/CRM/chi phí', 'Khoá zoom và cố định thanh icon mobile', 'Sửa tương phản form ở giao diện tối', 'Tự tìm máy chủ và hàng đợi offline', 'Bộ cài VPS/Caddy cho chạy 24/7', 'Badge số cập nhật chưa đọc theo tài khoản'] },
  { date: '2026-10-25', version: '0.1.0', title: 'Marketing TikTok & nhân sự', items: ['Kênh TikTok và 4 mục nội dung', 'Bộ phận Marketing TikTok', 'Chấm công và bảng lương Marketing', 'Icon điều hướng theo bộ phận'] },
  { date: '2026-10-24', version: '0.1.0', title: 'Nền tảng vận hành', items: ['PMS, POS, kênh bán, CRM, kế toán', 'Bảo trì đa nền tảng', 'Phân quyền và audit log'] },
];

function uptime(seconds?: number) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} giờ ${m} phút` : `${m} phút`;
}

export default function UpdatesPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<string>('—');

  const check = async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/v1/health', { cache: 'no-store' });
      const data = (await response.json()) as Health;
      setHealth(data);
      setLastCheck(new Date().toLocaleTimeString('vi-VN'));
    } catch {
      setHealth({ status: 'down' });
      setLastCheck(new Date().toLocaleTimeString('vi-VN'));
    } finally { setChecking(false); }
  };
  useEffect(() => { void check(); }, []);

  return <div className="space-y-4">
    <PageHeader eyebrow="Hệ thống · Phiên bản" title="Cập nhật phần mềm" description="Theo dõi phiên bản máy chủ, xem tính năng mới và hướng dẫn cập nhật trên từng thiết bị." actions={<Button size="sm" variant="secondary" onClick={() => void check()} disabled={checking}><RefreshCw className={cn('size-4', checking && 'animate-spin')} /> Kiểm tra cập nhật</Button>} />
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent className="p-4"><div className="flex items-start justify-between"><p className="label-xs">Phiên bản máy chủ</p><Server className="size-4 text-brand" /></div><p className="mt-2 font-display text-2xl text-ink">{health?.version ?? '—'}</p><p className="mt-1 text-[10px] text-muted-foreground">{health?.environment ?? 'Đang kiểm tra'} · {health?.status === 'ok' ? 'Hoạt động' : 'Chưa kết nối'}</p></CardContent></Card>
      <Card><CardContent className="p-4"><div className="flex items-start justify-between"><p className="label-xs">Thời gian chạy</p><ShieldCheck className="size-4 text-brand" /></div><p className="mt-2 font-display text-2xl text-ink">{uptime(health?.uptimeSeconds)}</p><p className="mt-1 text-[10px] text-muted-foreground">Máy chủ hiện tại</p></CardContent></Card>
      <Card><CardContent className="p-4"><div className="flex items-start justify-between"><p className="label-xs">Lần kiểm tra gần nhất</p><CheckCircle2 className="size-4 text-forest" /></div><p className="mt-2 font-display text-2xl text-ink">{lastCheck}</p><p className="mt-1 text-[10px] text-muted-foreground">Tự kiểm tra lại bằng nút phía trên</p></CardContent></Card>
    </div>
    <Card><CardContent className="p-4"><div className="flex items-center justify-between gap-2"><div><p className="font-display text-xl text-ink">Cập nhật giao diện web</p><p className="text-[10px] text-muted-foreground">Bản web luôn dùng phiên bản máy chủ mới sau khi triển khai.</p></div><Button size="sm" onClick={() => window.location.reload()}><RefreshCw className="size-4" /> Tải lại giao diện</Button></div></CardContent></Card>
    <Card><CardContent className="p-4"><p className="font-display text-xl text-ink">Hướng dẫn theo thiết bị</p><div className="mt-3 grid gap-3 md:grid-cols-2">
      <Platform icon={Monitor} title="Desktop — macOS / Windows / Linux" text="Mở bản cài mới (DMG/EXE), kéo ứng dụng vào Applications hoặc chạy bộ cài. Ứng dụng desktop tải giao diện từ máy chủ; không cần cài lại khi chỉ cập nhật tính năng web." />
      <Platform icon={Monitor} title="Web — mọi hệ điều hành" text="Nhấn Tải lại giao diện. Nếu máy chủ vừa được triển khai, bản mới xuất hiện ngay khi tải lại trang." />
      <Platform icon={Smartphone} title="iOS" text="Cập nhật qua TestFlight/App Store khi có bản mới. Bản Simulator hoặc IPA cần build lại và ký bằng Apple ID/team." />
      <Platform icon={Smartphone} title="Android" text="Cài APK mới hoặc cập nhật qua kho ứng dụng. Giao diện web đi kèm máy chủ sẽ tự cập nhật sau khi kết nối." />
    </div></CardContent></Card>
    <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Sparkles className="size-4 text-brand" /><p className="font-display text-xl text-ink">Lịch sử phát hành</p></div><div className="mt-4 space-y-4">{RELEASES.map((release) => <div key={release.date} className="relative border-l border-line pl-4"><span className="absolute -left-1.5 top-1 size-3 rounded-full border-2 border-canvas bg-brand" /><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-ink">{release.title}</p><Badge tone="outline">{release.version}</Badge><span className="text-[10px] text-muted-foreground">{release.date}</span></div><ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">{release.items.map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3 shrink-0 text-forest" />{item}</li>)}</ul></div>)}</div></CardContent></Card>
  </div>;
}

function Platform({ icon: Icon, title, text }: { icon: typeof Monitor; title: string; text: string }) {
  return <div className="rounded-xl border border-line bg-surface p-3"><div className="flex items-center gap-2"><Icon className="size-4 text-brand" /><p className="text-xs font-medium text-ink">{title}</p></div><p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{text}</p></div>;
}
