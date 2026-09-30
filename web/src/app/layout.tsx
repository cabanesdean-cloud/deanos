import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { THEME_SCRIPT } from "@/components/site/ThemeToggle";
import { HOME_URL, PERSON, SITE } from "@/lib/site";

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

// Root of deancabanes.com. The résumé homepage (app/page.tsx) renders its own
// header; every tool gets its own minimal header from app/(site)/layout.tsx.
export const metadata: Metadata = {
  metadataBase: new URL(SITE.origin),
  title: { default: PERSON.name, template: `%s · ${PERSON.name}` },
  description: PERSON.description,
  alternates: { canonical: HOME_URL },
  applicationName: PERSON.name,
  authors: [{ name: PERSON.name, url: HOME_URL }],
  creator: PERSON.name,
  openGraph: { type: "website", siteName: PERSON.name, locale: "en_US", url: HOME_URL, title: PERSON.name, description: PERSON.description },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: PERSON.name, statusBarStyle: "default" },
  formatDetection: { telephone: false },
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
      </head>
      <body>{children}</body>
    </html>
  );
}
