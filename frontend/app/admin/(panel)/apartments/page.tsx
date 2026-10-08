"use client";

import { CalendarDays, Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Badge, Button, Notice, PageHeader, Spinner, fmtDate, fmtMoney } from "@/components/admin/ui";
import { adminFetch, json } from "@/lib/admin-api";
import type { AdminApartment } from "@/lib/admin-types";
import { imageUrl } from "@/lib/images";

export default function ApartmentsAdminPage() {
  const router = useRouter();
  const [items, setItems] = useState<AdminApartment[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => adminFetch<AdminApartment[]>("/apartments").then(setItems).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  async function run(id: number, fn: () => Promise<unknown>, ok: string) {
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(ok);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Apartments"
        subtitle="Add, edit, deactivate or duplicate apartments."
        actions={<Link href="/admin/apartments/new" className="inline-flex items-center gap-2 rounded-lg bg-olive-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-olive-800"><Plus className="h-4 w-4" /> Add apartment</Link>}
      />
      <div className="space-y-3">
        {error && <Notice>{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
      </div>
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-white p-10 text-center text-ink-500 ring-1 ring-ink-900/10">No apartments yet. Add your first one.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((a) => (
            <li key={a.id} className="flex flex-col gap-4 rounded-2xl border border-ink-900/10 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(a.cover_image?.url, 300)} alt="" className="h-24 w-full rounded-xl object-cover sm:w-36" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/apartments/${a.id}`} className="text-lg font-semibold hover:text-gold-700">{a.name}</Link>
                  <Badge value={a.active ? "active" : "inactive"} />
                  {a.featured && <Badge value="featured" label="Featured" />}
                </div>
                <p className="text-sm text-ink-500">
                  {a.neighborhood || "—"} · {a.max_guests} guests · {a.bedrooms} bd · {fmtMoney(a.price_per_night)} / night · {a.images.length} photos
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  Airbnb: {a.airbnb_ical_url ? (a.last_sync_at ? `${a.last_sync_success ? "synced" : "sync failed"} ${fmtDate(a.last_sync_at, true)}` : "not synced yet") : "no iCal URL"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => router.push(`/admin/apartments/${a.id}`)}><Pencil className="h-4 w-4" /> Edit</Button>
                <Button variant="secondary" onClick={() => router.push(`/admin/apartments/${a.id}/calendar`)}><CalendarDays className="h-4 w-4" /> Calendar</Button>
                <Button variant="ghost" title="Duplicate" loading={busy === a.id} onClick={() => run(a.id, () => adminFetch(`/apartments/${a.id}/duplicate`, { method: "POST" }), `Duplicated “${a.name}” (the copy is inactive).`)}>
                  <Copy className="h-4 w-4" /> <span className="sr-only sm:not-sr-only">Duplicate</span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => run(a.id, () => adminFetch(`/apartments/${a.id}`, { method: "PUT", body: json({ active: !a.active }) }), a.active ? "Apartment deactivated — hidden from the website." : "Apartment activated.")}
                >
                  {a.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {a.active ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  variant="ghost"
                  className="text-terracotta-600"
                  onClick={() => {
                    if (confirm(`Delete “${a.name}” permanently? This also deletes its photos and calendar. Apartments with bookings can't be deleted — deactivate them instead.`)) {
                      run(a.id, () => adminFetch(`/apartments/${a.id}`, { method: "DELETE" }), "Apartment deleted.");
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" /> <span className="sr-only sm:not-sr-only">Delete</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
