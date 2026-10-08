"use client";

import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { imageSrcSet, imageUrl } from "@/lib/images";
import { t } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { ImageInfo } from "@/lib/types";

export default function Gallery({ images, name }: { images: ImageInfo[]; name: string }) {
  const { dict, locale } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const rtl = locale === "he";

  // Cover first, then the rest in order.
  const ordered = [...images].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order);

  const go = useCallback(
    (delta: number) => setOpen((i) => (i === null ? i : (i + delta + ordered.length) % ordered.length)),
    [ordered.length],
  );

  useEffect(() => {
    if (open === null) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      // Arrow direction follows reading direction.
      if (e.key === "ArrowRight") go(rtl ? -1 : 1);
      if (e.key === "ArrowLeft") go(rtl ? 1 : -1);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, go, rtl]);

  if (ordered.length === 0) {
    return <div className="aspect-[16/9] rounded-3xl bg-sand-200" />;
  }

  const [cover, ...rest] = ordered;
  // Layout adapts to the number of photos so the grid never has empty cells.
  const thumbs = ordered.length >= 5 ? rest.slice(0, 4) : ordered.length >= 3 ? rest.slice(0, 2) : rest.slice(0, 1);
  const grid =
    ordered.length >= 5 ? "md:grid-cols-4 md:grid-rows-2" : ordered.length >= 3 ? "md:grid-cols-3 md:grid-rows-2" : ordered.length === 2 ? "md:grid-cols-2" : "";
  const coverSpan = ordered.length >= 3 ? "md:col-span-2 md:row-span-2" : "";

  return (
    <>
      <div className={`relative grid h-[280px] gap-2 overflow-hidden rounded-3xl sm:h-[420px] lg:h-[520px] ${grid}`}>
        <button type="button" onClick={() => setOpen(0)} className={`group relative overflow-hidden ${coverSpan}`} aria-label={t(dict.apartment.photo, { n: 1, total: ordered.length })}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(cover.url, 1600)}
            srcSet={imageSrcSet(cover.url, [800, 1200, 1600, 2000])}
            sizes="(min-width: 768px) 50vw, 100vw"
            alt={cover.alt_text || name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        </button>
        {thumbs.map((img, i) => (
          <button key={img.id} type="button" onClick={() => setOpen(i + 1)} className="group relative hidden overflow-hidden md:block" aria-label={t(dict.apartment.photo, { n: i + 2, total: ordered.length })}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl(img.url, 800)} alt={img.alt_text || name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]" />
          </button>
        ))}
        {ordered.length > 1 && (
          <button
            type="button"
            onClick={() => setOpen(0)}
            className="absolute bottom-4 end-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold shadow-lg hover:bg-white"
          >
            <Images className="h-4 w-4" aria-hidden="true" /> {dict.apartment.showAllPhotos} ({ordered.length})
          </button>
        )}
      </div>

      {open !== null && (
        <div role="dialog" aria-modal="true" aria-label={name} className="fixed inset-0 z-50 flex flex-col bg-ink-900/95 text-white">
          <div className="flex items-center justify-between p-4">
            <p className="text-sm" aria-live="polite">{t(dict.apartment.photo, { n: open + 1, total: ordered.length })}</p>
            <button ref={closeRef} type="button" onClick={() => setOpen(null)} className="rounded-full p-2 hover:bg-white/10" aria-label={dict.nav.close}>
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={ordered[open].id}
              src={imageUrl(ordered[open].url, 2000)}
              alt={ordered[open].alt_text || name}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
            {ordered.length > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label={dict.apartment.prev} className="absolute start-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 hover:bg-white/20 sm:start-4">
                  <ChevronLeft className="h-6 w-6 rtl:rotate-180" />
                </button>
                <button type="button" onClick={() => go(1)} aria-label={dict.apartment.next} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 hover:bg-white/20 sm:end-4">
                  <ChevronRight className="h-6 w-6 rtl:rotate-180" />
                </button>
              </>
            )}
          </div>
          {ordered[open].alt_text && <p className="px-4 pb-4 text-center text-sm text-sand-200">{ordered[open].alt_text}</p>}
        </div>
      )}
    </>
  );
}
