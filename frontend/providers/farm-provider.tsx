"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { useFarms } from "@/lib/api/hooks";
import type { Farm } from "@/lib/api/types";

const STORAGE_KEY = "zerno.farm";

type Context = {
  farm: Farm | null;
  farms: Farm[];
  loading: boolean;
  error: boolean;
  retry: () => void;
  selectFarm: (id: string) => void;
};

const FarmContext = createContext<Context | null>(null);

export function FarmProvider({ children }: { children: ReactNode }) {
  const query = useFarms();
  // This provider only mounts in the browser, after sign-in, so storage is safe to read here.
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const selectFarm = useCallback((id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Falls back to the first farm on the next visit.
    }
  }, []);

  const value = useMemo<Context>(() => {
    const farms = query.data ?? [];
    return {
      farm: farms.find((f) => f.id === selected) ?? farms[0] ?? null,
      farms,
      loading: query.isLoading,
      error: query.isError,
      retry: () => void query.refetch(),
      selectFarm,
    };
  }, [query, selected, selectFarm]);

  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}

export function useFarm() {
  const context = useContext(FarmContext);
  if (!context) throw new Error("useFarm must be used inside FarmProvider");
  return context;
}
