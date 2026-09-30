import type { NextConfig } from "next";

// Local engine (uvicorn). In production, Vercel Services routes /deanos/api/*
// to the Python service before requests ever reach Next.js.
const ENGINE_DEV_URL = process.env.ENGINE_DEV_URL ?? "http://127.0.0.1:8100";
// Proxy the engine in development, or in a local production build when
// ENGINE_DEV_URL is set explicitly. Never on Vercel, where Services routes it.
const proxyEngine = process.env.NODE_ENV === "development" || (!!process.env.ENGINE_DEV_URL && !process.env.VERCEL);
const isDev = process.env.NODE_ENV === "development";

// Static pages cannot carry per-request nonces, so inline scripts are allowed
// ('unsafe-inline'); everything else is locked to this origin. No third-party
// scripts, fonts, images or connections are used anywhere on the site.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// The tools used to live under /deanos/*. Their canonical addresses are now
// short (deancabanes.com/beta, /options, /transactions); the old URLs redirect
// permanently (308), keeping the query string, so shared links and deep links
// with URL state still land on the same view.
const MOVED = ["beta", "options", "transactions"] as const;

const nextConfig: NextConfig = {
  // No basePath: the résumé homepage is the domain root and each tool has its
  // own top-level address. DeanOS itself stays at /deanos (a route segment), and
  // Vercel Services sends /deanos/api/* to the Python engine before Next.js.
  poweredByHeader: false,
  typedRoutes: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async redirects() {
    return [
      ...MOVED.flatMap((m) => [
        { source: `/deanos/${m}`, destination: `/${m}`, permanent: true },
        { source: `/deanos/${m}/:path*`, destination: `/${m}/:path*`, permanent: true },
      ]),
      // The old internal route behind the root rewrite.
      { source: "/deanos/home", destination: "/", permanent: true },
    ];
  },
  async rewrites() {
    // Local engine only; on Vercel the Services router handles /deanos/api/*.
    return proxyEngine ? [{ source: "/deanos/api/:path*", destination: `${ENGINE_DEV_URL}/deanos/api/:path*` }] : [];
  },
};

export default nextConfig;
