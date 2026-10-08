import type { MetadataRoute } from "next";

import { API_URL, siteUrl } from "@/lib/config";
import type { ApartmentCard } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/apartments`, changeFrequency: "daily", priority: 0.9 },
  ];
  try {
    const res = await fetch(`${API_URL}/api/apartments`, { cache: "no-store" });
    if (res.ok) {
      const apartments: ApartmentCard[] = await res.json();
      for (const a of apartments) {
        entries.push({ url: `${base}/apartments/${a.slug}`, changeFrequency: "daily", priority: 0.8 });
      }
    }
  } catch (e) {
    console.error("sitemap: could not load apartments", e);
  }
  return entries;
}
