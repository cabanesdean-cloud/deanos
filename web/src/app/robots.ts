import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

/**
 * Served at /deanos/robots.txt. When DeanOS lives under deancabanes.com, the
 * main site's root robots.txt should list this sitemap too.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/deanos/api/" },
    sitemap: `${SITE.origin}${SITE.basePath}/sitemap.xml`,
  };
}
