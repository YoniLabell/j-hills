"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { enUS, he } from "react-day-picker/locale";
import "react-day-picker/style.css";

import { formatDate, formatPrice, nightsBetween, parseDay, toDay } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { Availability } from "@/lib/types";
import { inquiryMessage, whatsappLink } from "@/lib/whatsapp";

import { WhatsAppIcon } from "../ui/BrandIcons";

type Apt = {
  id: number;
  name: string;
  max_guests: number;
  min_nights: number;
  price_per_night: number;
  cleaning_fee: number;
  currency: string;
};

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Blocked nights (YYYY-MM-DD) for the next ~18 months. */
async function fetchBlockedNights(apartmentId: number, today: Date): Promise<Set<string>> {
  const start = toDay(today);
  const end = toDay(addDays(today, 540));
  const res = await fetch(`/api/apartments/${apartmentId}/availability?start_date=${start}&end_date=${end}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Availability request failed: ${res.status}`);
  const data: Availability = await res.json();
  const nights = new Set<string>();
  for (const p of data.blocked) {
    for (let d = parseDay(p.start_date); d < parseDay(p.end_date); d = addDays(d, 1)) nights.add(toDay(d));
  }
  return nights;
}

function useIsWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px) and (max-width: 1023px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

export default function BookingWidget({
  apartment,
  whatsappNumber,
  initialCheckIn,
  initialCheckOut,
  initialGuests,
}: {
  apartment: Apt;
  whatsappNumber: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
}) {
  const { dict, locale } = useI18n();
  const b = dict.booking;
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  // Blocked nights as YYYY-MM-DD strings. A night is blocked if someone sleeps there.
  const [blocked, setBlocked] = useState<Set<string> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [guests, setGuests] = useState(Math.min(Math.max(initialGuests || 2, 1), apartment.max_guests));
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", message: "", website: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const twoMonths = useIsWide();

  const reloadAvailability = useCallback(() => {
    fetchBlockedNights(apartment.id, today)
      .then((nights) => {
        setBlocked(nights);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [apartment.id, today]);

  const isNightFree = useCallback((d: Date) => d >= today && !!blocked && !blocked.has(toDay(d)), [blocked, today]);

  /** Can a guest arriving on `from` leave on `to`? Every night in between must be free. */
  const canStay = useCallback(
    (from: Date, to: Date) => {
      if (to <= from) return false;
      for (let d = new Date(from); d < to; d = addDays(d, 1)) if (!isNightFree(d)) return false;
      return true;
    },
    [isNightFree],
  );

  useEffect(() => {
    let cancelled = false;
    fetchBlockedNights(apartment.id, today)
      .then((nights) => {
        if (cancelled) return;
        setBlocked(nights);
        // Pre-select dates carried over from the search, if they're still free.
        if (!initialCheckIn || !initialCheckOut) return;
        const from = parseDay(initialCheckIn);
        const to = parseDay(initialCheckOut);
        let ok = to > from && from >= today;
        for (let d = new Date(from); ok && d < to; d = addDays(d, 1)) ok = !nights.has(toDay(d));
        if (ok) setRange({ from, to });
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [apartment.id, initialCheckIn, initialCheckOut, today]);

  const selectingCheckout = !!range?.from && !range?.to;

  // Hotel-style selection: a check-out day only needs the nights *before* it to be free,
  // so the day another guest checks in can still be chosen as your check-out.
  function onDayClick(day: Date) {
    setError("");
    if (!range?.from || range.to) {
      if (isNightFree(day)) setRange({ from: day, to: undefined });
      return;
    }
    if (day <= range.from) {
      if (isNightFree(day)) setRange({ from: day, to: undefined });
      return;
    }
    if (canStay(range.from, day)) {
      setRange({ from: range.from, to: day });
    } else if (isNightFree(day)) {
      setRange({ from: day, to: undefined });
    }
  }

  const disabled = (day: Date) => {
    if (!blocked) return true;
    if (day < today) return true;
    if (isNightFree(day)) return false;
    // A booked night may still be a valid check-out day.
    return !(selectingCheckout && range?.from && canStay(range.from, day));
  };

  const checkIn = range?.from ? toDay(range.from) : undefined;
  const checkOut = range?.to ? toDay(range.to) : undefined;
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const tooShort = nights > 0 && nights < apartment.min_nights;
  const accommodation = nights * apartment.price_per_night;
  const total = nights ? accommodation + apartment.cleaning_fee : 0;
  const money = (n: number) => formatPrice(n, apartment.currency, locale);

  const waHref = whatsappLink(
    whatsappNumber,
    inquiryMessage(locale, { apartment: apartment.name, checkIn, checkOut, guests }),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!checkIn || !checkOut || tooShort) return;
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/booking-inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apartment_id: apartment.id, check_in: checkIn, check_out: checkOut, guests, locale, ...form }),
      });
      if (res.ok) {
        setStatus("sent");
        return;
      }
      setStatus("idle");
      if (res.status === 409) {
        setError(b.errorUnavailable);
        setRange(undefined);
        reloadAvailability();
      } else if (res.status === 429) {
        setError(b.errorRate);
      } else if (res.status === 422) {
        const body = await res.json().catch(() => null);
        const detail = body?.detail;
        setError(typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d: { msg: string }) => d.msg.replace(/^Value error, /, "")).join(" ") : b.errorGeneric);
      } else {
        setError(b.errorGeneric);
      }
    } catch {
      setStatus("idle");
      setError(b.errorGeneric);
    }
  }

  const input = "w-full rounded-xl border border-ink-900/15 bg-white px-3 py-2.5 outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-400/30";

  if (status === "sent") {
    return (
      <div className="rounded-3xl bg-white p-6 text-center shadow-xl shadow-ink-900/5 ring-1 ring-ink-900/5" role="status">
        <CheckCircle2 className="mx-auto h-12 w-12 text-olive-600" aria-hidden="true" />
        <h2 className="mt-4 font-serif text-2xl">{b.successTitle}</h2>
        <p className="mt-2 text-ink-700">{b.successText}</p>
        <p className="mt-4 text-sm text-ink-500">
          {formatDate(checkIn!, locale)} – {formatDate(checkOut!, locale)} · {guests} {guests === 1 ? dict.search.guest : dict.search.guestsPlural}
        </p>
        <button type="button" className="mt-6 text-sm font-semibold text-gold-700 underline-offset-4 hover:underline" onClick={() => { setStatus("idle"); setRange(undefined); }}>
          {b.another}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow-xl shadow-ink-900/5 ring-1 ring-ink-900/5 sm:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl">{b.title}</h2>
        <p>
          <span className="text-xl font-semibold">{money(apartment.price_per_night)}</span>{" "}
          <span className="text-sm text-ink-500">{dict.apartments.perNight}</span>
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-ink-900/10 p-2" aria-live="polite">
        {loadError ? (
          <p className="p-6 text-center text-sm text-terracotta-600">{b.loadError}</p>
        ) : !blocked ? (
          <p className="flex items-center justify-center gap-2 p-10 text-sm text-ink-500">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {b.loading}
          </p>
        ) : (
          <DayPicker
            mode="range"
            selected={range}
            onSelect={(_, day) => onDayClick(day)}
            disabled={disabled}
            modifiers={{ booked: (d: Date) => !!blocked?.has(toDay(d)) }}
            modifiersClassNames={{ booked: "booked" }}
            startMonth={today}
            endMonth={addDays(today, 540)}
            numberOfMonths={twoMonths ? 2 : 1}
            locale={locale === "he" ? he : enUS}
            dir={dict.dir}
            weekStartsOn={0}
            className="mx-auto w-fit"
          />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-500">
        <span className="flex gap-4">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-ink-900/20 bg-white" />{b.legendAvailable}</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-sand-200 line-through" />{b.legendUnavailable}</span>
        </span>
        {range?.from && (
          <button type="button" onClick={() => setRange(undefined)} className="font-semibold text-gold-700 hover:underline">
            {b.clearDates}
          </button>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-ink-900/10 text-sm">
        <div className="border-e border-ink-900/10 p-3">
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-500">{dict.search.checkIn}</dt>
          <dd className="mt-0.5 font-medium">{checkIn ? formatDate(checkIn, locale) : "—"}</dd>
        </div>
        <div className="p-3">
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-500">{dict.search.checkOut}</dt>
          <dd className="mt-0.5 font-medium">{checkOut ? formatDate(checkOut, locale) : "—"}</dd>
        </div>
      </dl>
      {!checkOut && blocked && <p className="mt-2 text-sm text-ink-500">{selectingCheckout ? b.selectCheckout : b.selectDates}</p>}
      {tooShort && <p className="mt-2 text-sm text-terracotta-600">{t(b.minNights, { n: apartment.min_nights })}</p>}

      {nights > 0 && !tooShort && (
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between"><dt>{t(b.nightsTimesRate, { rate: money(apartment.price_per_night), n: nights })}</dt><dd>{money(accommodation)}</dd></div>
          {apartment.cleaning_fee > 0 && <div className="flex justify-between"><dt>{dict.apartment.cleaningFee}</dt><dd>{money(apartment.cleaning_fee)}</dd></div>}
          <div className="flex justify-between border-t border-ink-900/10 pt-2 text-base font-semibold"><dt>{b.total}</dt><dd>{money(total)}</dd></div>
        </dl>
      )}

      <form onSubmit={submit} className="mt-5 space-y-3">
        <div>
          <label htmlFor="bw-guests" className="mb-1 block text-sm font-medium">{dict.search.guests}</label>
          <select id="bw-guests" value={guests} onChange={(e) => setGuests(Number(e.target.value))} className={input}>
            {Array.from({ length: apartment.max_guests }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? dict.search.guest : dict.search.guestsPlural}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bw-name" className="mb-1 block text-sm font-medium">{b.fullName}</label>
          <input id="bw-name" required minLength={2} maxLength={200} autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={input} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div>
            <label htmlFor="bw-phone" className="mb-1 block text-sm font-medium">{b.phone}</label>
            <input id="bw-phone" type="tel" required dir="ltr" autoComplete="tel" pattern="[0-9+\-() ]{5,50}" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${input} text-start`} />
          </div>
          <div>
            <label htmlFor="bw-email" className="mb-1 block text-sm font-medium">{b.email}</label>
            <input id="bw-email" type="email" required dir="ltr" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${input} text-start`} />
          </div>
        </div>
        <div>
          <label htmlFor="bw-message" className="mb-1 block text-sm font-medium">{b.message}</label>
          <textarea id="bw-message" rows={3} maxLength={3000} placeholder={b.messagePlaceholder} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={input} />
        </div>
        {/* Honeypot: hidden from people, tempting for bots. */}
        <div aria-hidden="true" className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="bw-website">Website</label>
          <input id="bw-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        </div>

        {error && <p role="alert" className="rounded-xl bg-terracotta-500/10 p-3 text-sm text-terracotta-600">{error}</p>}

        <button
          type="submit"
          disabled={!checkOut || tooShort || status === "sending"}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-olive-700 px-6 py-3.5 font-semibold text-white transition hover:bg-olive-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "sending" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {status === "sending" ? b.sending : b.submit}
        </button>
        <p className="text-center text-xs text-ink-500">{b.note}</p>
      </form>

      {waHref && (
        <div className="mt-5 border-t border-ink-900/10 pt-4 text-center">
          <p className="text-sm text-ink-500">{b.orWhatsapp}</p>
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#25D366] px-5 py-2 text-sm font-semibold text-[#128C7E] hover:bg-[#25D366]/10">
            <WhatsAppIcon className="h-4 w-4" /> {b.whatsapp}
          </a>
        </div>
      )}
    </div>
  );
}
