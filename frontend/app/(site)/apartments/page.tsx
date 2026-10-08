import type { Metadata } from "next";

import ApartmentCard from "@/components/apartments/ApartmentCard";
import SearchForm from "@/components/site/SearchForm";
import { getApartments, getNeighborhoods, searchApartments } from "@/lib/api";
import { formatDate, isIsoDay } from "@/lib/format";
import { t } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import type { ApartmentCard as Card } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.apartments.title, description: dict.apartments.subtitle, alternates: { canonical: "/apartments" } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

export default async function ApartmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const { locale, dict } = await getI18n();
  const sp = await searchParams;
  const filters = {
    check_in: one(sp.check_in),
    check_out: one(sp.check_out),
    guests: one(sp.guests)?.match(/^\d{1,2}$/) ? one(sp.guests) : undefined,
    neighborhood: one(sp.neighborhood),
    bedrooms: one(sp.bedrooms)?.match(/^\d{1,2}$/) ? one(sp.bedrooms) : undefined,
  };
  const hasDates = isIsoDay(filters.check_in) && isIsoDay(filters.check_out) && filters.check_out! > filters.check_in!;

  let apartments: Card[] = [];
  let error = false;
  try {
    apartments = hasDates
      ? await searchApartments(locale, {
          check_in: filters.check_in!,
          check_out: filters.check_out!,
          guests: filters.guests,
          neighborhood: filters.neighborhood,
          bedrooms: filters.bedrooms,
        })
      : await getApartments(locale, { guests: filters.guests, neighborhood: filters.neighborhood, bedrooms: filters.bedrooms });
  } catch {
    error = true;
  }
  const neighborhoods = await getNeighborhoods(locale).catch(() => []);

  const carry = new URLSearchParams();
  if (hasDates) {
    carry.set("check_in", filters.check_in!);
    carry.set("check_out", filters.check_out!);
  }
  if (filters.guests) carry.set("guests", filters.guests);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="font-serif text-4xl sm:text-5xl">{dict.apartments.title}</h1>
        <p className="mt-2 text-ink-700">
          {hasDates
            ? t(dict.apartments.resultsFor, {
                from: formatDate(filters.check_in!, locale),
                to: formatDate(filters.check_out!, locale),
              })
            : dict.apartments.subtitle}
        </p>
      </header>
      <SearchForm variant="filters" initial={hasDates ? filters : { ...filters, check_in: undefined, check_out: undefined }} neighborhoods={neighborhoods} />
      {error ? (
        <p role="alert" className="mt-12 rounded-xl bg-terracotta-500/10 p-6 text-center text-terracotta-600">{dict.booking.errorGeneric}</p>
      ) : apartments.length === 0 ? (
        <p className="mt-12 rounded-xl bg-sand-100 p-10 text-center text-ink-700">{dict.apartments.noResults}</p>
      ) : (
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {apartments.map((a, i) => (
            <ApartmentCard key={a.id} apartment={a} dict={dict} locale={locale} query={carry.toString()} priority={i < 3} />
          ))}
        </div>
      )}
    </div>
  );
}
