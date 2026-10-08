"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import ApartmentForm from "@/components/admin/ApartmentForm";
import { PageHeader } from "@/components/admin/ui";

export default function NewApartmentPage() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="Add apartment" subtitle={<Link href="/admin/apartments" className="hover:underline">← All apartments</Link>} />
      <p className="mb-4 text-sm text-ink-500">After creating the apartment you can upload photos and sync its Airbnb calendar.</p>
      <ApartmentForm onSaved={(a) => router.replace(`/admin/apartments/${a.id}?created=1`)} />
    </>
  );
}
