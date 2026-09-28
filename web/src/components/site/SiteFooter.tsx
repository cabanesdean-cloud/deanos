import Link from "next/link";

import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__row">
        <p style={{ maxWidth: "62ch" }}>
          An educational and analytical project by {SITE.owner}. Results describe historical data and model
          assumptions. They are not investment advice or predictions.
        </p>
        <div style={{ display: "flex", gap: 20 }}>
          <Link href="/methodology">Methodology</Link>
          <Link href="/about">About</Link>
          {SITE.githubUrl && <a href={SITE.githubUrl}>Source</a>}
        </div>
      </div>
    </footer>
  );
}
