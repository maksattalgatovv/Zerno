"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { setApiLanguage } from "@/lib/api/client";
import { dictionaries, type Lang, type TKey } from "@/lib/i18n";

const STORAGE_KEY = "zerno.lang";
const LOCALES: Record<Lang, string> = { en: "en-GB", ru: "ru-RU", kk: "kk-KZ" };

type Context = {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
  t: (key: TKey, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<Context | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const client = useQueryClient();

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      setApiLanguage(next);
      document.documentElement.lang = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Only a convenience: the language is also saved to the profile when signed in.
      }
      // Backend text is localised per request, so cached responses are now stale.
      client.invalidateQueries();
    },
    [client],
  );

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    // The first render must match the server's English HTML, so this waits until after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored && stored in dictionaries) setLang(stored as Lang);
  }, [setLang]);

  const value = useMemo<Context>(
    () => ({
      lang,
      locale: LOCALES[lang],
      setLang,
      t: (key, params) => {
        const text: string = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
        if (!params) return text;
        return text.replace(/\{(\w+)\}/g, (match, name) => String(params[name] ?? match));
      },
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useT must be used inside I18nProvider");
  return context;
}
