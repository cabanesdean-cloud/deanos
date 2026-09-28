import type { NextConfig } from "next";

// Local engine (uvicorn). In production, Vercel Services routes /deanos/api/*
// to the Python service before requests ever reach Next.js.
const ENGINE_DEV_URL = process.env.ENGINE_DEV_URL ?? "http://127.0.0.1:8100";

const nextConfig: NextConfig = {
  basePath: "/deanos",
  poweredByHeader: false,
  typedRoutes: true,
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/deanos/api/:path*",
        destination: `${ENGINE_DEV_URL}/deanos/api/:path*`,
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
