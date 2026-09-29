import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { JsonLd } from "@/components/site/JsonLd";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { THEME_SCRIPT } from "@/components/site/ThemeToggle";
import { HOME_URL, PERSON, SITE, SITE_URL } from "@/lib/site";

import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "greek"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(`${SITE.origin}${SITE.basePath}`),
  title: {
    default: `${SITE.name}: ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description:
    "Explore how a portfolio behaves across changing market conditions using quantitative risk models, simulations and scenario analysis.",
  alternates: { canonical: SITE_URL },
  applicationName: SITE.name,
  authors: [{ name: SITE.owner }],
  creator: SITE.owner,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_US",
    url: SITE_URL,
    title: `${SITE.name}: ${SITE.tagline}`,
    description:
      "Explore how a portfolio behaves across changing market conditions using quantitative risk models, simulations and scenario analysis.",
  },
  twitter: { card: "summary_large_image" },
  // Home Screen on iOS: the name under the icon and a plain status bar. The
  // icon itself is app/apple-icon.png; the manifest is app/manifest.ts.
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

const PERSON_ID = `${HOME_URL}#person`;
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": PERSON_ID,
      name: SITE.owner,
      description: PERSON.description,
      url: HOME_URL,
      ...(SITE.githubUrl ? { sameAs: [SITE.githubUrl] } : {}),
    },
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
      author: { "@id": PERSON_ID },
    },
    ...(SITE.githubUrl
      ? [
          {
            "@type": "SoftwareSourceCode",
            name: SITE.name,
            codeRepository: SITE.githubUrl,
            programmingLanguage: ["Python", "TypeScript"],
            author: { "@id": PERSON_ID },
          },
        ]
      : []),
    ...[
      ["Nonlinear Beta Tracker", "/beta"],
      ["Portfolio explorer", "/explore"],
      ["Options Pricing", "/options"],
      ["Transaction ML", "/transactions"],
      ["Methodology", "/methodology"],
      ["About", "/about"],
    ].map(([name, path]) => ({ "@type": "SiteNavigationElement", name, url: `${SITE_URL}${path}` })),
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under the notch and home indicator; globals.css pads with env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfb" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a19" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <JsonLd data={STRUCTURED_DATA} />
      </head>
      <body>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
