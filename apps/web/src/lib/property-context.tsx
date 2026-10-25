'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { SessionProperty } from '@grand-suite/shared';

interface PropertyContextValue {
  activePropertyId: string | null;
  activeProperty: SessionProperty | null;
  properties: SessionProperty[];
  setActivePropertyId: (id: string | null) => void;
  scopeLabel: string;
}

const PropertyContext = createContext<PropertyContextValue | null>(null);
const STORAGE_KEY = 'gs_active_property';

export function PropertyProvider({
  properties,
  children,
}: {
  properties: SessionProperty[];
  children: React.ReactNode;
}) {
  const [activePropertyId, setActive] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'ALL') {
      setActive(null);
      return;
    }
    if (stored && properties.some((property) => property.id === stored)) {
      setActive(stored);
      return;
    }
    setActive(properties.length === 1 ? properties[0]!.id : null);
  }, [properties]);

  const setActivePropertyId = useCallback((id: string | null) => {
    setActive(id);
    window.localStorage.setItem(STORAGE_KEY, id ?? 'ALL');
  }, []);

  const value = useMemo<PropertyContextValue>(() => {
    const activeProperty = properties.find((property) => property.id === activePropertyId) ?? null;
    return {
      activePropertyId: activeProperty?.id ?? null,
      activeProperty,
      properties,
      setActivePropertyId,
      scopeLabel: activeProperty?.name ?? 'Toàn tập đoàn',
    };
  }, [activePropertyId, properties, setActivePropertyId]);

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}

export function useActiveProperty(): PropertyContextValue {
  const context = useContext(PropertyContext);
  if (!context) throw new Error('useActiveProperty must be used inside PropertyProvider');
  return context;
}
