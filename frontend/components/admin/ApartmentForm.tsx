"use client";

import { useEffect, useState } from "react";

import AmenityIcon from "@/components/ui/AmenityIcon";
import { adminFetch, json } from "@/lib/admin-api";
import type { AdminAmenity, AdminApartment, Translation } from "@/lib/admin-types";
import { NEIGHBORHOOD_PRESETS } from "@/lib/neighborhoods";

import { Button, Card, Field, Notice, inputClass } from "./ui";

type FormState = {
  name: string;
  slug: string;
  short_description: string;
  description: string;
  house_rules: string;
  neighborhood: string;
  address: string;
  latitude: string;
  longitude: string;
  google_maps_url: string;
  owner_whatsapp: string;
  owner_email: string;
  max_guests: string;
  bedrooms: string;
  beds: string;
  bathrooms: string;
  price_per_night: string;
  cleaning_fee: string;
  min_nights: string;
  check_in_time: string;
  check_out_time: string;
  seo_title: string;
  seo_description: string;
  airbnb_ical_url: string;
  featured: boolean;
  active: boolean;
  sort_order: string;
  he: Required<{ [K in keyof Translation]: string }>;
  amenity_ids: number[];
};

const EMPTY_HE = { name: "", short_description: "", description: "", house_rules: "", neighborhood: "", seo_title: "", seo_description: "" };

function toForm(a?: AdminApartment): FormState {
  const he = a?.translations?.he ?? {};
  return {
    name: a?.name ?? "",
    slug: a?.slug ?? "",
    short_description: a?.short_description ?? "",
    description: a?.description ?? "",
    house_rules: a?.house_rules ?? "",
    neighborhood: a?.neighborhood ?? "",
    address: a?.address ?? "",
    latitude: a?.latitude?.toString() ?? "",
    longitude: a?.longitude?.toString() ?? "",
    google_maps_url: a?.google_maps_url ?? "",
    owner_whatsapp: a?.owner_whatsapp ?? "",
    owner_email: a?.owner_email ?? "",
    max_guests: String(a?.max_guests ?? 2),
    bedrooms: String(a?.bedrooms ?? 1),
    beds: String(a?.beds ?? 1),
    bathrooms: String(a?.bathrooms ?? 1),
    price_per_night: String(a?.price_per_night ?? ""),
    cleaning_fee: String(a?.cleaning_fee ?? 0),
    min_nights: String(a?.min_nights ?? 1),
    check_in_time: (a?.check_in_time ?? "15:00").slice(0, 5),
    check_out_time: (a?.check_out_time ?? "11:00").slice(0, 5),
    seo_title: a?.seo_title ?? "",
    seo_description: a?.seo_description ?? "",
    airbnb_ical_url: a?.airbnb_ical_url ?? "",
    featured: a?.featured ?? false,
    active: a?.active ?? true,
    sort_order: String(a?.sort_order ?? 0),
    he: Object.fromEntries(Object.keys(EMPTY_HE).map((k) => [k, (he as Record<string, string | null>)[k] ?? ""])) as FormState["he"],
    amenity_ids: a?.amenity_ids ?? [],
  };
}

