"use client";

import { Building2, CalendarCheck, Inbox, Percent } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge, Card, Notice, PageHeader, Spinner, fmtDate } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin-api";
import type { Dashboard } from "@/lib/admin-types";

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch<Dashboard>("/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Spinner />;

  const stats = [
    { label: "Apartments", value: `${data.apartments_active} / ${data.apartments_total}`, hint: "active / total", icon: Building2, href: "/admin/apartments" },
    { label: "New inquiries", value: data.new_inquiries, hint: "awaiting reply", icon: Inbox, href: "/admin/inquiries" },
    { label: "Upcoming bookings", value: data.upcoming_bookings, hint: "direct + Airbnb", icon: CalendarCheck, href: "/admin/bookings" },
    { label: "Occupancy", value: `${data.occupancy_percent_30d}%`, hint: "next 30 days", icon: Percent, href: "/admin/bookings" },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Overview of your apartments and bookings." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-2xl border border-ink-900/10 bg-white p-5 shadow-sm transition hover:border-gold-500">
            <s.icon className="h-5 w-5 text-gold-600" aria-hidden="true" />
            <p className="mt-3 text-3xl font-semibold">{s.value}</p>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-xs text-ink-500">{s.hint}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Upcoming check-ins (next 14 days)">
          {data.upcoming_checkins.length === 0 ? (
            <p className="text-sm text-ink-500">No check-ins in the next two weeks.</p>
          ) : (
            <ul className="divide-y divide-ink-900/5">
              {data.upcoming_checkins.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{c.guest_name}</p>
                    <p className="text-ink-500">{c.apartment_name}</p>
                  </div>
                  <div className="text-end">
                    <p>{fmtDate(c.check_in)} → {fmtDate(c.check_out)}</p>
                    <Badge value={c.source} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Airbnb sync status">
          <ul className="divide-y divide-ink-900/5">
            {data.sync_status.map((s) => (
              <li key={s.apartment_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link href={`/admin/apartments/${s.apartment_id}`} className="font-medium hover:text-gold-700">{s.apartment_name}</Link>
                {!s.has_feed ? (
                  <span className="text-ink-500">No iCal URL</span>
                ) : s.last_sync_at == null ? (
                  <span className="text-ink-500">Never synced</span>
                ) : (
                  <span className="flex items-center gap-2 text-end">
                    <span className="text-ink-500">{fmtDate(s.last_sync_at, true)}</span>
                    {s.last_sync_success ? <Badge value="ok" label={`OK · ${s.last_sync_events ?? 0} events`} /> : <Badge value="failed" label="Failed" />}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
