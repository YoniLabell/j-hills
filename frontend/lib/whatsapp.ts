import { formatDate } from "./format";
import type { Locale } from "./types";

export function whatsappLink(number: string, message: string): string | null {
  const digits = (number || "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Detailed message from the apartment page: everything the owner needs to reply. */
export function bookingWhatsAppMessage(
  locale: Locale,
  opts: {
    apartment: string;
    checkIn?: string;
    checkOut?: string;
    nights?: number;
    guests?: number;
    total?: string;
    name?: string;
    message?: string;
    url?: string;
  },
): string {
  const { apartment, checkIn, checkOut, nights, guests, total, name, message, url } = opts;
  const dateOpts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  const he = locale === "he";
  const lines = [he ? "שלום," : "Hello,", he ? `אני מתעניין/ת ב${apartment}` : `I'm interested in ${apartment}`];
  if (checkIn && checkOut) {
    const range = he
      ? `מ-${formatDate(checkIn, locale, dateOpts)} עד ${formatDate(checkOut, locale, dateOpts)}`
      : `from ${formatDate(checkIn, locale, dateOpts)} to ${formatDate(checkOut, locale, dateOpts)}`;
    const n = nights ? (he ? ` (${nights === 1 ? "לילה אחד" : `${nights} לילות`})` : ` (${nights} night${nights === 1 ? "" : "s"})`) : "";
    lines.push(range + n);
  }
  if (guests) lines.push(he ? `${guests === 1 ? "אורח אחד" : `${guests} אורחים`}` : `${guests} guest${guests === 1 ? "" : "s"}`);
  if (total) lines.push(he ? `מחיר משוער: ${total}` : `Estimated total: ${total}`);
  if (name?.trim()) lines.push(he ? `שם: ${name.trim()}` : `Name: ${name.trim()}`);
  if (message?.trim()) lines.push("", message.trim());
  if (url) lines.push("", he ? `קישור לדירה: ${url}` : `Apartment link: ${url}`);
  return lines.join("\n");
}

export function inquiryMessage(
  locale: Locale,
  opts: { apartment?: string; checkIn?: string; checkOut?: string; guests?: number },
): string {
  const { apartment, checkIn, checkOut, guests } = opts;
  const dateOpts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  if (locale === "he") {
    const lines = ["שלום,"];
    lines.push(apartment ? `אני מתעניין/ת ב${apartment}` : "אני מתעניין/ת באחת הדירות שלכם");
    if (checkIn && checkOut) {
      lines.push(`מ-${formatDate(checkIn, locale, dateOpts)} עד ${formatDate(checkOut, locale, dateOpts)}`);
    }
    if (guests) lines.push(`עבור ${guests} אורחים.`);
    return lines.join("\n");
  }
  const lines = ["Hello,"];
  lines.push(apartment ? `I'm interested in ${apartment}` : "I'm interested in one of your apartments");
  if (checkIn && checkOut) {
    lines.push(`from ${formatDate(checkIn, locale, dateOpts)} to ${formatDate(checkOut, locale, dateOpts)}`);
  }
  if (guests) lines.push(`for ${guests} guest${guests === 1 ? "" : "s"}.`);
  return lines.join("\n");
}
