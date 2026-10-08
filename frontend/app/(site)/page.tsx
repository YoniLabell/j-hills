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
  const about = (locale === "he" ? settings.about_text_he : settings.about_text_en) || settings.about_text_en;
  const wa = whatsappLink(settings.whatsapp_number, inquiryMessage(locale, {}));
  // Optional photo uploaded in Settings; the clean layout works without one.
  const heroImage = settings.hero_image_url;
  const whyIcons = [BadgePercent, MessageCircle, HeartHandshake, CalendarCheck];
  const benefitIcons = [MapPinned, KeyRound, Sparkles, Users];

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="border-b border-sand-200 bg-gradient-to-b from-mint to-white">
        <div className={`mx-auto grid max-w-7xl gap-10 px-4 pb-12 pt-12 sm:px-6 sm:pt-16 lg:px-8 ${heroImage ? "lg:grid-cols-[1.25fr_1fr] lg:items-center" : ""}`}>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gold-700">{dict.hero.eyebrow}</p>
            <h1 className="mt-2 max-w-3xl text-balance text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{dict.hero.title}</h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-700">{dict.hero.subtitle}</p>
            <div className="mt-8 max-w-4xl">
              <SearchForm variant="hero" />
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-800" aria-label={dict.home.whyTitle}>
              {settings.rating != null && (
                <li className="flex items-center gap-1.5">
                  <Rating value={settings.rating} />
                  {settings.reviews_count != null && <span>· {t(dict.home.trustReviews, { n: settings.reviews_count.toLocaleString() })}</span>}
                </li>
              )}
              <li className="flex items-center gap-1.5"><Check className="h-4 w-4 text-gold-700" aria-hidden="true" />{dict.home.trustNoFees}</li>
              <li className="flex items-center gap-1.5"><Check className="h-4 w-4 text-gold-700" aria-hidden="true" />{dict.home.trustNoPrepay}</li>
              {settings.host_since_year != null && (
                <li className="flex items-center gap-1.5"><Check className="h-4 w-4 text-gold-700" aria-hidden="true" />{t(dict.home.trustHostSince, { year: settings.host_since_year })}</li>
              )}
            </ul>
          </div>
          {heroImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroImage} alt="" className="hidden aspect-[4/3] w-full rounded-2xl object-cover shadow-lg lg:block" fetchPriority="high" />
          )}
        </div>
      </section>

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

      {/* ------------------------------------------------------------ how to book */}
      <section className="bg-sand-100 py-14" aria-labelledby="steps-title">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="steps-title" className="text-2xl font-extrabold sm:text-3xl">{dict.home.stepsTitle}</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {dict.home.steps.map((step) => (
              <li key={step.title} className="rounded-2xl border border-sand-200 bg-white p-5">
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
            {about && <p className="mt-4 whitespace-pre-line leading-relaxed text-ink-700">{about}</p>}
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {dict.home.why.map((item, i) => {
              const Icon = whyIcons[i] ?? Award;
              return (
                <div key={item.title} className="rounded-2xl border border-sand-200 bg-white p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-mint text-gold-700">
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
                    className="group block h-full rounded-2xl border border-ink-900/10 bg-white p-6 transition hover:border-gold-500 hover:shadow-lg"
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
        <section className="border-y border-sand-200 bg-sand-100 py-16" aria-labelledby="amenities-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 id="amenities-title" className="text-2xl font-extrabold sm:text-3xl">{dict.home.amenitiesTitle}</h2>
            <p className="mt-2 text-ink-700">{dict.home.amenitiesSubtitle}</p>
            <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {amenities.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-xl border border-sand-200 bg-white px-4 py-3">
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
              <div key={b.title} className="rounded-2xl border border-sand-200 p-5">
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
        <div className="mx-auto flex max-w-5xl flex-col items-center rounded-3xl bg-mint px-6 py-14 text-center">
          <h2 id="contact-title" className="text-2xl font-extrabold sm:text-3xl">{dict.home.contactTitle}</h2>
          <p className="mt-3 max-w-xl text-ink-700">{dict.home.contactText}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 font-semibold text-white shadow hover:brightness-95">
                <WhatsAppIcon className="h-5 w-5" /> {dict.home.whatsappCta}
              </a>
            )}
            {settings.email && (
              <a href={`mailto:${settings.email}`} className="inline-flex items-center gap-2 rounded-full border border-ink-900/20 bg-white px-6 py-3 font-semibold hover:border-gold-500">
                {dict.home.emailCta}
              </a>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
