import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

/**
 * Served at /deanos/robots.txt. Crawlers read the domain root's /robots.txt,
 * which does not exist yet (Next.js cannot rewrite metadata routes outside the
 * base path); the sitemap is still discoverable from the canonical links.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/deanos/api/" },
    sitemap: `${SITE.origin}${SITE.basePath}/sitemap.xml`,
  };
}
