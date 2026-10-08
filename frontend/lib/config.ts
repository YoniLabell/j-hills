/** Backend base URL used by server-side code (Server Components, sitemap). */
export const API_URL = (
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

/** Public URL of this website, used for canonical/OG URLs and sitemap.xml. */
export function siteUrl(): string {
  return (
    process.env.SITE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
