"use client";

import { CalendarDays, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import ApartmentForm from "@/components/admin/ApartmentForm";
import ImageManager from "@/components/admin/ImageManager";
import SyncPanel from "@/components/admin/SyncPanel";
import { Notice, PageHeader, Spinner } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin-api";
import type { AdminApartment } from "@/lib/admin-types";

export default function EditApartmentPage() {
  const { id } = useParams<{ id: string }>();
  const created = useSearchParams().get("created");
  const [apartment, setApartment] = useState<AdminApartment | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => adminFetch<AdminApartment>(`/apartments/${id}`).then(setApartment).catch((e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Notice>{error}</Notice>;
  if (!apartment) return <Spinner />;

  return (
    <>
      <PageHeader
        title={apartment.name}
        subtitle={<Link href="/admin/apartments" className="hover:underline">← All apartments</Link>}
        actions={
          <>
            <Link href={`/admin/apartments/${apartment.id}/calendar`} className="inline-flex items-center gap-2 rounded-lg border border-ink-900/15 bg-white px-3.5 py-2 text-sm font-semibold hover:border-gold-500">
              <CalendarDays className="h-4 w-4" /> Calendar
            </Link>
            {apartment.active && (
              <a href={`/apartments/${apartment.slug}`} target="_blank" className="inline-flex items-center gap-2 rounded-lg border border-ink-900/15 bg-white px-3.5 py-2 text-sm font-semibold hover:border-gold-500">
                <ExternalLink className="h-4 w-4" /> View page
              </a>
            )}
          </>
        }
      />
      <div className="space-y-6">
        {created && <Notice kind="success">Apartment created. Now add photos and connect the Airbnb calendar.</Notice>}
        <ImageManager apartmentId={apartment.id} initial={apartment.images} />
        <SyncPanel apartment={apartment} onSynced={load} />
        <ApartmentForm apartment={apartment} onSaved={setApartment} />
      </div>
    </>
  );
}
