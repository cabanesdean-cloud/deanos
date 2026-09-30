import type { MetadataRoute } from "next";

import { PERSON } from "@/lib/site";

/** Web app manifest, so "Add to Home Screen" gets a clean name and icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PERSON.name,
    short_name: PERSON.name,
    description: PERSON.summary,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1a1a19",
    theme_color: "#1a1a19",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
