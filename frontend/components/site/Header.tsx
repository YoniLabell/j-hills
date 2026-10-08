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
    <header className="sticky top-0 z-40 border-b border-ink-900/5 bg-sand-50/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label={siteName}>
          {settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_url} alt="" className="h-9 w-auto" />
          ) : (
            <span aria-hidden="true" className="arch grid h-9 w-7 place-items-center bg-gold-500 text-[11px] font-bold text-white">
              ✦
            </span>
          )}
          <span className="font-serif text-xl font-medium tracking-tight">{siteName}</span>
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
