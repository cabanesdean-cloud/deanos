import type { Metadata } from "next";
import Link from "next/link";

import { METHODS } from "@/content/methodology";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How each DeanOS model works: what it does, why it is used, its assumptions, how to read it, and where it fails.",
  alternates: { canonical: "/deanos/methodology" },
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
      <nav className="method-index" aria-label="Models">
        {METHODS.map((m) => (
          <Link key={m.slug} href={`/methodology/${m.slug}` as never}>
            <h3>{m.title}</h3>
            <p className="muted">{m.summary}</p>
          </Link>
        ))}
      </nav>
      <section className="prose" style={{ marginTop: 48 }}>
        <h2>What this is not</h2>
        <p>
          These models describe historical data under stated assumptions. None of them predicts returns, and none
          of the output is investment advice. The example portfolios are illustrations built from broad, widely
          held funds and companies.
        </p>
      </section>
    </div>
  );
}
