import { Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";

import type { Dictionary } from "@/lib/i18n";
import type { Locale, SiteSettings } from "@/lib/types";
import { whatsappLink } from "@/lib/whatsapp";

import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "../ui/BrandIcons";

export default function Footer({
  dict,
  locale,
  settings,
  siteName,
}: {
  dict: Dictionary;
  locale: Locale;
  settings: SiteSettings;
  siteName: string;
}) {
  const footerText = (locale === "he" ? settings.footer_text_he : settings.footer_text_en) || settings.footer_text_en;
  const wa = whatsappLink(settings.whatsapp_number, locale === "he" ? "שלום," : "Hello,");
  return (
    <footer className="mt-auto bg-ink-900 text-sand-200">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <p className="font-serif text-2xl text-white">{siteName}</p>
          {footerText && <p className="mt-3 max-w-sm text-sm leading-relaxed text-sand-300">{footerText}</p>}
          <p className="mt-4 flex items-center gap-2 text-sm text-sand-300">
            <MapPin className="h-4 w-4 text-gold-400" aria-hidden="true" />
            {locale === "he" ? "ירושלים, ישראל" : "Jerusalem, Israel"}
          </p>
        </div>
        <div>
          <h2 className="text-xs font-semibold text-gold-400">{dict.footer.explore}</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link href="/" className="hover:text-white">{dict.nav.home}</Link></li>
            <li><Link href="/apartments" className="hover:text-white">{dict.nav.apartments}</Link></li>
            <li><Link href="/#why-direct" className="hover:text-white">{dict.nav.whyDirect}</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold text-gold-400">{dict.footer.contact}</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {wa && (
              <li>
                <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-white">
                  <WhatsAppIcon className="h-4 w-4" /> {dict.common.whatsapp}
                </a>
              </li>
            )}
            {settings.phone && (
              <li>
                <a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 hover:text-white" dir="ltr">
                  <Phone className="h-4 w-4" aria-hidden="true" /> {settings.phone}
                </a>
              </li>
            )}
            {settings.email && (
              <li>
                <a href={`mailto:${settings.email}`} className="inline-flex items-center gap-2 hover:text-white">
                  <Mail className="h-4 w-4" aria-hidden="true" /> {settings.email}
                </a>
              </li>
            )}
          </ul>
          {(settings.instagram_url || settings.facebook_url) && (
            <div className="mt-5 flex gap-3" aria-label={dict.footer.follow}>
              {settings.instagram_url && (
                <a href={settings.instagram_url} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="rounded-full border border-sand-200/20 p-2 hover:border-gold-400 hover:text-white">
                  <InstagramIcon className="h-4 w-4" />
                </a>
              )}
              {settings.facebook_url && (
                <a href={settings.facebook_url} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="rounded-full border border-sand-200/20 p-2 hover:border-gold-400 hover:text-white">
                  <FacebookIcon className="h-4 w-4" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-sand-200/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-sand-300/80 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} {siteName}. {dict.footer.rights}</p>
          <Link href="/admin/login" rel="nofollow" className="hover:text-white">{dict.footer.admin}</Link>
        </div>
      </div>
    </footer>
  );
}
