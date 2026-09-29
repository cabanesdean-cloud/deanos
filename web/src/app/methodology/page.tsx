import type { Metadata } from "next";
import Link from "next/link";

import { groupOf, METHOD_GROUPS, METHODS } from "@/content/methodology";
import { OG_IMAGE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How each DeanOS and Options Pricing model works: what it does, why it is used, its assumptions, how to read it, and where it fails.",
  alternates: { canonical: "/methodology" },
  openGraph: { title: "Methodology · DeanOS", description: "How each DeanOS model works, what it assumes, and where it fails.", url: "/methodology", images: [OG_IMAGE] },
};

export default function MethodologyIndex() {
  return (
    <div className="container">
      <header className="page-head">
        <h1>Methodology</h1>
        <p>
          What each model does, why it is here, what it assumes, and where it breaks. Every page ends with results
          recomputed from the current data, so the claims can be checked.
        </p>
      </header>
      {METHOD_GROUPS.map((g) => (
        <section key={g.id} id={g.id} className="method-group" aria-labelledby={`group-${g.id}`}>
          <h2 id={`group-${g.id}`}>{g.title}</h2>
          <p>{g.blurb}</p>
          <nav className="method-index" aria-label={`${g.title} models`}>
            {METHODS.filter((m) => groupOf(m) === g.id).map((m) => (
              <Link key={m.slug} href={`/methodology/${m.slug}` as never}>
                <h3>{m.title}</h3>
                <p className="muted">{m.summary}</p>
              </Link>
            ))}
          </nav>
        </section>
      ))}
      <section className="prose" style={{ marginTop: 48 }}>
        <h2>What this is not</h2>
        <p>
          These models describe historical data or option prices under stated assumptions. None of them predicts
          returns, and none of the output is investment advice. The example portfolios are illustrations built from
          broad, widely held funds and companies, and option prices on this site are model values, not market quotes.
        </p>
      </section>
    </div>
  );
}
