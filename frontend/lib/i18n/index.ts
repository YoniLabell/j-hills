import en, { type Dictionary } from "./en";
import he from "./he";
import type { Locale } from "../types";

export const LOCALES: Locale[] = ["en", "he"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "he";
}

export function getDictionary(locale: Locale): Dictionary {
  return locale === "he" ? he : en;
}

/** Replace {name} placeholders. */
export function t(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export type { Dictionary };
