import { Bath, BedDouble, MapPin, Users } from "lucide-react";
import Link from "next/link";

import { formatPrice } from "@/lib/format";
import { imageSrcSet, imageUrl } from "@/lib/images";
import { t, type Dictionary } from "@/lib/i18n";
import type { ApartmentCard as Card, Locale } from "@/lib/types";

export default function ApartmentCard({
  apartment: a,
  dict,
  locale,
  query = "",
  priority = false,
}: {
  apartment: Card;
  dict: Dictionary;
  locale: Locale;
  query?: string;
  priority?: boolean;
}) {
  const href = `/apartments/${a.slug}${query ? `?${query}` : ""}`;
  const d = dict.apartments;
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-ink-900/5 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-ink-900/10">
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-sand-200" tabIndex={-1} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl(a.cover_image?.url, 800)}
          srcSet={imageSrcSet(a.cover_image?.url)}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          alt={a.cover_image?.alt_text || a.name}
          loading={priority ? "eager" : "lazy"}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        {a.featured && (
          <span className="absolute start-3 top-3 rounded-full bg-sand-50/95 px-3 py-1 text-xs font-semibold text-gold-700 shadow">
            {d.featured}
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gold-600">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {a.neighborhood}
        </p>
        <h3 className="mt-1.5 font-serif text-2xl leading-tight">
          <Link href={href} className="hover:text-gold-700">{a.name}</Link>
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-700">{a.short_description}</p>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-700">
          <li className="flex items-center gap-1.5"><Users className="h-4 w-4 text-ink-500" aria-hidden="true" />{t(d.guestsShort, { n: a.max_guests })}</li>
          <li className="flex items-center gap-1.5"><BedDouble className="h-4 w-4 text-ink-500" aria-hidden="true" />{a.bedrooms === 1 ? d.bedroomShort : t(d.bedroomsShort, { n: a.bedrooms })}</li>
          <li className="flex items-center gap-1.5"><Bath className="h-4 w-4 text-ink-500" aria-hidden="true" />{a.bathrooms === 1 ? d.bathroomShort : t(d.bathroomsShort, { n: a.bathrooms })}</li>
        </ul>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <p>
            <span className="text-2xl font-semibold">{formatPrice(a.price_per_night, a.currency, locale)}</span>{" "}
            <span className="text-sm text-ink-500">{d.perNight}</span>
          </p>
          <Link href={href} className="rounded-full border border-olive-700 px-4 py-2 text-sm font-semibold text-olive-700 transition hover:bg-olive-700 hover:text-white">
            {d.view}
          </Link>
        </div>
      </div>
    </article>
  );
}
