'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ServerCrash, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((value) => String(value).padStart(2, '0')).join(':');
}

export function SystemHealth() {
  const [downSince, setDownSince] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [checking, setChecking] = useState(false);
  const mounted = useRef(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/v1/health/live', { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('health check failed');
      if (mounted.current) setDownSince(null);
      return true;
    } catch {
      if (mounted.current) setDownSince((current) => current ?? Date.now());
      return false;
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void check();
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') void check(); }, 15_000);
    const goOffline = () => setDownSince((current) => current ?? Date.now());
    const goOnline = () => void check();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      mounted.current = false;
      window.clearInterval(poll);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [check]);

  useEffect(() => {
    if (downSince === null) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - downSince) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [downSince]);

  if (downSince === null) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-3 backdrop-blur-sm sm:items-center" role="alertdialog" aria-modal="true" aria-labelledby="maintenance-title">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-canvas shadow-2xl">
        <div className="relative bg-sidebar px-5 pb-5 pt-5 text-sidebar-ink">
          <div className="flex items-start gap-3">
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10">
              <Wrench className="size-5" />
              <span className="absolute inset-0 animate-ping rounded-full border border-white/20" />
            </span>
            <div>
              <p className="text-[9px] uppercase tracking-[0.22em] text-sidebar-muted">NinhVaNa · Trạng thái hệ thống</p>
              <h2 id="maintenance-title" className="mt-1 font-display text-2xl">Hệ thống đang bảo trì</h2>
            </div>
          </div>
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-sidebar-muted">Kết nối tới máy chủ bị gián đoạn. Đội kỹ thuật đang kiểm tra; dữ liệu của bạn vẫn được giữ an toàn.</p>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
            <div><p className="label-xs">Thời gian chạy</p><p className="mt-1 font-mono text-2xl tracking-[0.12em] text-ink">{formatElapsed(elapsed)}</p></div>
            <ServerCrash className="size-7 text-warning" />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground"><span>Máy chủ</span><span className="max-w-[240px] truncate font-mono">{typeof window !== 'undefined' ? window.location.host : '—'}</span></div>
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">Nếu bạn đang dùng ứng dụng di động, kiểm tra Wi-Fi/4G hoặc địa chỉ máy chủ trong màn hình kết nối. Hệ thống sẽ tự kiểm tra lại mỗi 15 giây.</p>
          <button type="button" onClick={() => void check()} disabled={checking} className={cn('flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-60')}>
            <RefreshCw className={cn('size-4', checking && 'animate-spin')} /> {checking ? 'Đang kiểm tra…' : 'Thử kết nối lại'}
          </button>
        </div>
      </div>
    </div>
  );
}
