import type { MetadataRoute } from "next";

import { METHODS } from "@/content/methodology";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = `${SITE.origin}${SITE.basePath}`;
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/explore`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/options`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    ...METHODS.map((m) => ({
      url: `${base}/methodology/${m.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${base}/about`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
