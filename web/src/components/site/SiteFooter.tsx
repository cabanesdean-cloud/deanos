import Link from "next/link";
import { contactLinks, SITE } from "@/lib/site";

export function SiteFooter() {
  const contacts = contactLinks({ resume: false });
  return (
    <footer className="site-footer">
      <div className="container site-footer__row">
        <p style={{ maxWidth: "62ch" }}>
          Educational projects by <Link href="/">{SITE.owner}</Link>. Results describe historical data and model assumptions.
          They are not investment advice or predictions.
        </p>
        <div className="site-footer__links">
          <Link href="/">Dean Cabanes</Link>
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
