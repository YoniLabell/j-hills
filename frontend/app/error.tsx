"use client";

import { useEffect } from "react";

import { useI18n } from "@/lib/i18n/client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { dict } = useI18n();
  useEffect(() => console.error(error), [error]);
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="font-serif text-3xl">{dict.common.errorTitle}</h1>
      <button type="button" onClick={reset} className="mt-6 rounded-full bg-olive-700 px-6 py-3 font-semibold text-white hover:bg-olive-800">
        {dict.common.retry}
      </button>
    </main>
  );
}
