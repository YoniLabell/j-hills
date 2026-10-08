import { ArrowLeft, Bath, Bed, BedDouble, Clock, ExternalLink, MapPin, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import BookingWidget from "@/components/apartments/BookingWidget";
import Gallery from "@/components/apartments/Gallery";
import AmenityIcon from "@/components/ui/AmenityIcon";
import { getApartment } from "@/lib/api";
import { siteUrl } from "@/lib/config";
import { formatPrice, formatTime, isIsoDay } from "@/lib/format";
import { imageUrl } from "@/lib/images";
import { t } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const { locale } = await getI18n();
  const apt = await getApartment(slug, locale);
  if (!apt) return { title: "Not found", robots: { index: false } };
  const cover = apt.images.find((i) => i.is_cover) ?? apt.images[0];
  const ogImage = cover ? new URL(imageUrl(cover.url, 1200), siteUrl()).toString() : undefined;
  return {
    title: apt.seo_title || apt.name,
    description: apt.seo_description,
    alternates: { canonical: `/apartments/${apt.slug}` },
    openGraph: {
      title: apt.seo_title || apt.name,
      description: apt.seo_description,
      url: `/apartments/${apt.slug}`,
      type: "website",
      images: ogImage ? [{ url: ogImage, alt: cover?.alt_text || apt.name }] : undefined,
    },
    twitter: { card: "summary_large_image", title: apt.seo_title || apt.name, description: apt.seo_description, images: ogImage ? [ogImage] : undefined },
  };
}

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ApartmentPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { locale, dict } = await getI18n();
  const apt = await getApartment(slug, locale);
  if (!apt) notFound();
  const d = dict.apartment;

  const checkIn = one(sp.check_in);
  const checkOut = one(sp.check_out);
  const guests = Number(one(sp.guests)) || undefined;

  const facts = [
    { icon: Users, label: d.guests, value: apt.max_guests },
    { icon: BedDouble, label: d.bedrooms, value: apt.bedrooms },
    { icon: Bed, label: d.beds, value: apt.beds },
    { icon: Bath, label: d.bathrooms, value: apt.bathrooms },
  ];

  const mapEmbed =
    apt.latitude != null && apt.longitude != null
      ? `https://maps.google.com/maps?q=${apt.latitude},${apt.longitude}&z=15&hl=${locale}&output=embed`
      : null;
  const mapLink = apt.google_maps_url || (apt.latitude != null ? `https://www.google.com/maps?q=${apt.latitude},${apt.longitude}` : null);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VacationRental",
    name: apt.name,
    description: apt.short_description,
    image: apt.images.map((i) => new URL(imageUrl(i.url, 1200), siteUrl()).toString()),
    address: { "@type": "PostalAddress", addressLocality: "Jerusalem", addressCountry: "IL" },
    ...(apt.latitude != null ? { geo: { "@type": "GeoCoordinates", latitude: apt.latitude, longitude: apt.longitude } } : {}),
    containsPlace: { "@type": "Accommodation", occupancy: { "@type": "QuantitativeValue", value: apt.max_guests }, numberOfBedrooms: apt.bedrooms, numberOfBathroomsTotal: apt.bathrooms },
  };

  return (
    <article className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Link href={`/apartments${checkIn && checkOut ? `?check_in=${checkIn}&check_out=${checkOut}` : ""}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:text-gold-700">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /> {d.back}
      </Link>

      <header className="mt-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-gold-600">
          <MapPin className="h-4 w-4" aria-hidden="true" /> {apt.neighborhood}
        </p>
        <h1 className="mt-1 font-serif text-4xl leading-tight sm:text-5xl">{apt.name}</h1>
        <p className="mt-2 max-w-3xl text-lg text-ink-700">{apt.short_description}</p>
      </header>

      <div className="mt-6">
        <Gallery images={apt.images} name={apt.name} />
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_420px]">
        <div className="min-w-0 space-y-12">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {facts.map((f) => (
              <li key={f.label} className="rounded-2xl bg-white p-4 text-center ring-1 ring-ink-900/5">
                <f.icon className="mx-auto h-6 w-6 text-gold-600" aria-hidden="true" />
                <p className="mt-2 text-2xl font-semibold">{f.value}</p>
                <p className="text-xs uppercase tracking-wider text-ink-500">{f.label}</p>
              </li>
            ))}
          </ul>

          <section aria-labelledby="overview">
            <h2 id="overview" className="font-serif text-3xl">{d.overview}</h2>
            <div className="mt-4 space-y-4 whitespace-pre-line leading-relaxed text-ink-800">{apt.description}</div>
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div className="flex gap-2"><dt className="font-semibold">{formatPrice(apt.price_per_night, apt.currency, locale)}</dt><dd className="text-ink-500">{dict.apartments.perNight}</dd></div>
              {apt.cleaning_fee > 0 && (
                <div className="flex gap-2"><dt className="text-ink-500">{d.cleaningFee}:</dt><dd className="font-semibold">{formatPrice(apt.cleaning_fee, apt.currency, locale)}</dd></div>
              )}
              {apt.min_nights > 1 && <div className="text-ink-500">{t(d.minNights, { n: apt.min_nights })}</div>}
            </dl>
          </section>

          {apt.amenities.length > 0 && (
            <section aria-labelledby="amenities">
              <h2 id="amenities" className="font-serif text-3xl">{d.amenities}</h2>
              <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {apt.amenities.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 border-b border-ink-900/5 py-2">
                    <AmenityIcon icon={a.icon} className="h-5 w-5 text-gold-600" />
                    {a.name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="rules" className="grid gap-8 sm:grid-cols-2">
            <div>
              <h2 id="rules" className="font-serif text-3xl">{d.houseRules}</h2>
              <ul className="mt-4 space-y-2 text-ink-800">
                {apt.house_rules
                  .split("\n")
                  .map((r) => r.trim())
                  .filter(Boolean)
                  .map((r) => (
                    <li key={r} className="flex gap-2"><span className="text-gold-500" aria-hidden="true">✦</span>{r}</li>
                  ))}
              </ul>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-900/5">
                <Clock className="h-6 w-6 text-gold-600" aria-hidden="true" />
                <div><p className="text-xs uppercase tracking-wider text-ink-500">{d.checkIn}</p><p className="font-semibold">{t(d.after, { t: formatTime(apt.check_in_time) })}</p></div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-900/5">
                <Clock className="h-6 w-6 text-gold-600" aria-hidden="true" />
                <div><p className="text-xs uppercase tracking-wider text-ink-500">{d.checkOut}</p><p className="font-semibold">{t(d.before, { t: formatTime(apt.check_out_time) })}</p></div>
              </div>
            </div>
          </section>

          {(mapEmbed || mapLink) && (
            <section aria-labelledby="location">
              <h2 id="location" className="font-serif text-3xl">{d.location}</h2>
              {mapEmbed && (
                <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-ink-900/10">
                  <iframe title={`${d.location} – ${apt.name}`} src={mapEmbed} className="h-80 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                </div>
              )}
              {mapLink && (
                <a href={mapLink} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-gold-700 hover:underline">
                  {d.openMap} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </section>
          )}
        </div>

        <aside id="book" className="lg:sticky lg:top-24 lg:self-start" aria-label={dict.booking.title}>
          <BookingWidget
            apartment={{
              id: apt.id,
              slug: apt.slug,
              name: apt.name,
              max_guests: apt.max_guests,
              min_nights: apt.min_nights,
              price_per_night: apt.price_per_night,
              cleaning_fee: apt.cleaning_fee,
              currency: apt.currency,
            }}
            whatsappNumber={apt.whatsapp_number}
            email={apt.contact_email}
            pageUrl={`${siteUrl()}/apartments/${apt.slug}`}
            initialCheckIn={isIsoDay(checkIn) ? checkIn : undefined}
            initialCheckOut={isIsoDay(checkOut) ? checkOut : undefined}
            initialGuests={guests}
          />
        </aside>
      </div>
    </article>
  );
}
