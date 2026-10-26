'use client';

import { HEADERS } from '@grand-suite/shared';
import { readCookie } from './utils';
import { enqueue, pendingMutations } from './offline-sync';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** Field-level validation messages, keyed by dotted path. */
  fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const item of this.details as Array<{ path?: string; message?: string }>) {
        if (item?.path) result[item.path] = item.message ?? 'Không hợp lệ';
      }
    }
    return result;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Internal: prevents an infinite refresh loop. */
  retried?: boolean;
  raw?: boolean;
}

function csrfHeader(): Record<string, string> {
  const token = readCookie('gs_csrf');
  return token ? { [HEADERS.CSRF]: token } : {};
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }
  if (!response.ok) {
    const record = (payload ?? {}) as Record<string, unknown>;
    throw new ApiError(
      response.status,
      typeof record.code === 'string' ? record.code : 'ERROR',
      typeof record.message === 'string' ? record.message : `Lỗi ${response.status}`,
      record.details,
      typeof record.requestId === 'string' ? record.requestId : undefined,
    );
  }
  return payload as T;
}

/**
 * Same-origin API client. Adds the CSRF double-submit header, retries once after
 * refreshing an expired access token, and redirects to /login when the session
 * is truly gone.
 */
export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, headers, retried = false } = options;
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...csrfHeader(),
    ...headers,
  };
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'include',
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    if (method !== 'GET' && !path.startsWith('/auth/')) {
      enqueue(path, method, body);
      throw new ApiError(0, 'OFFLINE_QUEUED', `Không có mạng. Thay đổi đã được lưu trên thiết bị và sẽ tự đồng bộ (${pendingMutations()} mục).`);
    }
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ.');
  }

  if (response.status === 401 && !retried && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    const refreshed = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', ...csrfHeader() },
    }).catch(() => null);
    if (refreshed?.ok) {
      return api<T>(path, { ...options, retried: true });
    }
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
    await parse<unknown>(response);
  }

  return parse<T>(response);
}

export const apiClient = {
  get: <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
};
