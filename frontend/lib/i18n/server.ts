import "server-only";

import { cookies, headers } from "next/headers";

import type { Locale } from "../types";
import { DEFAULT_LOCALE, LOCALE_COOKIE, getDictionary, isLocale } from "./index";

/** Locale from the cookie, falling back to the browser's Accept-Language. */
export async function getLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const accept = (await headers()).get("accept-language") ?? "";
  if (/^\s*(he|iw)\b/i.test(accept)) return "he";
  return DEFAULT_LOCALE;
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, dict: getDictionary(locale) };
}
