import Link from "next/link";

import { contactLinks, SITE } from "@/lib/site";

export function SiteFooter() {
  const contacts = contactLinks();
  return (
    <footer className="site-footer">
      <div className="container site-footer__row">
        <p style={{ maxWidth: "62ch" }}>
          Educational and analytical projects by {SITE.owner}. Results describe historical data and model assumptions.
          They are not investment advice or predictions.
        </p>
        <div className="site-footer__links">
          {SITE.homeUrl && <a href={SITE.homeUrl}>Overview</a>}
          <Link href="/methodology">Methodology</Link>
          <Link href="/about">About</Link>
          {contacts.map((c) => (
            <a key={c.id} href={c.href}>
              {c.label}
            </a>
          ))}
          {SITE.githubUrl && <a href={SITE.githubUrl}>Source</a>}
        </div>
      </div>
    </footer>
  );
}
