import type { NextConfig } from "next";

// Backend URL. NEXT_PUBLIC_API_URL is read at build time (Render exposes
// environment variables to the build), so changing it requires a redeploy.
const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Browser requests to /api/* and /uploads/* are proxied to the FastAPI
  // backend. This keeps the admin session cookie first-party (same origin as
  // the site), which browsers increasingly require for HTTP-only cookies.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
      { source: "/uploads/:path*", destination: `${apiUrl}/uploads/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
