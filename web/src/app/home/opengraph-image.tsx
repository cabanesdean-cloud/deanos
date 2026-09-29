import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Dean Cabanes: finance and quantitative modeling projects";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({
    eyebrow: "deancabanes.com",
    title: "Dean Cabanes",
    subtitle: "Tools to explore financial risk, test models and understand their limitations",
    footer: "Nonlinear Beta Tracker · DeanOS · Options Pricing · Transaction ML",
  });
}
