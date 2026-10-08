"use client";

import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge, Button, Card, Field, Notice, PageHeader, Spinner, fmtDate, fmtMoney, inputClass } from "@/components/admin/ui";
import { adminFetch, json } from "@/lib/admin-api";
import type { AdminApartment, BookingRow } from "@/lib/admin-types";

const SOURCE_LABEL: Record<string, string> = { website: "Website", airbnb: "Airbnb", manual: "Manual" };

export default function BookingsPage() {
  const [apartments, setApartments] = useState<AdminApartment[]>([]);
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  const [filters, setFilters] = useState({ apartment_id: "", source: "", status: "", from_date: new Date().toISOString().slice(0, 10), to_date: "" });
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    params.set("limit", "500");
    return adminFetch<{ items: BookingRow[] }>(`/bookings?${params}`)
      .then((r) => setRows(r.items))
      .catch((e) => setError(e.message));
  }, [filters]);

  useEffect(() => {
    adminFetch<AdminApartment[]>("/apartments").then(setApartments).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function cancel(row: BookingRow) {
    if (!confirm(`Cancel the booking of ${row.guest_name} (${fmtDate(row.check_in)} → ${fmtDate(row.check_out)})? The dates become available again.`)) return;
    try {
      await adminFetch(`/bookings/${row.id}`, { method: "PATCH", body: json({ status: "cancelled" }) });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const f = (k: keyof typeof filters) => ({ value: filters[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters({ ...filters, [k]: e.target.value }) });

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle="Direct bookings, Airbnb reservations and manual blocks."
        actions={<Button onClick={() => setShowNew((s) => !s)}>{showNew ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Add booking</Button>}
      />
      {showNew && <NewBooking apartments={apartments} onDone={() => { setShowNew(false); load(); }} />}

      <div className="mb-4 grid gap-3 rounded-2xl border border-ink-900/10 bg-white p-4 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Apartment">
          <select className={inputClass} {...f("apartment_id")}>
            <option value="">All</option>
            {apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Source">
          <select className={inputClass} {...f("source")}>
            <option value="">All</option>
            <option value="website">Website</option>
            <option value="airbnb">Airbnb</option>
            <option value="manual">Manual</option>
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} {...f("status")}>
            <option value="">All</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="blocked">Blocked (manual)</option>
          </select>
        </Field>
        <Field label="From"><input type="date" className={inputClass} {...f("from_date")} /></Field>
        <Field label="To"><input type="date" className={inputClass} {...f("to_date")} /></Field>
      </div>

      {error && <div className="mb-4"><Notice>{error}</Notice></div>}
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl bg-white p-10 text-center text-ink-500 ring-1 ring-ink-900/10">No bookings match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink-900/10 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-sand-100 text-start text-xs uppercase tracking-wider text-ink-500">
              <tr>
                {["Guest", "Apartment", "Check-in", "Check-out", "Guests", "Source", "Status", "Total", "Created", ""].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 text-start font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-900/5">
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className={r.status === "cancelled" ? "text-ink-500" : ""}>
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{r.guest_name || <span className="text-ink-500">{r.notes || "Blocked"}</span>}</p>
                    {r.guest_phone && <a href={`tel:${r.guest_phone}`} className="text-xs text-ink-500 hover:underline">{r.guest_phone}</a>}
                  </td>
                  <td className="px-3 py-2.5">{r.apartment_name}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(r.check_in)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(r.check_out)} <span className="text-xs text-ink-500">({r.nights}n)</span></td>
                  <td className="px-3 py-2.5">{r.guests ?? "—"}</td>
                  <td className="px-3 py-2.5"><Badge value={r.source} label={SOURCE_LABEL[r.source] ?? r.source} /></td>
                  <td className="px-3 py-2.5"><Badge value={r.status} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5">{fmtMoney(r.total_price, r.currency ?? "ILS")}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-500">{fmtDate(r.created_at)}</td>
                  <td className="px-3 py-2.5 text-end">
                    {r.kind === "booking" && r.status === "confirmed" && (
                      <button type="button" onClick={() => cancel(r)} className="text-xs font-semibold text-terracotta-600 hover:underline">Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function NewBooking({ apartments, onDone }: { apartments: AdminApartment[]; onDone: () => void }) {
  const [form, setForm] = useState({ apartment_id: "", check_in: "", check_out: "", guests: "2", guest_name: "", guest_phone: "", guest_email: "", total_price: "", notes: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const f = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value }) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await adminFetch("/bookings", {
        method: "POST",
        body: json({ ...form, apartment_id: Number(form.apartment_id), guests: Number(form.guests), total_price: form.total_price ? Number(form.total_price) : null }),
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Add a booking you took directly (phone, returning guest…)" className="mb-6">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Apartment">
          <select required className={inputClass} {...f("apartment_id")}>
            <option value="">Choose…</option>
            {apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Check-in"><input type="date" required className={inputClass} {...f("check_in")} /></Field>
        <Field label="Check-out"><input type="date" required className={inputClass} {...f("check_out")} /></Field>
        <Field label="Guests"><input type="number" min={1} required className={inputClass} {...f("guests")} /></Field>
        <Field label="Guest name"><input required className={inputClass} {...f("guest_name")} /></Field>
        <Field label="Phone"><input className={inputClass} {...f("guest_phone")} /></Field>
        <Field label="Email"><input type="email" className={inputClass} {...f("guest_email")} /></Field>
        <Field label="Total (₪)" hint="Leave empty to calculate."><input type="number" min={0} className={inputClass} {...f("total_price")} /></Field>
        <Field label="Notes" className="sm:col-span-2 lg:col-span-3"><input className={inputClass} {...f("notes")} /></Field>
        <div className="flex items-end"><Button type="submit" loading={saving} className="w-full">Save booking</Button></div>
        {error && <div className="sm:col-span-2 lg:col-span-4"><Notice>{error}</Notice></div>}
      </form>
    </Card>
  );
}
