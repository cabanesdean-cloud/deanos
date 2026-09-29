import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { JsonLd } from "@/components/site/JsonLd";
import { TransactionsExplorer } from "@/components/transactions/TransactionsExplorer";
import { SectionSkeleton } from "@/components/ui/States";
import { SITE, SITE_URL, TX_PROJECT } from "@/lib/site";

const DESCRIPTION =
  "Categorize a bank statement line with a small, explainable machine-learning model: calibrated probabilities, the words behind each prediction, and an honest evaluation on merchants the model never saw.";

export const metadata: Metadata = {
  title: TX_PROJECT.name,
  description: DESCRIPTION,
  alternates: { canonical: "/transactions" },
  openGraph: {
    title: TX_PROJECT.name + " · " + TX_PROJECT.tagline,
    description: DESCRIPTION,
    url: "/transactions",
  },
};

export default function TransactionsPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: TX_PROJECT.name,
          alternateName: TX_PROJECT.tagline,
          url: SITE_URL + "/transactions",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Any (web browser)",
          isAccessibleForFree: true,
          description: DESCRIPTION,
          author: { "@type": "Person", name: SITE.owner },
        }}
      />
      <div className="container">
        <header className="page-head page-head--tight">
          <h1>{TX_PROJECT.name}</h1>
          <p>
            Type a line from a bank statement and a small machine-learning model sorts it into one of 14 spending categories, with a
            calibrated probability and the words that decided it. Trained and tested on synthetic transactions, split so that every
            test merchant is new to the model. <Link href="/methodology#transactions">How it works</Link>. An educational model, not a
            financial product.
          </p>
        </header>
      </div>
      <Suspense
        fallback={
          <div className="container" style={{ paddingTop: 32 }}>
            <SectionSkeleton />
          </div>
        }
      >
        <TransactionsExplorer />
      </Suspense>
    </>
  );
}
