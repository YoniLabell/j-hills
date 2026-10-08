import { House } from "lucide-react";
import Link from "next/link";

import type { Dictionary } from "@/lib/i18n";
import type { SiteSettings } from "@/lib/types";

import LanguageSwitcher from "./LanguageSwitcher";
import MobileMenu from "./MobileMenu";

export default function Header({ dict, settings, siteName }: { dict: Dictionary; settings: SiteSettings; siteName: string }) {
  const links = [
    { href: "/apartments", label: dict.nav.apartments },
    { href: "/#why-direct", label: dict.nav.whyDirect },
    { href: "/#contact", label: dict.nav.contact },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-sand-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label={siteName}>
          {settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_url} alt="" className="h-9 w-auto" />
          ) : (
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-gold-700 text-sm font-bold text-white">
              <House className="h-4 w-4" />
            </span>
          )}
          <span className="text-lg font-extrabold tracking-tight text-gold-700">{siteName}</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-ink-700 transition hover:text-gold-700">
              {l.label}
            </Link>
          ))}
          <LanguageSwitcher />
        </nav>
        <MobileMenu links={links} />
      </div>
    </header>
  );
}
