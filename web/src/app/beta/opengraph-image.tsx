import { OG_SIZE, ogImage } from "@/lib/og";
import { BETA_PROJECT } from "@/lib/site";

export const alt = "Nonlinear Beta Tracker: linear and state-dependent beta against a benchmark";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({
    eyebrow: "Dean Cabanes · My first project",
    title: BETA_PROJECT.name,
    subtitle: "A straight-line beta next to a quadratic fit and its slope, plus conditional betas by market move",
  });
}
