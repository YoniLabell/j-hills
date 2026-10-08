"use client";

import { Check, Copy, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { adminFetch } from "@/lib/admin-api";
import type { AdminApartment, SyncLog } from "@/lib/admin-types";

import { Badge, Button, Card, Notice, fmtDate } from "./ui";

export default function SyncPanel({ apartment, onSynced }: { apartment: AdminApartment; onSynced: () => void }) {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadLogs = useCallback(() => adminFetch<SyncLog[]>(`/apartments/${apartment.id}/sync-logs`).then(setLogs).catch(() => undefined), [apartment.id]);
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  async function sync() {
    setSyncing(true);
    setResult(null);
    try {
      const r = await adminFetch<{ success: boolean; events_imported: number; created: number; updated: number; removed: number; error?: string }>(
        `/apartments/${apartment.id}/sync-calendar`,
        { method: "POST" },
      );
      setResult(
        r.success
          ? { kind: "success", text: `Synced ${r.events_imported} events (${r.created} new, ${r.updated} updated, ${r.removed} removed).` }
          : { kind: "error", text: `Sync failed: ${r.error}` },
      );
      onSynced();
      loadLogs();
    } catch (e) {
      setResult({ kind: "error", text: (e as Error).message });
    } finally {
      setSyncing(false);
    }
  }

  async function copyExport() {
    await navigator.clipboard.writeText(apartment.ical_export_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card
      title="Airbnb calendar sync"
      actions={
        <Button onClick={sync} loading={syncing} disabled={!apartment.airbnb_ical_url}>
          <RefreshCw className="h-4 w-4" /> Sync Airbnb Calendar
        </Button>
      }
    >
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-500">Last Airbnb Sync</dt>
          <dd className="font-medium">{fmtDate(apartment.last_sync_at, true)}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Status</dt>
          <dd>{apartment.last_sync_success == null ? "—" : apartment.last_sync_success ? <Badge value="ok" label="OK" /> : <Badge value="failed" label="Failed" />}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Events in feed</dt>
          <dd className="font-medium">{apartment.last_sync_events ?? "—"}</dd>
        </div>
      </dl>
      {!apartment.airbnb_ical_url && <p className="mt-3 text-sm text-ink-500">Add the Airbnb iCal URL below and save to enable syncing.</p>}
      {apartment.last_sync_error && apartment.last_sync_success === false && <div className="mt-3"><Notice>{apartment.last_sync_error}</Notice></div>}
      {result && <div className="mt-3"><Notice kind={result.kind}>{result.text}</Notice></div>}

      <div className="mt-5 rounded-xl bg-sand-100 p-4 text-sm">
        <p className="font-medium">Export direct bookings to Airbnb (two-way sync)</p>
        <p className="mt-1 text-ink-700">
          In Airbnb, go to the listing’s Calendar → Availability → Connect calendars → <em>Import calendar</em> and paste this URL, so bookings made on your website also block the dates on Airbnb.
        </p>
        <div className="mt-2 flex gap-2">
          <input readOnly value={apartment.ical_export_url} className="min-w-0 flex-1 rounded-lg border border-ink-900/15 bg-white px-3 py-1.5 font-mono text-xs" onFocus={(e) => e.target.select()} aria-label="Export calendar URL" />
          <Button variant="secondary" onClick={copyExport}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}</Button>
        </div>
      </div>

      {logs.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">Sync history</summary>
          <ul className="mt-2 divide-y divide-ink-900/5">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{fmtDate(l.started_at, true)} <span className="text-ink-500">({l.trigger})</span></span>
                {l.success ? (
                  <span className="text-ink-700">{l.events_imported} events · +{l.events_created} ~{l.events_updated} −{l.events_removed}</span>
                ) : (
                  <span className="text-red-700">{l.error}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
