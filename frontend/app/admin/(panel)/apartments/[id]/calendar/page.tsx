"use client";

import { Lock, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";

import { Badge, Button, Card, Field, Notice, PageHeader, Spinner, fmtDate, inputClass } from "@/components/admin/ui";
import { adminFetch, json } from "@/lib/admin-api";
import type { AdminApartment, Block } from "@/lib/admin-types";
import { parseDay, toDay } from "@/lib/format";

const SOURCE_LABEL: Record<Block["source"], string> = {
  airbnb: "Airbnb",
  website_booking: "Website booking",
  manual: "Manual block",
};

function nightsOf(blocks: Block[], source: Block["source"]) {
  const dates: Date[] = [];
  for (const b of blocks.filter((x) => x.source === source)) {
    for (let d = parseDay(b.start_date); d < parseDay(b.end_date); d.setDate(d.getDate() + 1)) dates.push(new Date(d));
  }
  return dates;
}

export default function CalendarPage() {
  const { id } = useParams<{ id: string }>();
  const [apartment, setApartment] = useState<AdminApartment | null>(null);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [range, setRange] = useState<DateRange | undefined>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([adminFetch<AdminApartment>(`/apartments/${id}`), adminFetch<Block[]>(`/apartments/${id}/blocked-dates`)])
        .then(([apt, bl]) => {
          setApartment(apt);
          setBlocks(bl);
        })
        .catch((e: Error) => setError(e.message)),
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  const modifiers = useMemo(
    () => ({
      "src-airbnb": nightsOf(blocks ?? [], "airbnb"),
      "src-website": nightsOf(blocks ?? [], "website_booking"),
      "src-manual": nightsOf(blocks ?? [], "manual"),
    }),
    [blocks],
  );

  async function addBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!range?.from || !range.to) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await adminFetch(`/apartments/${id}/block-dates`, {
        method: "POST",
        body: json({ start_date: toDay(range.from), end_date: toDay(range.to), reason }),
      });
      setMessage(`Blocked ${fmtDate(toDay(range.from))} → ${fmtDate(toDay(range.to))}.`);
      setRange(undefined);
      setReason("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeBlock(block: Block) {
    if (!confirm(`Remove the manual block ${fmtDate(block.start_date)} → ${fmtDate(block.end_date)}?`)) return;
    setError("");
    try {
      await adminFetch(`/blocked-dates/${block.id}`, { method: "DELETE" });
      setMessage("Block removed.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function sync() {
    setBusy(true);
    setError("");
    try {
      const r = await adminFetch<{ success: boolean; events_imported: number; error?: string }>(`/apartments/${id}/sync-calendar`, { method: "POST" });
      if (r.success) setMessage(`Airbnb calendar synced: ${r.events_imported} events.`);
      else setError(`Sync failed: ${r.error}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!apartment || !blocks) return error ? <Notice>{error}</Notice> : <Spinner />;

  const today = toDay(new Date());
  const upcoming = blocks.filter((b) => b.end_date > today);

  return (
    <>
      <PageHeader
        title={`Calendar — ${apartment.name}`}
        subtitle={<Link href={`/admin/apartments/${apartment.id}`} className="hover:underline">← Back to apartment</Link>}
        actions={
          apartment.airbnb_ical_url ? (
            <Button variant="secondary" onClick={sync} loading={busy}><RefreshCw className="h-4 w-4" /> Sync Airbnb Calendar</Button>
          ) : undefined
        }
      />
      <div className="mb-4 space-y-3">
        {error && <Notice>{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[auto_1fr]">
        <Card title="Availability">
          <div className="admin-calendar overflow-x-auto">
            <DayPicker
              mode="range"
              selected={range}
              onSelect={setRange}
              numberOfMonths={2}
              modifiers={modifiers}
              modifiersClassNames={{ "src-airbnb": "src-airbnb", "src-website": "src-website", "src-manual": "src-manual" }}
              weekStartsOn={0}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#fde2dc]" /> Airbnb</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#dfead2]" /> Website booking</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#e7e3dc]" /> Manual block</span>
          </div>

          <form onSubmit={addBlock} className="mt-5 space-y-3 border-t border-ink-900/10 pt-4">
            <p className="text-sm font-medium">Block dates manually</p>
            <p className="text-xs text-ink-500">
              Select the first blocked night and the day the block ends (like a check-out day). Example: 20 → 25 Oct blocks the nights of 20–24 Oct.
            </p>
            <p className="text-sm">
              {range?.from ? fmtDate(toDay(range.from)) : "Start"} → {range?.to ? fmtDate(toDay(range.to)) : "End"}
            </p>
            <Field label="Reason">
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Maintenance" className={inputClass} />
            </Field>
            <Button type="submit" loading={busy} disabled={!range?.from || !range?.to || range.to <= range.from}>Block these dates</Button>
          </form>
        </Card>

        <Card title={`Upcoming blocked periods (${upcoming.length})`}>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing blocked — all future dates are open.</p>
          ) : (
            <ul className="divide-y divide-ink-900/5">
              {upcoming.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium">{fmtDate(b.start_date)} → {fmtDate(b.end_date)}</p>
                    <p className="text-ink-500">{b.source === "airbnb" ? "Airbnb Reservation" : b.reason || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge value={b.source} label={SOURCE_LABEL[b.source]} />
                    {b.source === "manual" ? (
                      <button type="button" onClick={() => removeBlock(b)} className="rounded p-1.5 text-terracotta-600 hover:bg-red-50" aria-label="Remove block">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : b.source === "airbnb" ? (
                      <span title="Managed by Airbnb — change it on Airbnb; the next sync updates it." className="p-1.5 text-ink-500"><Lock className="h-4 w-4" /></span>
                    ) : (
                      <Link href="/admin/bookings" title="Cancel the booking to free these dates" className="p-1.5 text-ink-500"><Lock className="h-4 w-4" /></Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
