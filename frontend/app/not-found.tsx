import Link from "next/link";

import { getI18n } from "@/lib/i18n/server";

export default async function NotFound() {
  const { dict } = await getI18n();
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-serif text-7xl text-gold-500">404</p>
      <h1 className="mt-4 font-serif text-3xl">{dict.common.notFoundTitle}</h1>
      <p className="mt-2 text-ink-700">{dict.common.notFoundText}</p>
      <Link href="/" className="mt-8 rounded-full bg-olive-700 px-6 py-3 font-semibold text-white hover:bg-olive-800">
        {dict.common.backHome}
      </Link>
    </main>
  );
}
