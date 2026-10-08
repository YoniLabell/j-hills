"use client";

import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button, Card, Field, Notice, PageHeader, Spinner, inputClass } from "@/components/admin/ui";
import { adminFetch, json } from "@/lib/admin-api";
import type { SiteSettings } from "@/lib/types";

const CURRENCIES = [
  { code: "ILS", label: "₪ Israeli shekel (ILS)" },
  { code: "USD", label: "$ US dollar (USD)" },
  { code: "EUR", label: "€ Euro (EUR)" },
];

export default function SettingsPage() {
  const [s, setS] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminFetch<SiteSettings>("/settings").then(setS).catch((e) => setError(e.message));
  }, []);

  if (!s) return error ? <Notice>{error}</Notice> : <Spinner />;

  const f = (k: keyof SiteSettings) => ({
    value: s[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setS({ ...s, [k]: e.target.value });
      setSaved(false);
    },
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { currency_symbol, ...payload } = s!;
      setS(await adminFetch<SiteSettings>("/settings", { method: "PUT", body: json(payload) }));
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Website name, contact details and texts." />
      <form onSubmit={save} className="space-y-6">
        <Card title="Branding">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Website name"><input required className={inputClass} {...f("site_name")} /></Field>
            <Field label="Website name (Hebrew)"><input dir="rtl" className={inputClass} {...f("site_name_he")} /></Field>
            <ImageSetting label="Logo" kind="logo" url={s.logo_url} onUploaded={setS} />
            <ImageSetting label="Homepage hero image" kind="hero" url={s.hero_image_url} onUploaded={setS} />
          </div>
        </Card>
        <Card title="Contact">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="WhatsApp number" hint="International format without + or spaces, e.g. 972501234567. Used by every WhatsApp button."><input inputMode="tel" className={inputClass} {...f("whatsapp_number")} /></Field>
            <Field label="Phone"><input type="tel" className={inputClass} {...f("phone")} /></Field>
            <Field label="Email"><input type="email" className={inputClass} {...f("email")} /></Field>
            <Field label="Default currency" hint="Prices are entered and shown in this currency.">
              <select className={inputClass} {...f("default_currency")}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Instagram URL"><input type="url" className={inputClass} {...f("instagram_url")} /></Field>
            <Field label="Facebook URL"><input type="url" className={inputClass} {...f("facebook_url")} /></Field>
          </div>
        </Card>
        <Card title="Trust figures (homepage)">
          <p className="mb-3 text-sm text-ink-500">Optional. Use your real figures, for example from your Airbnb host profile. Empty fields are hidden on the site.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Overall rating (0–5)">
              <input type="number" min={0} max={5} step={0.01} className={inputClass} value={s.rating ?? ""} onChange={(e) => setS({ ...s, rating: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Number of reviews">
              <input type="number" min={0} step={1} className={inputClass} value={s.reviews_count ?? ""} onChange={(e) => setS({ ...s, reviews_count: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Hosting since (year)">
              <input type="number" min={1990} max={2100} step={1} className={inputClass} value={s.host_since_year ?? ""} onChange={(e) => setS({ ...s, host_since_year: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
          </div>
        </Card>
        <Card title="Texts">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="About text (English)"><textarea rows={5} className={inputClass} {...f("about_text_en")} /></Field>
            <Field label="About text (Hebrew)"><textarea rows={5} dir="rtl" className={inputClass} {...f("about_text_he")} /></Field>
            <Field label="Footer text (English)"><textarea rows={2} className={inputClass} {...f("footer_text_en")} /></Field>
            <Field label="Footer text (Hebrew)"><textarea rows={2} dir="rtl" className={inputClass} {...f("footer_text_he")} /></Field>
          </div>
        </Card>
        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving}>Save settings</Button>
          {saved && <span className="text-sm text-green-700">Saved.</span>}
        </div>
        {error && <Notice>{error}</Notice>}
      </form>
    </>
  );
}

function ImageSetting({ label, kind, url, onUploaded }: { label: string; kind: "logo" | "hero"; url: string; onUploaded: (s: SiteSettings) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    const body = new FormData();
    body.append("file", file);
    try {
      onUploaded(await adminFetch<SiteSettings>(`/settings/upload/${kind}`, { method: "POST", body }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-1 text-sm font-medium">{label}</p>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" className="h-16 w-24 rounded-lg object-cover ring-1 ring-ink-900/10" /> : <div className="h-16 w-24 rounded-lg bg-sand-100" />}
        <Button variant="secondary" loading={busy} onClick={() => ref.current?.click()}><Upload className="h-4 w-4" /> Upload</Button>
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
