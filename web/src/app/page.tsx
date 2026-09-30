import type { Metadata } from "next";

import { JsonLd } from "@/components/site/JsonLd";
import { HomeApp } from "@/components/home/HomeApp";
import { VIEW_SCRIPT } from "@/lib/home";
import { CONTACT, HOME_URL, PERSON } from "@/lib/site";

// Dean's homepage: one document, five views (?view=...; overview by default).
// Every fact comes from Dean_Cabanes_Resume_2026.pdf (served from /public), see
// components/home/content.ts. The phone number is only in the PDF, never on a page.

export const metadata: Metadata = {
  title: { absolute: PERSON.name },
  description: PERSON.description,
  alternates: { canonical: HOME_URL },
  openGraph: {
    type: "profile",
    siteName: PERSON.name,
    url: HOME_URL,
    title: PERSON.name,
    description: PERSON.description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${PERSON.name}: résumé and projects` }],
  },
};

const PERSON_LD = {
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": `${HOME_URL}#person`,
  name: PERSON.name,
  alternateName: PERSON.fullName,
  url: HOME_URL,
  description: PERSON.description,
  email: CONTACT.email ? `mailto:${CONTACT.email}` : undefined,
  address: { "@type": "PostalAddress", addressLocality: "Santa Barbara", addressRegion: "CA", addressCountry: "US" },
  jobTitle: PERSON.jobTitle,
  worksFor: { "@type": "Organization", name: PERSON.employer },
  affiliation: { "@type": "CollegeOrUniversity", name: PERSON.college },
  alumniOf: { "@type": "HighSchool", name: "Mira Costa High School" },
  knowsAbout: ["Python", "Regression", "Monte Carlo simulation", "Risk modeling", "Options pricing"],
  sameAs: [CONTACT.linkedinUrl, CONTACT.githubProfileUrl].filter((u): u is string => Boolean(u)),
};

export default function Home() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: VIEW_SCRIPT }} />
      <JsonLd data={PERSON_LD} />
      <HomeApp />
    </>
  );
}
