import type { Metadata } from "next";

import { JsonLd } from "@/components/site/JsonLd";
import { HOME_URL, OG_IMAGE, SITE, SITE_URL } from "@/lib/site";

const DESCRIPTION =
  "Explore how a portfolio behaves across changing market conditions using quantitative risk models, simulations and scenario analysis. A public rebuild of Dean Cabanes's personal portfolio system.";

export const metadata: Metadata = {
  title: { default: `${SITE.name}: ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: DESCRIPTION,
  alternates: { canonical: SITE_URL },
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    siteName: "Dean Cabanes",
    url: SITE_URL,
    title: `${SITE.name}: ${SITE.tagline}`,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}#app`,
      name: SITE.name,
      alternateName: SITE.tagline,
      url: SITE_URL,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any (web browser)",
      isAccessibleForFree: true,
      description:
        "An educational portfolio risk and modeling engine: GARCH volatility, hidden Markov market regimes, filtered historical VaR with backtests, block-bootstrap Monte Carlo, Fama-French factor regressions and historical stress tests.",
      author: { "@id": `${HOME_URL}#person` },
    },
    ...(SITE.githubUrl
      ? [
          {
            "@type": "SoftwareSourceCode",
            name: SITE.name,
            codeRepository: SITE.githubUrl,
            programmingLanguage: ["Python", "TypeScript"],
            author: { "@id": `${HOME_URL}#person` },
          },
        ]
      : []),
  ],
};

export default function DeanosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />
      {children}
    </>
  );
}
