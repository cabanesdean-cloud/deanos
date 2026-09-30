import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Dean Cabanes: economics student, Santa Barbara City College";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({
    eyebrow: "deancabanes.com",
    title: "Dean Cabanes",
    subtitle: "Economics student building Python tools for portfolio risk, options pricing and market modeling",
    footer: "Santa Barbara, CA · Résumé and projects",
  });
}
