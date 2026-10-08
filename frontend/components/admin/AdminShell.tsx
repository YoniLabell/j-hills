"use client";

import { Building2, CalendarDays, ExternalLink, Inbox, LayoutDashboard, LogOut, Menu, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { adminFetch } from "@/lib/admin-api";

import { Spinner } from "./ui";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/apartments", label: "Apartments", icon: Building2 },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/admin/inquiries", label: "Inquiries", icon: Inbox },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // Verifies the session with the API (adminFetch redirects to login on 401).
    adminFetch<{ email: string }>("/me").then(setUser).catch(() => undefined);
  }, []);

  async function logout() {
    await adminFetch("/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  }

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-olive-700 text-white" : "text-ink-700 hover:bg-sand-200"}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
          </Link>
        );
      })}
      <a href="/" target="_blank" className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-500 hover:bg-sand-200">
        <ExternalLink className="h-4 w-4" aria-hidden="true" /> View website
      </a>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-e border-ink-900/10 bg-sand-100 p-4 lg:flex">
        <p className="mb-6 px-3 font-serif text-xl">Owner dashboard</p>
        {nav}
        <div className="mt-auto border-t border-ink-900/10 pt-4">
          <p className="truncate px-3 text-xs text-ink-500">{user?.email}</p>
          <button type="button" onClick={logout} className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-sand-200">
            <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-900/10 bg-sand-100 px-4 py-3 lg:hidden">
          <p className="font-serif text-lg">Owner dashboard</p>
          <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu" aria-expanded={menuOpen} className="rounded-lg p-2 hover:bg-sand-200">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
        {menuOpen && (
          <div className="border-b border-ink-900/10 bg-sand-100 p-4 lg:hidden">
            {nav}
            <button type="button" onClick={logout} className="mt-2 flex items-center gap-3 px-3 py-2 text-sm text-ink-700">
              <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
            </button>
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{user ? children : <Spinner />}</main>
      </div>
    </div>
  );
}
