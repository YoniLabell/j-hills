import Footer from "@/components/site/Footer";
import Header from "@/components/site/Header";
import WhatsAppFloat from "@/components/site/WhatsAppFloat";
import { getSettings } from "@/lib/api";
import { getI18n } from "@/lib/i18n/server";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [{ locale, dict }, settings] = await Promise.all([getI18n(), getSettings()]);
  const siteName = locale === "he" && settings.site_name_he ? settings.site_name_he : settings.site_name;
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2">
        {locale === "he" ? "דלג לתוכן" : "Skip to content"}
      </a>
      <Header dict={dict} settings={settings} siteName={siteName} />
      <main id="main" className="flex-1">{children}</main>
      <Footer dict={dict} locale={locale} settings={settings} siteName={siteName} />
      <WhatsAppFloat number={settings.whatsapp_number} />
    </>
  );
}
