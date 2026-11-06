import { en } from "./en";
import { kk } from "./kk";
import { ru } from "./ru";

export type TKey = keyof typeof en;
/** Every language must define every key, or the build fails. */
export type Dictionary = Record<TKey, string>;
export type Lang = "en" | "ru" | "kk";

export const dictionaries: Record<Lang, Dictionary> = { en, ru, kk };

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "kk", label: "Қазақша" },
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
];
