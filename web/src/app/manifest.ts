import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

/** Web app manifest, so "Add to Home Screen" gets a clean name and icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name}: ${SITE.tagline}`,
    short_name: SITE.name,
    description: "Portfolio risk models, options pricing and transaction ML, each with its methodology.",
    id: SITE.basePath,
    start_url: SITE.basePath,
    scope: SITE.basePath,
    display: "standalone",
    background_color: "#1a1a19",
    theme_color: "#1a1a19",
    icons: [
      { src: `${SITE.basePath}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${SITE.basePath}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${SITE.basePath}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
