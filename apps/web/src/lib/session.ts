'use client';

import { useQuery } from '@tanstack/react-query';
import { hasPermission as checkPermission, type SessionUser } from '@grand-suite/shared';
import { api } from './api';

export function useSession() {
  return useQuery<SessionUser>({
    queryKey: ['session'],
    queryFn: () => api<SessionUser>('/auth/me'),
    staleTime: 60_000,
    retry: false,
  });
}

export function useAccess() {
  const session = useSession();
  const permissions = session.data?.permissions ?? [];
  return {
    ...session,
    user: session.data,
    permissions,
    can: (required: string | string[]) => checkPermission(permissions, required),
    canAny: (required: string[]) => checkPermission(permissions, required, 'any'),
    isOrgWide: session.data?.orgWide ?? false,
  };
}
