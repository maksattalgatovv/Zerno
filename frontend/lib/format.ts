/** Pure helpers for units and values. Covered by lib/format.test.ts. */

export type Units = "metric" | "imperial";

export const haToAcres = (ha: number) => ha * 2.47105;
export const cToF = (c: number) => (c * 9) / 5 + 32;
export const kmhToMph = (kmh: number) => kmh * 0.621371;

export function convertArea(ha: number, units: Units): number {
  return units === "imperial" ? haToAcres(ha) : ha;
}

export function convertTemp(c: number, units: Units): number {
  return units === "imperial" ? cToF(c) : c;
}

export function convertSpeed(kmh: number, units: Units): number {
  return units === "imperial" ? kmhToMph(kmh) : kmh;
}

export type HealthStatus = "healthy" | "attention" | "critical" | "unknown";

export function healthFromNdvi(value: number | null | undefined): HealthStatus {
  if (value === null || value === undefined || Number.isNaN(value)) return "unknown";
  if (value >= 0.6) return "healthy";
  return value >= 0.4 ? "attention" : "critical";
}

function mix(a: number[], b: number[], t: number) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

const LOW = [217, 87, 87];
const MID = [240, 234, 216];
const HIGH = [23, 76, 56];
const SCALE_MIN = 0.2;
const SCALE_MID = 0.5;
const SCALE_MAX = 0.8;

/** Diverging NDVI colour: red for stressed, neutral around 0.5, dark green for dense crops. */
export function ndviColor(value: number): string {
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));
  const rgb =
    clamped < SCALE_MID
      ? mix(LOW, MID, (clamped - SCALE_MIN) / (SCALE_MID - SCALE_MIN))
      : mix(MID, HIGH, (clamped - SCALE_MID) / (SCALE_MAX - SCALE_MID));
  return `rgb(${rgb.join(",")})`;
}

// Browsers commonly ship without Kazakh date data and fall back to forms like "М11 7".
const KK_MONTHS = ["қаң", "ақп", "нау", "сәу", "мам", "мау", "шіл", "там", "қыр", "қаз", "қар", "жел"];

const pad = (value: number) => String(value).padStart(2, "0");

export function kkDate(date: Date, style: "short" | "long" | "time"): string {
  const dayMonth = `${date.getDate()} ${KK_MONTHS[date.getMonth()]}`;
  if (style === "long") return `${dayMonth} ${date.getFullYear()}`;
  if (style === "time") return `${dayMonth}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return dayMonth;
}

export type Elapsed = { unit: "now" | "minutes" | "hours" | "yesterday" | "days"; n: number };

export function elapsed(from: Date, now: Date): Elapsed {
  const minutes = Math.floor((now.getTime() - from.getTime()) / 60_000);
  if (minutes < 1) return { unit: "now", n: 0 };
  if (minutes < 60) return { unit: "minutes", n: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hours", n: hours };
  const days = Math.floor(hours / 24);
  return days === 1 ? { unit: "yesterday", n: 1 } : { unit: "days", n: days };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}
