"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useI18n } from "@/lib/i18n/client";

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, dict } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = locale === "he" ? "en" : "he";

  function switchLanguage() {
    document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={switchLanguage}
      disabled={pending}
      aria-label={dict.nav.languageLabel}
      lang={next}
      className={`inline-flex items-center gap-1.5 rounded-full border border-ink-900/15 px-3 py-1.5 text-sm font-medium transition hover:border-gold-500 hover:text-gold-700 disabled:opacity-60 ${className}`}
    >
      <Globe className="h-4 w-4" aria-hidden="true" />
      {dict.nav.language}
    </button>
  );
}
