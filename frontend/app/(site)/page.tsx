import { Award, BadgePercent, CalendarCheck, Check, HeartHandshake, KeyRound, MapPinned, MessageCircle, Sparkles, Users } from "lucide-react";
import Link from "next/link";

import ApartmentCard from "@/components/apartments/ApartmentCard";
import SearchForm from "@/components/site/SearchForm";
import AmenityIcon from "@/components/ui/AmenityIcon";
import Rating from "@/components/ui/Rating";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { getAmenities, getApartments, getNeighborhoods, getSettings } from "@/lib/api";
import { t } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { inquiryMessage, whatsappLink } from "@/lib/whatsapp";

export default async function HomePage() {
  const { locale, dict } = await getI18n();
  const [settings, apartments, amenities, neighborhoods] = await Promise.all([
    getSettings(),
    getApartments(locale).catch(() => []),
    getAmenities(locale).catch(() => []),
    getNeighborhoods(locale).catch(() => []),
  ]);
  const featured = (apartments.filter((a) => a.featured).length ? apartments.filter((a) => a.featured) : apartments).slice(0, 3);
  const siteName = locale === "he" && settings.site_name_he ? settings.site_name_he : settings.site_name;
  const about = (locale === "he" ? settings.about_text_he : settings.about_text_en) || settings.about_text_en;
  const wa = whatsappLink(settings.whatsapp_number, inquiryMessage(locale, {}));
  // Optional photo uploaded in Settings; the clean layout works without one.
  const heroImage = settings.hero_image_url;
  const whyIcons = [BadgePercent, MessageCircle, HeartHandshake, CalendarCheck];
  const benefitIcons = [MapPinned, KeyRound, Sparkles, Users];

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="sunset-sky relative isolate overflow-hidden pb-28 text-white sm:pb-32">
        {/* Skyline silhouette blended into the bottom of the sky (or the photo uploaded in Settings). */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-cover bg-[center_78%] opacity-50 mix-blend-multiply [mask-image:linear-gradient(to_bottom,transparent,black_70%)] sm:h-56"
          style={{ backgroundImage: `url(${heroImage || "/images/hero-jerusalem.svg"})` }}
        />
        <div className="mx-auto max-w-4xl px-4 pt-16 text-center sm:px-6 sm:pt-20">
          <p className="text-sm font-medium text-white/90">{dict.hero.eyebrow}</p>
          <h1 className="mx-auto mt-3 max-w-3xl text-balance text-4xl leading-tight [text-shadow:0_2px_20px_rgba(108,91,158,0.35)] sm:text-6xl">{dict.hero.title}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-white/95">{dict.hero.subtitle}</p>
        </div>
      </section>
      <div className="relative z-10 mx-auto -mt-20 max-w-4xl px-4 sm:px-6">
        <SearchForm variant="hero" />
        <ul className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-ink-700" aria-label={dict.home.whyTitle}>
          {settings.rating != null && (
            <li className="flex items-center gap-1.5">
              <Rating value={settings.rating} />
              {settings.reviews_count != null && <span>· {t(dict.home.trustReviews, { n: settings.reviews_count.toLocaleString() })}</span>}
            </li>
          )}
          <li className="flex items-center gap-1.5"><Check className="h-4 w-4 text-gold-500" aria-hidden="true" />{dict.home.trustNoFees}</li>
          <li className="flex items-center gap-1.5"><Check className="h-4 w-4 text-gold-500" aria-hidden="true" />{dict.home.trustNoPrepay}</li>
          {settings.host_since_year != null && (
            <li className="flex items-center gap-1.5"><Check className="h-4 w-4 text-gold-500" aria-hidden="true" />{t(dict.home.trustHostSince, { year: settings.host_since_year })}</li>
          )}
        </ul>
      </div>

      {/* ------------------------------------------------------------ featured */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" aria-labelledby="featured-title">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 id="featured-title" className="text-2xl font-extrabold sm:text-3xl">{dict.home.featuredTitle}</h2>
              <p className="mt-2 text-ink-700">{dict.home.featuredSubtitle}</p>
            </div>
            <Link href="/apartments" className="font-semibold text-gold-700 underline-offset-4 hover:underline">
              {dict.home.viewAll} <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span>
            </Link>
          </div>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((a, i) => (
              <ApartmentCard key={a.id} apartment={a} dict={dict} locale={locale} priority={i === 0} />
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ from the host */}
      {about && (
        <section className="mx-auto max-w-5xl px-4 pb-14 sm:px-6" aria-label={dict.home.whyTitle}>
          <div className="grid items-center gap-5 rounded-[2rem] bg-gradient-to-br from-[#fff0e6] to-[#f6e6f1] p-7 sm:grid-cols-[auto_1fr] sm:p-9">
            <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#ff9a8b] to-dusk font-serif text-2xl text-white">
              {siteName.trim().charAt(0)}
            </span>
            <p className="whitespace-pre-line text-lg leading-relaxed text-ink-800">{about}</p>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ how to book */}
      <section className="bg-gradient-to-b from-sand-100 to-sand-50 py-14" aria-labelledby="steps-title">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="steps-title" className="text-2xl font-extrabold sm:text-3xl">{dict.home.stepsTitle}</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {dict.home.steps.map((step) => (
              <li key={step.title} className="rounded-3xl bg-white p-6 shadow-[0_12px_30px_rgba(200,107,152,0.10)]">
                <p className="text-sm font-bold text-gold-700">{step.title}</p>
                <p className="mt-1 leading-relaxed text-ink-700">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------ why direct */}
      <section id="why-direct" className="scroll-mt-16 py-16" aria-labelledby="why-title">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 id="why-title" className="text-2xl font-extrabold sm:text-3xl">{dict.home.whyTitle}</h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {dict.home.why.map((item, i) => {
              const Icon = whyIcons[i] ?? Award;
              return (
                <div key={item.title} className="rounded-3xl bg-white p-6 shadow-[0_12px_30px_rgba(200,107,152,0.10)]">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#ffe1d2] to-[#f6dcea] text-gold-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-700">{item.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ locations */}
      {neighborhoods.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" aria-labelledby="locations-title">
          <h2 id="locations-title" className="text-2xl font-extrabold sm:text-3xl">{dict.home.locationsTitle}</h2>
          <p className="mt-2 text-ink-700">{dict.home.locationsSubtitle}</p>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {neighborhoods.map((n) => {
              return (
                <li key={n.value}>
                  <Link
                    href={`/apartments?neighborhood=${encodeURIComponent(n.value)}`}
                    className="group block h-full rounded-3xl bg-white p-6 shadow-[0_12px_30px_rgba(200,107,152,0.10)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(200,107,152,0.18)]"
                  >
                    <p className="flex items-center justify-between">
                      <span className="text-xl font-bold group-hover:text-gold-700">{n.label}</span>
                      <span className="rounded-full bg-sand-100 px-3 py-1 text-xs font-semibold text-ink-700">
                        {n.count === 1 ? dict.home.apartmentCount : t(dict.home.apartmentsCount, { n: n.count })}
                      </span>
                    </p>
                    {dict.home.locations[n.value] && (
                      <p className="mt-3 text-sm leading-relaxed text-ink-700">{dict.home.locations[n.value]}</p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------------ amenities */}
      {amenities.length > 0 && (
        <section className="bg-gradient-to-b from-sand-50 to-sand-100 py-16" aria-labelledby="amenities-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 id="amenities-title" className="text-2xl font-extrabold sm:text-3xl">{dict.home.amenitiesTitle}</h2>
            <p className="mt-2 text-ink-700">{dict.home.amenitiesSubtitle}</p>
            <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {amenities.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_6px_18px_rgba(200,107,152,0.08)]">
                  <AmenityIcon icon={a.icon} className="h-5 w-5 shrink-0 text-gold-700" />
                  <span className="text-sm">{a.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ benefits */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" aria-labelledby="benefits-title">
        <h2 id="benefits-title" className="text-2xl font-extrabold sm:text-3xl">{dict.home.benefitsTitle}</h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {dict.home.benefits.map((b, i) => {
            const Icon = benefitIcons[i] ?? Sparkles;
            return (
              <div key={b.title} className="rounded-3xl bg-white p-6 shadow-[0_12px_30px_rgba(200,107,152,0.10)]">
                <Icon className="h-6 w-6 text-gold-600" aria-hidden="true" />
                <h3 className="mt-3 font-semibold">{b.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{b.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------ contact */}
      <section id="contact" className="scroll-mt-16 px-4 pb-20 sm:px-6 lg:px-8" aria-labelledby="contact-title">
        <div className="sunset-sky mx-auto flex max-w-5xl flex-col items-center rounded-[2rem] px-6 py-14 text-center text-white">
          <h2 id="contact-title" className="text-2xl font-extrabold sm:text-3xl">{dict.home.contactTitle}</h2>
          <p className="mt-3 max-w-xl text-white/90">{dict.home.contactText}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 font-semibold text-white shadow hover:brightness-95">
                <WhatsAppIcon className="h-5 w-5" /> {dict.home.whatsappCta}
              </a>
            )}
            {settings.email && (
              <a href={`mailto:${settings.email}`} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-ink-900 hover:bg-sand-50">
                {dict.home.emailCta}
              </a>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
