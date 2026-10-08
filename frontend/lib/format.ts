import type { Locale } from "./types";

const intlLocale = (locale: Locale) => (locale === "he" ? "he-IL" : "en-US");

export function formatPrice(amount: number, currency: string, locale: Locale): string {
  try {
    return new Intl.NumberFormat(intlLocale(locale), {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Parse a YYYY-MM-DD string as a local calendar date (no timezone shifts). */
export function parseDay(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date as YYYY-MM-DD using local calendar fields. */
export function toDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDate(value: string | Date, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === "string" ? parseDay(value) : value;
  return new Intl.DateTimeFormat(intlLocale(locale), opts ?? { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function formatTime(value: string): string {
  return value.slice(0, 5);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((parseDay(checkOut).getTime() - parseDay(checkIn).getTime()) / 86_400_000);
}

export function isIsoDay(value: string | undefined | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDay(value).getTime());
}
