'use client';

import { HEADERS } from '@grand-suite/shared';
import { readCookie } from './utils';

const KEY = 'gs_offline_outbox_v1';
const MAX_ITEMS = 100;
const EVENT = 'gs:offline-sync';

export interface QueuedMutation {
  id: string;
  path: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  createdAt: string;
  attempts: number;
}

function read(): QueuedMutation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  } catch { return []; }
}

function write(items: QueuedMutation[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
  window.dispatchEvent(new Event(EVENT));
}

export function pendingMutations(): number { return read().length; }

export function clearOfflineQueue() { write([]); }

export function enqueue(path: string, method: QueuedMutation['method'], body?: unknown): QueuedMutation {
  const items = read();
  const fingerprint = `${method} ${path} ${JSON.stringify(body ?? null)}`;
  const existing = items.find((item) => `${item.method} ${item.path} ${JSON.stringify(item.body ?? null)}` === fingerprint);
  if (existing) return existing;
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const item: QueuedMutation = { id, path, method, body, createdAt: new Date().toISOString(), attempts: 0 };
  write([...items, item]);
  return item;
}

async function refreshSession(): Promise<boolean> {
  const token = readCookie('gs_csrf');
  const response = await fetch('/api/v1/auth/refresh', {
    method: 'POST', credentials: 'include',
    headers: { Accept: 'application/json', ...(token ? { [HEADERS.CSRF]: token } : {}) },
  }).catch(() => null);
  return Boolean(response?.ok);
}

/**
 * Replays locally queued mutations in order. It never retries a validation/auth
 * failure forever; those stay visible in the offline panel so the user can fix
 * them after reconnecting.
 */
export async function flushOfflineQueue(): Promise<{ synced: number; remaining: number }> {
  if (typeof window === 'undefined' || !navigator.onLine) return { synced: 0, remaining: pendingMutations() };
  let items = read();
  let synced = 0;
  let refreshed = false;
  for (const item of [...items]) {
    let response: Response;
    try {
      const csrf = readCookie('gs_csrf');
      response = await fetch(`/api/v1${item.path}`, {
        method: item.method,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(csrf ? { [HEADERS.CSRF]: csrf } : {}),
          ...(item.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          'X-Offline-Sync': item.id,
        },
        body: item.body === undefined ? undefined : JSON.stringify(item.body),
      });
    } catch { break; }
    if (response.status === 401 && !refreshed) {
      refreshed = true;
      if (await refreshSession()) continue;
      break;
    }
    if (response.status >= 500) break;
    if (response.ok) {
      synced += 1;
      items = items.filter((entry) => entry.id !== item.id);
      write(items);
      continue;
    }
    // A 4xx request will never succeed unchanged; remove it and let the user see
    // the failed count rather than blocking the whole queue forever.
    items = items.filter((entry) => entry.id !== item.id);
    write(items);
  }
  write(items);
  return { synced, remaining: items.length };
}

export function onOfflineSync(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => listener();
  window.addEventListener(EVENT, handler);
  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);
  return () => { window.removeEventListener(EVENT, handler); window.removeEventListener('online', handler); window.removeEventListener('offline', handler); };
}
