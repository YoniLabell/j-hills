"use client";

import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-ink-900/10 bg-white p-5 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-olive-700 text-white hover:bg-olive-800",
  secondary: "border border-ink-900/15 bg-white hover:border-gold-500",
  danger: "bg-terracotta-600 text-white hover:bg-terracotta-500",
  ghost: "hover:bg-sand-100",
};

export function Button({ variant = "primary", loading, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-ink-800">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-ink-900/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-400/30";

const badgeColors: Record<string, string> = {
  NEW: "bg-blue-50 text-blue-700 ring-blue-200",
  CONTACTED: "bg-amber-50 text-amber-800 ring-amber-200",
  CONFIRMED: "bg-green-50 text-green-700 ring-green-200",
  confirmed: "bg-green-50 text-green-700 ring-green-200",
  CANCELLED: "bg-gray-100 text-gray-600 ring-gray-200",
  cancelled: "bg-gray-100 text-gray-600 ring-gray-200",
  blocked: "bg-gray-100 text-gray-700 ring-gray-200",
  airbnb: "bg-rose-50 text-rose-700 ring-rose-200",
  website: "bg-green-50 text-green-700 ring-green-200",
  website_booking: "bg-green-50 text-green-700 ring-green-200",
  manual: "bg-stone-100 text-stone-700 ring-stone-200",
  active: "bg-green-50 text-green-700 ring-green-200",
  inactive: "bg-gray-100 text-gray-600 ring-gray-200",
  ok: "bg-green-50 text-green-700 ring-green-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
};

export function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${badgeColors[value] ?? "bg-sand-100 text-ink-700 ring-sand-300"}`}>
      {label ?? value}
    </span>
  );
}

export function Notice({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const cls = kind === "error" ? "bg-red-50 text-red-800 ring-red-200" : kind === "success" ? "bg-green-50 text-green-800 ring-green-200" : "bg-sand-100 text-ink-800 ring-sand-300";
  return <div role={kind === "error" ? "alert" : "status"} className={`rounded-lg px-4 py-3 text-sm ring-1 ${cls}`}>{children}</div>;
}

export function Spinner() {
  return (
    <div className="flex justify-center p-10 text-ink-500">
      <LoaderCircle className="h-6 w-6 animate-spin" aria-label="Loading" />
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function fmtDate(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return d.toLocaleString("en-GB", withTime ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });
}

export function fmtMoney(amount: number | null | undefined, currency = "ILS") {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("en-IL", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
