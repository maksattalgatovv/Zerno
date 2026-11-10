"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, getToken, setToken } from "@/lib/api/client";
import type { User, UserUpdate } from "@/lib/api/types";
import type { Lang } from "@/lib/i18n";
import { useT } from "@/providers/i18n-provider";

type Context = {
  user: User | null;
  loading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => void;
  update: (body: UserUpdate) => Promise<User>;
};

const AuthContext = createContext<Context | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { lang, setLang } = useT();
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    // Storage isn't available during server rendering, so it can only be read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasToken(!!getToken());
    const onSignedOut = () => setHasToken(false);
    window.addEventListener("zerno:signed-out", onSignedOut);
    return () => window.removeEventListener("zerno:signed-out", onSignedOut);
  }, []);

  const me = useQuery({ queryKey: ["me"], queryFn: () => api<User>("/users/me"), enabled: !!hasToken, retry: false });

  const signIn = useCallback(
    async (token: string) => {
      setToken(token);
      setHasToken(true);
      const user = await client.fetchQuery({ queryKey: ["me"], queryFn: () => api<User>("/users/me") });
      if (user.language !== lang) setLang(user.language as Lang);
    },
    [client, lang, setLang],
  );

  const signOut = useCallback(() => {
    setToken(null);
    client.clear();
    // To sign-in, not the start page, which would open the demo again. A full load drops all app state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }, [client]);

  const updateMutation = useMutation({
    mutationFn: (body: UserUpdate) => api<User>("/users/me", { method: "PATCH", body }),
    onSuccess: (user) => client.setQueryData(["me"], user),
  });

  const value = useMemo<Context>(
    () => ({
      user: hasToken ? (me.data ?? null) : null,
      loading: hasToken === null || (hasToken && me.isLoading),
      signIn,
      signOut,
      update: updateMutation.mutateAsync,
    }),
    [hasToken, me.data, me.isLoading, signIn, signOut, updateMutation.mutateAsync],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
