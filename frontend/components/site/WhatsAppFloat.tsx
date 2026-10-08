"use client";

import { useI18n } from "@/lib/i18n/client";
import { inquiryMessage, whatsappLink } from "@/lib/whatsapp";

import { WhatsAppIcon } from "../ui/BrandIcons";

export default function WhatsAppFloat({ number }: { number: string }) {
  const { locale, dict } = useI18n();
  const href = whatsappLink(number, inquiryMessage(locale, {}));
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={dict.common.whatsapp}
      className="fixed bottom-5 end-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
    >
      <WhatsAppIcon className="h-7 w-7" />
    </a>
  );
}
