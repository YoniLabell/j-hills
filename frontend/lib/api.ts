import "server-only";

import { API_URL } from "./config";
import type {
  Amenity,
  ApartmentCard,
  ApartmentDetail,
  Locale,
  Neighborhood,
  SiteSettings,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {}
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  site_name: "Jerusalem Stays",
  site_name_he: "",
  logo_url: "",
  hero_image_url: "",
  phone: "",
  whatsapp_number: "",
  email: "",
  instagram_url: "",
  facebook_url: "",
  default_currency: "ILS",
  currency_symbol: "₪",
  about_text_en: "",
  about_text_he: "",
  footer_text_en: "",
  footer_text_he: "",
  rating: null,
  reviews_count: null,
  host_since_year: null,
};

export async function getSettings(): Promise<SiteSettings> {
  try {
    return await get<SiteSettings>("/api/settings");
  } catch (e) {
    console.error("Could not load site settings", e);
    return DEFAULT_SETTINGS;
  }
}

export function getApartments(
  locale: Locale,
  filters: { neighborhood?: string; bedrooms?: string; guests?: string; featured?: string } = {},
) {
  return get<ApartmentCard[]>("/api/apartments", { lang: locale, ...filters });
}

export function searchApartments(
  locale: Locale,
  params: { check_in: string; check_out: string; guests?: string; neighborhood?: string; bedrooms?: string },
) {
  return get<ApartmentCard[]>("/api/apartments/search", { lang: locale, ...params });
}

export async function getApartment(slug: string, locale: Locale): Promise<ApartmentDetail | null> {
  try {
    return await get<ApartmentDetail>(`/api/apartments/${encodeURIComponent(slug)}`, { lang: locale });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export function getAmenities(locale: Locale) {
  return get<Amenity[]>("/api/amenities", { lang: locale });
}

export function getNeighborhoods(locale: Locale) {
  return get<Neighborhood[]>("/api/neighborhoods", { lang: locale });
}
