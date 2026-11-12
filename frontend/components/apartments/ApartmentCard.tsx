import { Bath, BedDouble, MapPin, Users } from "lucide-react";
import Link from "next/link";

import Rating from "@/components/ui/Rating";
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
    <article className="group relative flex flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-[0_14px_34px_rgba(200,107,152,0.14)] transition hover:-translate-y-1 hover:shadow-[0_20px_44px_rgba(200,107,152,0.22)]">
      <div className="relative m-2.5 aspect-[4/3] overflow-hidden rounded-[1.4rem] bg-sand-200">
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
          <span className="absolute start-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-gold-700 shadow-sm">
            {d.featured}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-2">
        <div className="flex items-center justify-between gap-2 text-sm text-ink-700">
          <span className="flex items-center gap-1 text-gold-700"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{a.neighborhood}</span>
          <Rating value={a.rating} count={a.reviews_count} countLabel={d.reviews} />
        </div>
        <h3 className="mt-1 text-xl leading-snug">
          {/* The whole card is clickable through this link's overlay. */}
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {a.name}
          </Link>
        </h3>
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-700">
          <li className="flex items-center gap-1"><Users className="h-4 w-4 text-ink-500" aria-hidden="true" />{t(d.guestsShort, { n: a.max_guests })}</li>
          <li className="flex items-center gap-1"><BedDouble className="h-4 w-4 text-ink-500" aria-hidden="true" />{a.bedrooms === 1 ? d.bedroomShort : t(d.bedroomsShort, { n: a.bedrooms })}</li>
          <li className="flex items-center gap-1"><Bath className="h-4 w-4 text-ink-500" aria-hidden="true" />{a.bathrooms === 1 ? d.bathroomShort : t(d.bathroomsShort, { n: a.bathrooms })}</li>
        </ul>
        {a.highlights.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={dict.apartment.amenities}>
            {a.highlights.map((h) => (
              <li key={h} className="rounded-full bg-mint px-2.5 py-0.5 text-xs font-medium text-ink-700">{h}</li>
            ))}
          </ul>
        )}
        <p className="mt-auto flex items-center justify-between pt-4">
          <span className="text-xl font-bold">{formatPrice(a.price_per_night, a.currency, locale)}</span>
          <span className="rounded-full bg-mint px-3 py-1 text-sm text-gold-600">{d.perNight}</span>
        </p>
      </div>
    </article>
  );
}
