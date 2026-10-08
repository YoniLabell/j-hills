"use client";

import { Lock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button, Field, Notice, inputClass } from "@/components/admin/ui";
import { AdminApiError, adminFetch, json } from "@/lib/admin-api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await adminFetch("/login", { method: "POST", body: json({ email, password }) });
      const next = params.get("next");
      router.replace(next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Login failed.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Notice>{error}</Notice>}
      <Field label="Email">
        <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Password">
        <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      </Field>
      <Button type="submit" loading={loading} className="w-full py-2.5">Sign in</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="stone-texture flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl ring-1 ring-ink-900/5">
        <div className="mb-6 text-center">
          <span className="arch mx-auto grid h-12 w-10 place-items-center bg-gold-500 text-white"><Lock className="h-5 w-5" aria-hidden="true" /></span>
          <h1 className="mt-4 font-serif text-2xl">Owner dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">Sign in to manage apartments and bookings.</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
