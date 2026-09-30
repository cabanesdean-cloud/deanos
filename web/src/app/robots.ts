import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

/** Served at deancabanes.com/robots.txt. The engine API is not for crawling. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/deanos/api/" },
    sitemap: `${SITE.origin}/sitemap.xml`,
  };
}
