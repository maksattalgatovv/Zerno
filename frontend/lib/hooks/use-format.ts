"use client";

import { useMemo } from "react";

import { convertArea, convertSpeed, convertTemp, elapsed, kkDate, type Units } from "@/lib/format";
import type { TKey } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/providers/i18n-provider";

/** Numbers, dates and units in the user's language and measurement system. */
export function useFormat() {
  const { lang, locale, t } = useT();
  const { user } = useAuth();
  const units = (user?.units ?? "metric") as Units;

  return useMemo(() => {
    const number = (value: number, digits = 0) =>
      value.toLocaleString(locale, { maximumFractionDigits: digits });
    const stamp = (value: string, style: "short" | "long" | "time", options: Intl.DateTimeFormatOptions) =>
      lang === "kk" ? kkDate(new Date(value), style) : new Date(value).toLocaleString(locale, options);

    return {
      units,
      number,
      area: (ha: number) => `${number(convertArea(ha, units), 1)} ${t(units === "metric" ? "unit.ha" : "unit.ac")}`,
      temp: (c: number) => `${number(convertTemp(c, units))}°${units === "metric" ? "C" : "F"}`,
      wind: (kmh: number) =>
        `${number(convertSpeed(kmh, units))} ${t(units === "metric" ? "unit.kmh" : "unit.mph")}`,
      ndvi: (value: number | null | undefined) =>
        value === null || value === undefined ? "–" : value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      date: (value: string | null | undefined) =>
        value ? stamp(value, "long", { day: "numeric", month: "short", year: "numeric" }) : "–",
      shortDate: (value: string) => stamp(value, "short", { day: "numeric", month: "short" }),
      dateTime: (value: string | null | undefined) =>
        value ? stamp(value, "time", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–",
      ago: (value: string) => {
        const { unit, n } = elapsed(new Date(value), new Date());
        return t(`time.${unit}` as TKey, { n });
      },
    };
  }, [lang, locale, t, units]);
}
