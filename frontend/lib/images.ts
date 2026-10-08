/**
 * Return an optimized URL for an image. Cloudinary URLs get automatic format,
 * quality and a width limit; other URLs are returned unchanged.
 */
export function imageUrl(url: string | undefined | null, width = 1200): string {
  if (!url) return "/images/placeholders/fallback.svg";
  const marker = "/image/upload/";
  if (url.includes("res.cloudinary.com") && url.includes(marker)) {
    const [head, tail] = url.split(marker);
    return `${head}${marker}f_auto,q_auto,c_limit,w_${width}/${tail}`;
  }
  return url;
}

export function imageSrcSet(url: string | undefined | null, widths = [480, 800, 1200, 1800]): string | undefined {
  if (!url || !url.includes("res.cloudinary.com")) return undefined;
  return widths.map((w) => `${imageUrl(url, w)} ${w}w`).join(", ");
}
