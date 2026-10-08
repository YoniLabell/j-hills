"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { parseDay, toDay } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { Neighborhood } from "@/lib/types";

type Values = { check_in?: string; check_out?: string; guests?: string; neighborhood?: string; bedrooms?: string };

function addDays(day: string, n: number) {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

export default function SearchForm({
  initial = {},
  neighborhoods,
  variant = "hero",
}: {
  initial?: Values;
  neighborhoods?: Neighborhood[];
  variant?: "hero" | "filters";
}) {
  const { dict } = useI18n();
  const router = useRouter();
  const [v, setV] = useState<Values>(initial);
  const [error, setError] = useState("");
  const today = toDay(new Date());

  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setV((prev) => {
      const next = { ...prev, [k]: value };
      if (k === "check_in" && value && (!next.check_out || next.check_out <= value)) {
        next.check_out = addDays(value, 1);
      }
      return next;
    });
    setError("");
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (v.check_in && v.check_out && v.check_out <= v.check_in) {
      setError(dict.search.invalidRange);
      return;
    }
    const params = new URLSearchParams();
    for (const [k, value] of Object.entries(v)) if (value) params.set(k, value);
    // Dates only make sense as a pair.
    if (!(v.check_in && v.check_out)) {
      params.delete("check_in");
      params.delete("check_out");
    }
    router.push(`/apartments${params.size ? `?${params}` : ""}`);
  }

  const field = "w-full rounded-xl border border-ink-900/10 bg-white px-3 py-2.5 text-ink-900 shadow-sm outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-400/30";
  const label = "mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-500";
  const hero = variant === "hero";

  return (
    <form
      onSubmit={submit}
      role="search"
      className={
        hero
          ? "grid gap-3 rounded-2xl bg-white/95 p-4 shadow-2xl shadow-ink-900/20 backdrop-blur sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.7fr_auto] lg:items-end"
          : "grid gap-3 rounded-2xl border border-ink-900/5 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.6fr_1fr_0.7fr_auto] lg:items-end"
      }
    >
      <div>
        <label htmlFor={`${variant}-in`} className={label}>{dict.search.checkIn}</label>
        <input id={`${variant}-in`} type="date" min={today} value={v.check_in ?? ""} onChange={set("check_in")} className={field} />
      </div>
      <div>
        <label htmlFor={`${variant}-out`} className={label}>{dict.search.checkOut}</label>
        <input
          id={`${variant}-out`}
          type="date"
          min={v.check_in ? addDays(v.check_in, 1) : addDays(today, 1)}
          value={v.check_out ?? ""}
          onChange={set("check_out")}
          className={field}
        />
      </div>
      <div>
        <label htmlFor={`${variant}-guests`} className={label}>{dict.search.guests}</label>
        <select id={`${variant}-guests`} value={v.guests ?? ""} onChange={set("guests")} className={field}>
          <option value="">—</option>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? dict.search.guest : dict.search.guestsPlural}
            </option>
          ))}
        </select>
      </div>
      {!hero && (
        <>
          <div>
            <label htmlFor="f-neighborhood" className={label}>{dict.search.neighborhood}</label>
            <select id="f-neighborhood" value={v.neighborhood ?? ""} onChange={set("neighborhood")} className={field}>
              <option value="">{dict.search.anyNeighborhood}</option>
              {neighborhoods?.map((n) => (
                <option key={n.value} value={n.value}>{n.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-bedrooms" className={label}>{dict.search.bedrooms}</label>
            <select id="f-bedrooms" value={v.bedrooms ?? ""} onChange={set("bedrooms")} className={field}>
              <option value="">{dict.search.anyBedrooms}</option>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{t(dict.search.bedroomsMin, { n })}</option>
              ))}
            </select>
          </div>
        </>
      )}
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-olive-700 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-olive-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-700 sm:col-span-2 lg:col-span-1"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        {hero ? dict.search.cta : dict.search.apply}
      </button>
      {error && <p role="alert" className="text-sm text-terracotta-600 sm:col-span-2 lg:col-span-full">{error}</p>}
    </form>
  );
}
