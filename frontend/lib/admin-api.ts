"use client";

/** Client-side helper for the admin API. Requests go through the same-origin
 * /api rewrite, so the HTTP-only session cookie is sent automatically. */

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

function detailMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d: { loc?: (string | number)[]; msg?: string }) =>
          `${(d.loc ?? []).filter((l) => l !== "body").join(".")}: ${(d.msg ?? "").replace(/^Value error, /, "")}`,
        )
        .join("; ");
    }
    if (detail && typeof detail === "object" && "message" in detail) return String((detail as { message: string }).message);
  }
  return fallback;
}

export async function adminFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path.startsWith("/api") ? path : `/api/admin${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  // Outside React (plain helper), so a hard navigation to the login page is intended.
  if (res.status === 401 && typeof window !== "undefined" && !path.includes("/login")) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new AdminApiError(401, "Session expired.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new AdminApiError(res.status, detailMessage(body, `Request failed (${res.status})`), body);
  return body as T;
}

export const json = (data: unknown) => JSON.stringify(data);
