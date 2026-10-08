"use client";

import { Mail, Phone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge, Button, Notice, PageHeader, Spinner, fmtDate, fmtMoney } from "@/components/admin/ui";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { AdminApiError, adminFetch, json } from "@/lib/admin-api";
import type { Inquiry } from "@/lib/admin-types";
import { whatsappLink } from "@/lib/whatsapp";

const CHANNEL_LABEL: Record<string, string> = { form: "Website form", whatsapp: "WhatsApp", email: "Email" };

const STATUSES = ["", "NEW", "CONTACTED", "CONFIRMED", "CANCELLED"] as const;

function replyMessage(i: Inquiry) {
  return i.locale === "he"
    ? `שלום ${i.full_name},\nתודה על הפנייה לגבי ${i.apartment_name} (${fmtDate(i.check_in)} – ${fmtDate(i.check_out)}, ${i.guests} אורחים).`
    : `Hello ${i.full_name},\nThank you for your inquiry about ${i.apartment_name} (${fmtDate(i.check_in)} – ${fmtDate(i.check_out)}, ${i.guests} guests).`;
}

export default function InquiriesPage() {
  const [status, setStatus] = useState<string>("");
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const [error, setError] = useState<{ id?: number; text: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(
    () =>
      adminFetch<{ items: Inquiry[] }>(`/inquiries?limit=200${status ? `&status=${status}` : ""}`)
        .then((r) => setItems(r.items))
        .catch((e) => setError({ text: e.message })),
    [status],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function setInquiryStatus(i: Inquiry, next: Inquiry["status"]) {
    if (next === "CONFIRMED" && !confirm(`Confirm ${i.full_name}'s booking for ${fmtDate(i.check_in)} → ${fmtDate(i.check_out)}? Availability is checked again and the dates will be blocked.`)) return;
    if (next === "CANCELLED" && i.status === "CONFIRMED" && !confirm("Cancel this confirmed booking? The dates become available again.")) return;
    setBusy(i.id);
    setError(null);
    try {
      await adminFetch(`/inquiries/${i.id}`, { method: "PATCH", body: json({ status: next }) });
      await load();
    } catch (e) {
      const err = e as AdminApiError;
      setError({ id: i.id, text: err.status === 409 ? `Can't confirm: ${err.message}` : err.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Inquiries" subtitle="Booking requests sent from the website." />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {STATUSES.map((s) => (
          <button key={s || "all"} type="button" onClick={() => setStatus(s)} aria-pressed={status === s} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${status === s ? "bg-olive-700 text-white" : "bg-white ring-1 ring-ink-900/10"}`}>
            {s || "All"}
          </button>
        ))}
      </div>
      {error && !error.id && <Notice>{error.text}</Notice>}
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="rounded-2xl bg-white p-10 text-center text-ink-500 ring-1 ring-ink-900/10">No inquiries.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => {
            const wa = whatsappLink(i.phone, replyMessage(i));
            return (
              <li key={i.id} className="rounded-2xl border border-ink-900/10 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-semibold">{i.full_name || <span className="text-ink-500">Guest (no name given)</span>}</p>
                      <Badge value={i.status} />
                      <Badge value={i.channel === "whatsapp" ? "website" : "manual"} label={CHANNEL_LABEL[i.channel] ?? i.channel} />
                    </div>
                    <p className="text-sm text-ink-700">
                      <span className="font-medium">{i.apartment_name}</span> · {fmtDate(i.check_in)} → {fmtDate(i.check_out)} ({i.nights} nights) · {i.guests} guests · est. {fmtMoney(i.estimated_total, i.currency)}
                    </p>
                    <p className="mt-1 text-sm text-ink-500">
                      {i.phone && <><span dir="ltr">{i.phone}</span> · </>}
                      {i.email && <>{i.email} · </>}
                      received {fmtDate(i.created_at, true)} · {i.locale === "he" ? "Hebrew" : "English"}
                    </p>
                    {i.channel !== "form" && (
                      <p className="mt-1 text-xs text-ink-500">
                        The guest clicked “{i.channel === "whatsapp" ? "Book on WhatsApp" : "Send us an email"}”. The conversation continues in your{" "}
                        {i.channel === "whatsapp" ? "WhatsApp" : "email inbox"}. Confirm here once you agree, to block the dates.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {wa && i.phone && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-sm font-semibold text-white"><WhatsAppIcon className="h-4 w-4" /> WhatsApp</a>}
                    {i.phone && <a href={`tel:${i.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-900/15 px-3 py-2 text-sm font-semibold"><Phone className="h-4 w-4" /> Call</a>}
                    {i.email && <a href={`mailto:${i.email}?subject=${encodeURIComponent(`Your stay at ${i.apartment_name}`)}&body=${encodeURIComponent(replyMessage(i))}`} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-900/15 px-3 py-2 text-sm font-semibold"><Mail className="h-4 w-4" /> Email</a>}
                  </div>
                </div>
                {i.message && <p className="mt-3 whitespace-pre-line rounded-lg bg-sand-100 p-3 text-sm">{i.message}</p>}
                {error?.id === i.id && <div className="mt-3"><Notice>{error.text}</Notice></div>}
                <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-900/5 pt-3">
                  {i.status === "NEW" && <Button variant="secondary" loading={busy === i.id} onClick={() => setInquiryStatus(i, "CONTACTED")}>Mark contacted</Button>}
                  {(i.status === "NEW" || i.status === "CONTACTED" || i.status === "CANCELLED") && (
                    <Button loading={busy === i.id} onClick={() => setInquiryStatus(i, "CONFIRMED")}>Confirm booking</Button>
                  )}
                  {i.status !== "CANCELLED" && <Button variant="ghost" className="text-terracotta-600" loading={busy === i.id} onClick={() => setInquiryStatus(i, "CANCELLED")}>Cancel</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