/** Extract coordinates from a pasted Google Maps URL (…/@31.77,35.22,… or ?q=31.77,35.22). */
function coordsFromMapsUrl(url: string): [string, string] | null {
  const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || url.match(/[?&](?:q|ll|query)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  return m ? [m[1], m[2]] : null;
}

export default function ApartmentForm({ apartment, onSaved }: { apartment?: AdminApartment; onSaved: (a: AdminApartment) => void }) {
  const [form, setForm] = useState<FormState>(() => toForm(apartment));
  const [amenities, setAmenities] = useState<AdminAmenity[]>([]);
  const [tab, setTab] = useState<"en" | "he">("en");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminFetch<AdminAmenity[]>("/amenities").then(setAmenities).catch(() => undefined);
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };
  const text = (key: keyof FormState) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(key, e.target.value as never),
  });
  const heText = (key: keyof FormState["he"]) => ({
    value: form.he[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set("he", { ...form.he, [key]: e.target.value }),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || null,
      short_description: form.short_description,
      description: form.description,
      house_rules: form.house_rules,
      neighborhood: form.neighborhood.trim(),
      address: form.address,
      latitude: num(form.latitude),
      longitude: num(form.longitude),
      google_maps_url: form.google_maps_url.trim(),
      owner_whatsapp: form.owner_whatsapp.trim(),
      owner_email: form.owner_email.trim(),
      max_guests: Number(form.max_guests),
      bedrooms: Number(form.bedrooms),
      beds: Number(form.beds),
      bathrooms: Number(form.bathrooms),
      price_per_night: Number(form.price_per_night || 0),
      cleaning_fee: Number(form.cleaning_fee || 0),
      min_nights: Number(form.min_nights || 1),
      check_in_time: form.check_in_time,
      check_out_time: form.check_out_time,
      seo_title: form.seo_title,
      seo_description: form.seo_description,
      airbnb_ical_url: form.airbnb_ical_url.trim(),
      featured: form.featured,
      active: form.active,
      sort_order: Number(form.sort_order || 0),
      translations: { he: form.he },
      amenity_ids: form.amenity_ids,
    };
    try {
      const result = apartment
        ? await adminFetch<AdminApartment>(`/apartments/${apartment.id}`, { method: "PUT", body: json(payload) })
        : await adminFetch<AdminApartment>("/apartments", { method: "POST", body: json(payload) });
      setForm(toForm(result));
      setSaved(true);
      onSaved(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const tabBtn = (t: "en" | "he", label: string) => (
    <button type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? "bg-olive-700 text-white" : "bg-sand-100 text-ink-700"}`}>
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card title="Description" actions={<>{tabBtn("en", "English")}{tabBtn("he", "עברית (Hebrew)")}</>}>
        {tab === "en" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name *"><input required maxLength={200} className={inputClass} {...text("name")} /></Field>
            <Field label="Slug" hint="Used in the URL: /apartments/slug. Leave empty to generate from the name."><input pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={200} className={inputClass} {...text("slug")} placeholder="mamilla-luxury-apartment" /></Field>
            <Field label="Short description" className="md:col-span-2" hint="Shown on apartment cards (max 500 characters)."><input maxLength={500} className={inputClass} {...text("short_description")} /></Field>
            <Field label="Description" className="md:col-span-2"><textarea rows={7} className={inputClass} {...text("description")} /></Field>
            <Field label="House rules" className="md:col-span-2" hint="One rule per line."><textarea rows={4} className={inputClass} {...text("house_rules")} /></Field>
            <Field label="SEO title" hint="Defaults to the name."><input maxLength={200} className={inputClass} {...text("seo_title")} /></Field>
            <Field label="Meta description" hint="Defaults to the short description."><input maxLength={400} className={inputClass} {...text("seo_description")} /></Field>
          </div>
        ) : (
          <div dir="rtl" lang="he" className="grid gap-4 md:grid-cols-2">
            <p className="text-sm text-ink-500 md:col-span-2">Hebrew texts. Empty fields fall back to English.</p>
            <Field label="שם"><input maxLength={200} className={inputClass} {...heText("name")} /></Field>
            <Field label="שכונה"><input maxLength={120} className={inputClass} {...heText("neighborhood")} placeholder={NEIGHBORHOOD_PRESETS.find((n) => n.en === form.neighborhood)?.he} /></Field>
            <Field label="תיאור קצר" className="md:col-span-2"><input maxLength={500} className={inputClass} {...heText("short_description")} /></Field>
            <Field label="תיאור" className="md:col-span-2"><textarea rows={7} className={inputClass} {...heText("description")} /></Field>
            <Field label="כללי הבית" className="md:col-span-2" hint="כלל אחד בכל שורה."><textarea rows={4} className={inputClass} {...heText("house_rules")} /></Field>
            <Field label="כותרת SEO"><input maxLength={200} className={inputClass} {...heText("seo_title")} /></Field>
            <Field label="תיאור מטא"><input maxLength={400} className={inputClass} {...heText("seo_description")} /></Field>
          </div>
        )}
      </Card>

      <Card title="Capacity & pricing">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="Max guests"><input type="number" min={1} max={50} required className={inputClass} {...text("max_guests")} /></Field>
          <Field label="Bedrooms"><input type="number" min={0} max={50} required className={inputClass} {...text("bedrooms")} /></Field>
          <Field label="Beds"><input type="number" min={0} max={100} required className={inputClass} {...text("beds")} /></Field>
          <Field label="Bathrooms"><input type="number" min={0} max={50} step={0.5} required className={inputClass} {...text("bathrooms")} /></Field>
          <Field label="Price per night (₪)"><input type="number" min={0} step="0.01" required className={inputClass} {...text("price_per_night")} /></Field>
          <Field label="Cleaning fee (₪)"><input type="number" min={0} step="0.01" className={inputClass} {...text("cleaning_fee")} /></Field>
          <Field label="Minimum nights"><input type="number" min={1} max={60} className={inputClass} {...text("min_nights")} /></Field>
          <Field label="Display order" hint="Lower comes first."><input type="number" className={inputClass} {...text("sort_order")} /></Field>
          <Field label="Check-in from"><input type="time" required className={inputClass} {...text("check_in_time")} /></Field>
          <Field label="Check-out until"><input type="time" required className={inputClass} {...text("check_out_time")} /></Field>
        </div>
      </Card>

      <Card title="Location">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Neighborhood" hint="Choose a preset or type a custom name.">
            <input list="neighborhood-presets" maxLength={120} className={inputClass} {...text("neighborhood")} />
            <datalist id="neighborhood-presets">
              {NEIGHBORHOOD_PRESETS.map((n) => <option key={n.en} value={n.en}>{n.he}</option>)}
            </datalist>
          </Field>
          <Field label="Address" hint="Private — not shown on the public website."><input maxLength={300} className={inputClass} {...text("address")} /></Field>
          <Field label="Google Maps link" className="md:col-span-2" hint="Paste any Google Maps link (also short share links like maps.app.goo.gl/…). Coordinates are filled in automatically when you save, and the map appears on the apartment page.">
            <input
              type="url"
              maxLength={1000}
              className={inputClass}
              value={form.google_maps_url}
              onChange={(e) => {
                const url = e.target.value;
                const coords = coordsFromMapsUrl(url);
                setForm((f) => ({ ...f, google_maps_url: url, ...(coords ? { latitude: coords[0], longitude: coords[1] } : {}) }));
              }}
            />
          </Field>
          <Field label="Latitude"><input type="number" step="any" min={-90} max={90} className={inputClass} {...text("latitude")} placeholder="31.7767" /></Field>
          <Field label="Longitude"><input type="number" step="any" min={-180} max={180} className={inputClass} {...text("longitude")} placeholder="35.2345" /></Field>
        </div>
      </Card>

      <Card title="Amenities">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {amenities.map((a) => {
            const checked = form.amenity_ids.includes(a.id);
            return (
              <label key={a.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${checked ? "border-olive-600 bg-olive-600/5" : "border-ink-900/10"}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => set("amenity_ids", checked ? form.amenity_ids.filter((id) => id !== a.id) : [...form.amenity_ids, a.id])}
                  className="h-4 w-4 accent-olive-700"
                />
                <AmenityIcon icon={a.icon} className="h-4 w-4 text-gold-600" />
                <span>{a.name_en}</span>
                <span className="ms-auto text-xs text-ink-500" dir="rtl">{a.name_he}</span>
              </label>
            );
          })}
        </div>
      </Card>

      <Card title="Owner contact">
        <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Owner's WhatsApp number"
          hint="Guests' WhatsApp messages about this apartment go to this number, with their dates, guests and name filled in. Leave empty to use the general number from Settings. Example: 972501234567 or 050-123-4567."
        >
          <input type="tel" inputMode="tel" dir="ltr" maxLength={50} className={inputClass} {...text("owner_whatsapp")} placeholder="972501234567" />
        </Field>
        <Field
          label="Owner's email"
          hint="Guests without WhatsApp can email this address from the apartment page (the message includes their dates and name). Leave empty to use the email from Settings."
        >
          <input type="email" dir="ltr" maxLength={255} className={inputClass} {...text("owner_email")} placeholder="owner@example.com" />
        </Field>
        </div>
      </Card>

      <Card title="Airbnb calendar & visibility">
        <div className="grid gap-4">
          <Field
            label="Airbnb iCal URL"
            hint={<>On Airbnb: Calendar → Availability → Connect calendars → Export calendar. Looks like https://www.airbnb.com/calendar/ical/123.ics?s=… This URL stays private.</>}
          >
            <input type="url" maxLength={1000} className={inputClass} {...text("airbnb_ical_url")} placeholder="https://www.airbnb.com/calendar/ical/XXXXXXXX.ics?s=XXXXXXXX" />
          </Field>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-olive-700" /> Active (visible on the website)</label>
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} className="h-4 w-4 accent-olive-700" /> Featured on the homepage</label>
          </div>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-ink-900/10 bg-sand-50/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button type="submit" loading={saving}>{apartment ? "Save changes" : "Create apartment"}</Button>
        {saved && <span className="text-sm text-green-700">Saved.</span>}
        {error && <div className="w-full"><Notice>{error}</Notice></div>}
      </div>
    </form>
  );
}
