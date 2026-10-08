"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n/client";

import LanguageSwitcher from "./LanguageSwitcher";

export default function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const { dict } = useI18n();
  const pathname = usePathname();
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? dict.nav.close : dict.nav.menu}
        className="rounded-full p-2 hover:bg-sand-200"
      >
        {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
      {open && (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="absolute inset-x-0 top-16 border-b border-ink-900/10 bg-sand-50 px-4 pb-6 pt-2 shadow-lg"
        >
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="block border-b border-ink-900/5 py-3 text-lg">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <LanguageSwitcher className="mt-4" />
        </nav>
      )}
    </div>
  );
}
