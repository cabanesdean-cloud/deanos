import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Validation } from "@/components/methodology/Validation";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { getMethod, METHODS } from "@/content/methodology";

export function generateStaticParams() {
  return METHODS.map((m) => ({ slug: m.slug }));
}

export const dynamicParams = false;

export async function generateMetadata(props: PageProps<"/methodology/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const m = getMethod(slug);
  if (!m) return {};
  return {
    title: m.title,
    description: m.summary,
    alternates: { canonical: `/deanos/methodology/${m.slug}` },
  };
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul>
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export default async function MethodPage(props: PageProps<"/methodology/[slug]">) {
  const { slug } = await props.params;
  const m = getMethod(slug);
  if (!m) notFound();

  return (
    <div className="container">
      <div className="method-layout" style={{ paddingTop: 48 }}>
        <nav className="method-nav" aria-label="Models">
          <Link href="/methodology" className="small">
            All models
          </Link>
          {METHODS.map((x) => (
            <Link key={x.slug} href={`/methodology/${x.slug}` as never} aria-current={x.slug === m.slug ? "page" : undefined}>
              {x.short}
            </Link>
          ))}
        </nav>
        <article className="prose">
          <h1>{m.title}</h1>
          <p className="muted" style={{ fontSize: "var(--t-18)" }}>
            {m.summary}
          </p>

          <h2>What it does</h2>
          {m.what}
          <h2>Why it is used</h2>
          {m.why}
          <h2>Inputs</h2>
          <List items={m.inputs} />
          {m.formula && (
            <>
              <h3>Formulas</h3>
              <div className="formula" role="figure" aria-label="Formulas">
                {m.formula.replace(/ {2,}/g, "   ")}
              </div>
            </>
          )}
          <h2>Assumptions</h2>
          <List items={m.assumptions} />
          <h2>How to read the results</h2>
          {m.reading}
          <h2>Limitations</h2>
          <List items={m.limitations} />
          <h2>Where it can fail</h2>
          <List items={m.failures} />
          {m.changes && (
            <>
              <h2>Changes from the original version</h2>
              <p className="muted">
                DeanOS began as a personal tool. Rebuilding it for the public meant rechecking each model; these are
                the changes that came out of that.
              </p>
              <List items={m.changes} />
            </>
          )}
          {m.validation && (
            <>
              <h2>Validation on current data</h2>
              {m.validationIntro && <p className="muted">{m.validationIntro}</p>}
              <div style={{ maxWidth: "none" }}>
                <ErrorBoundary label="validation">
                  <Validation kind={m.validation} />
                </ErrorBoundary>
              </div>
            </>
          )}
          <h2>References</h2>
          <ul className="small muted">
            {m.references.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="small">
            <Link href="/explore">See it on a portfolio</Link>
          </p>
        </article>
      </div>
    </div>
  );
}
