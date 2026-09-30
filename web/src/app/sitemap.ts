import type { MetadataRoute } from "next";

import { METHODS } from "@/content/methodology";
import { HOME_URL, SITE } from "@/lib/site";

/** Served at deancabanes.com/sitemap.xml: the résumé, each tool at its short address, DeanOS and methodology. */
export default function sitemap(): MetadataRoute.Sitemap {
  const o = SITE.origin;
  const now = new Date();
  return [
    { url: HOME_URL, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${o}/beta`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${o}/deanos`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${o}/deanos/explore`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${o}/options`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${o}/transactions`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${o}/deanos/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...METHODS.map((m) => ({
      url: `${o}/deanos/methodology/${m.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    { url: `${o}/deanos/about`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
