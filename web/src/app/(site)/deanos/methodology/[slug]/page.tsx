import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Validation } from "@/components/methodology/Validation";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { JsonLd } from "@/components/site/JsonLd";
import { getMethod, groupOf, METHODS } from "@/content/methodology";
import { BETA_PROJECT, OPTIONS_PROJECT, SITE, TX_PROJECT } from "@/lib/site";

export function generateStaticParams() {
  return METHODS.map((m) => ({ slug: m.slug }));
}

export const dynamicParams = false;

export async function generateMetadata(props: PageProps<"/deanos/methodology/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const m = getMethod(slug);
  if (!m) return {};
  return {
    title: m.title,
    description: m.summary,
    alternates: { canonical: `/deanos/methodology/${m.slug}` },
    openGraph: {
      type: "article",
      title: `${m.title} · ${groupOf(m) === "beta" ? BETA_PROJECT.name : groupOf(m) === "options" ? OPTIONS_PROJECT.name : groupOf(m) === "transactions" ? TX_PROJECT.name : SITE.name}`,
      description: m.summary,
      url: `/deanos/methodology/${m.slug}`,
    },
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

export default async function MethodPage(props: PageProps<"/deanos/methodology/[slug]">) {
  const { slug } = await props.params;
  const m = getMethod(slug);
  if (!m) notFound();

  const url = `${SITE.origin}/deanos/methodology/${m.slug}`;
  const group = groupOf(m);
  const app =
    group === "beta"
      ? { name: BETA_PROJECT.name, url: `${SITE.origin}${BETA_PROJECT.href}` }
      : group === "options"
      ? { name: OPTIONS_PROJECT.name, url: `${SITE.origin}${OPTIONS_PROJECT.href}` }
      : group === "transactions"
        ? { name: TX_PROJECT.name, url: `${SITE.origin}${TX_PROJECT.href}` }
        : { name: SITE.name, url: `${SITE.origin}${SITE.basePath}` };
  return (
    <div className="container">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: m.title,
          description: m.summary,
          url,
          author: { "@type": "Person", name: SITE.owner },
          isPartOf: { "@type": "WebApplication", ...app },
          citation: m.references,
          inLanguage: "en",
        }}
      />
      <div className="method-layout" style={{ paddingTop: 48 }}>
        <nav className="method-nav" aria-label="Models">
          <Link href="/deanos/methodology" className="small">
            All models
          </Link>
          {METHODS.filter((x) => groupOf(x) === group).map((x) => (
            <Link key={x.slug} href={`/deanos/methodology/${x.slug}` as never} aria-current={x.slug === m.slug ? "page" : undefined}>
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
              <div className="formula" role="figure" aria-label="Formulas" tabIndex={0}>
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
                {group === "beta"
                  ? "The tracker began as a standalone app. Porting it here meant rechecking each calculation; these are the changes that came out of that, and what was kept."
                  : "DeanOS began as a personal tool. Rebuilding it for the public meant rechecking each model; these are the changes that came out of that."}
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
            {group === "options" ? (
              <Link href="/options">Try it in the options pricer</Link>
            ) : group === "transactions" ? (
              <Link href="/transactions">Try it in the categorizer</Link>
            ) : (
              <Link href="/deanos/explore">See it on a portfolio</Link>
            )}
          </p>
        </article>
      </div>
    </div>
  );
}
