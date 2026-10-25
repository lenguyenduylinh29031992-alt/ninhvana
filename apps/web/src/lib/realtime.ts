'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { api } from './api';

function socketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL;
  if (configured) return configured;
  if (typeof window === 'undefined') return 'http://127.0.0.1:4000';
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

interface RealtimeEnvelope {
  title?: string;
  message?: string;
  [key: string]: unknown;
}

const EVENT_LABELS: Record<string, string> = {
  'reservation.created': 'Đặt phòng mới',
  'reservation.updated': 'Cập nhật đặt phòng',
  'reservation.cancelled': 'Huỷ đặt phòng',
  'reservation.checked_in': 'Khách đã nhận phòng',
  'reservation.checked_out': 'Khách đã trả phòng',
  'pos.order.created': 'Order mới',
  'pos.order.paid': 'Order đã thanh toán',
  'folio.charge_posted': 'Phát sinh tính tiền',
  'housekeeping.task.updated': 'Cập nhật buồng phòng',
  'night_audit.completed': 'Đã chốt ngày',
  'alert.created': 'Cảnh báo mới',
  'channel.sync.failed': 'Đồng bộ kênh thất bại',
};

/**
 * Authenticates the socket with a short-lived ticket and keeps the UI in sync
 * by invalidating affected queries when domain events arrive.
 */
export function useRealtime(enabled: boolean): {
  connected: boolean;
  lastEventAt: string | null;
} {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const connect = async () => {
      try {
        const { token } = await api<{ token: string }>('/realtime/ticket', { method: 'POST' });
        if (cancelled) return;
        const socket = io(`${socketUrl()}/ws`, {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnectionAttempts: 8,
          reconnectionDelay: 1200,
        });
        socketRef.current = socket;

        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));

        for (const event of Object.keys(EVENT_LABELS)) {
          socket.on(event, (payload: RealtimeEnvelope) => {
            setLastEventAt(new Date().toISOString());
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            if (event.startsWith('reservation') || event.startsWith('pos.')) {
              void queryClient.invalidateQueries({ queryKey: ['today'] });
            }
            const label = EVENT_LABELS[event] ?? event;
            toast(label, {
              description: payload?.message ?? payload?.title ?? undefined,
            });
          });
        }
      } catch {
        setConnected(false);
      }
    };

    void connect();
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [enabled, queryClient]);

  return { connected, lastEventAt };
}
