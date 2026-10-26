'use client';

import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { flushOfflineQueue, onOfflineSync, pendingMutations } from '@/lib/offline-sync';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function OfflineSyncBar() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(0);

  useEffect(() => {
    const refresh = () => { setOnline(navigator.onLine); setPending(pendingMutations()); };
    refresh();
    const off = onOfflineSync(refresh);
    const onOnline = () => { refresh(); void sync(); };
    window.addEventListener('online', onOnline);
    return () => { off(); window.removeEventListener('online', onOnline); };
  }, []);

  async function sync() {
    if (!navigator.onLine || pending === 0) return;
    setSyncing(true);
    const result = await flushOfflineQueue();
    setPending(result.remaining);
    setSynced(result.synced);
    setSyncing(false);
  }

  if (online && pending === 0 && synced === 0) return null;
  return <div className={cn('flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-[11px]', online ? 'border-info/20 bg-info-soft text-info' : 'border-warning/25 bg-warning-soft text-warning')}>
    <div className="flex items-center gap-2"><CloudOff className="size-3.5" /><span>{online ? (pending ? `${pending} thay đổi đang chờ đồng bộ` : `Đã đồng bộ ${synced} thay đổi`) : 'Đang ngoại tuyến · thay đổi sẽ được lưu trên thiết bị'}</span></div>
    {online && pending > 0 ? <Button size="sm" variant="secondary" disabled={syncing} onClick={() => void sync()}><RefreshCw className={cn('size-3', syncing && 'animate-spin')} /> Đồng bộ ngay</Button> : null}
  </div>;
}
