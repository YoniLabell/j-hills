import type { Metadata, Viewport } from "next";
import { Frank_Ruhl_Libre, Heebo } from "next/font/google";

import { getSettings } from "@/lib/api";
import { siteUrl } from "@/lib/config";
import { I18nProvider } from "@/lib/i18n/client";
import { getI18n } from "@/lib/i18n/server";

import "./globals.css";

// Every page depends on the visitor’s language cookie and live availability.
export const dynamic = "force-dynamic";

// Both families cover Latin and Hebrew, so the design stays consistent in either language.
const display = Frank_Ruhl_Libre({
  variable: "--font-display",
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "700"],
  display: "swap",
});
const body = Heebo({
  variable: "--font-body",
  subsets: ["latin", "hebrew"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const [{ locale, dict }, settings] = await Promise.all([getI18n(), getSettings()]);
  const name = locale === "he" && settings.site_name_he ? settings.site_name_he : settings.site_name;
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: `${name} — ${dict.hero.title}`, template: `%s | ${name}` },
    description: dict.hero.subtitle,
    openGraph: { siteName: name, type: "website", locale: locale === "he" ? "he_IL" : "en_US" },
    icons: { icon: "/favicon.svg" },
  };
}

export const viewport: Viewport = {
  themeColor: "#f6f0e6",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dict } = await getI18n();
  return (
    <html lang={locale} dir={dict.dir} className={`${display.variable} ${body.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
