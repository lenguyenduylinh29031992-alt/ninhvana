'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAccess } from '@/lib/session';
import { useRealtime } from '@/lib/realtime';
import { PropertyProvider } from '@/lib/property-context';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { CommandMenu } from './command-menu';
import { Skeleton } from '@/components/ui/skeleton';

export function AppShell({ children }: { children: React.ReactNode }) {
  const access = useAccess();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const { connected } = useRealtime(Boolean(access.user));

  useEffect(() => {
    if (access.isError) router.replace('/login');
  }, [access.isError, router]);

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    queryClient.clear();
    window.location.href = '/login';
  };

  if (access.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="w-full max-w-sm space-y-4 px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full border border-champagne/40 font-display text-champagne">
              GS
            </span>
            <div className="flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-2.5 w-20" />
            </div>
          </div>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (!access.user) return null;

  return (
    <PropertyProvider properties={access.user.properties}>
      <div className="min-h-screen bg-canvas">
        <Sidebar user={access.user} open={mobileOpen} onClose={() => setMobileOpen(false)} onLogout={() => void logout()} />
        <div className="flex min-h-screen flex-col lg:pl-[264px]">
          <Topbar
            user={access.user}
            onOpenMobileNav={() => setMobileOpen(true)}
            onOpenCommand={() => setCommandOpen(true)}
            realtimeConnected={connected}
          />
          <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 md:px-6 lg:px-8">
            {children}
          </main>
          <footer className="mx-auto w-full max-w-[1600px] px-4 pb-6 pt-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 md:px-6 lg:px-8">
            Grand Suite · Hospitality Operating System · v0.1
          </footer>
        </div>
        <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} user={access.user} />
      </div>
    </PropertyProvider>
  );
}
