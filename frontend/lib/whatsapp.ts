import { formatDate } from "./format";
import type { Locale } from "./types";

export function whatsappLink(number: string, message: string): string | null {
  const digits = (number || "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
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
