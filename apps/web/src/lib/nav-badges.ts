'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HEADERS } from '@grand-suite/shared';
import { api } from './api';
import { readCookie } from './utils';
import { useActiveProperty } from './property-context';

export const BADGE_SECTIONS = ['/reservations', '/front-desk', '/guests', '/housekeeping', '/reviews', '/inbox', '/marketing', '/hr', '/costs', '/rate-approvals', '/updates'] as const;

export function useNavBadges() {
  const { activeProperty, properties } = useActiveProperty();
  const propertyId = activeProperty?.id ?? properties.find((property) => property.type === 'HOTEL')?.id ?? properties[0]?.id;
  return useQuery<{ badges: Record<string, number> }>({
    queryKey: ['nav-badges', propertyId],
    queryFn: () => api(`/notifications/badges${propertyId ? `?propertyId=${propertyId}` : ''}`),
    enabled: Boolean(propertyId),
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Marks the current navigation section as seen for this account. */
export function useMarkSectionRead() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  useEffect(() => {
    const section = BADGE_SECTIONS.find((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
    if (!section) return;
    const csrf = readCookie('gs_csrf');
    void fetch('/api/v1/notifications/read', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(csrf ? { [HEADERS.CSRF]: csrf } : {}) },
      body: JSON.stringify({ section }),
    }).then((response) => {
      if (response.ok) void queryClient.invalidateQueries({ queryKey: ['nav-badges'] });
    }).catch(() => undefined);
  }, [pathname, queryClient]);
}
