"use client";

import { CheckCircle2, LoaderCircle, Mail } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { enUS, he } from "react-day-picker/locale";
import "react-day-picker/style.css";

import { formatDate, formatPrice, nightsBetween, parseDay, toDay } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { Availability } from "@/lib/types";
import { bookingWhatsAppMessage, whatsappLink } from "@/lib/whatsapp";

import { WhatsAppIcon } from "../ui/BrandIcons";

type Apt = {
  id: number;
  slug: string;
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
  email,
  pageUrl,
  initialCheckIn,
  initialCheckOut,
  initialGuests,
}: {
  apartment: Apt;
  /** The apartment owner's WhatsApp (or the site-wide number). */
  whatsappNumber: string;
  /** Site contact email, offered to guests without WhatsApp. */
  email: string;
  pageUrl: string;
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
  const [fullName, setFullName] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [opened, setOpened] = useState<"whatsapp" | "email" | null>(null);
  const twoMonths = useIsWide();

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
    setOpened(null);
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

  // Everything the visitor has entered so far goes into the message.
  const messageText = bookingWhatsAppMessage(locale, {
    apartment: apartment.name,
    checkIn,
    checkOut: checkIn ? checkOut : undefined,
    nights: tooShort ? undefined : nights,
    guests,
    total: nights && !tooShort ? money(total) : undefined,
    name: fullName,
    url: pageUrl,
  });
  const waHref = whatsappLink(whatsappNumber, messageText);
  const mailHref = email
    ? `mailto:${email}?subject=${encodeURIComponent(t(b.emailSubject, { apartment: apartment.name }))}&body=${encodeURIComponent(messageText)}`
    : null;

  /** Record the contact in the admin without delaying WhatsApp/email from opening. */
  function recordLead(channel: "whatsapp" | "email") {
    setOpened(channel);
    if (!checkIn || !checkOut || honeypot) return;
    fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ apartment_id: apartment.id, check_in: checkIn, check_out: checkOut, guests, channel, full_name: fullName, locale }),
    }).catch(() => undefined);
  }

  const input = "w-full rounded-xl border border-ink-900/15 bg-white px-3 py-2.5 outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-400/30";

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
            defaultMonth={range?.from ?? today}
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

      <div className="mt-5 space-y-3">
        <div>
          <label htmlFor="bw-guests" className="mb-1 block text-sm font-medium">{dict.search.guests}</label>
          <select id="bw-guests" value={guests} onChange={(e) => setGuests(Number(e.target.value))} className={input}>
            {Array.from({ length: apartment.max_guests }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? dict.search.guest : dict.search.guestsPlural}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bw-name" className="mb-1 block text-sm font-medium">{b.nameOptional}</label>
          <input id="bw-name" maxLength={200} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} />
        </div>
        {/* Honeypot: hidden from people, tempting for bots. */}
        <div aria-hidden="true" className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="bw-website">Website</label>
          <input id="bw-website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>

        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => recordLead("whatsapp")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 py-3.5 text-lg font-semibold text-white shadow-sm transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
          >
            <WhatsAppIcon className="h-5 w-5" /> {b.bookWhatsapp}
          </a>
        )}
        {opened === "whatsapp" && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-[#25D366]/10 p-3 text-sm text-ink-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#128C7E]" aria-hidden="true" /> {b.openedWhatsapp}
          </p>
        )}
        <p className="text-center text-xs text-ink-500">{b.noteWhatsapp}</p>

        {mailHref && (
          <p className="border-t border-ink-900/10 pt-3 text-center text-sm text-ink-700">
            {b.noWhatsapp}{" "}
            <a href={mailHref} onClick={() => recordLead("email")} className="inline-flex items-center gap-1 font-semibold text-gold-700 underline-offset-4 hover:underline">
              <Mail className="h-4 w-4" aria-hidden="true" /> {b.sendEmail}
            </a>
          </p>
        )}
        {opened === "email" && <p role="status" className="text-center text-sm text-ink-700">{b.openedEmail}</p>}
      </div>
    </div>
  );
}
