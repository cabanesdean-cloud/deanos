import { OG_SIZE, ogImage } from "@/lib/og";
import { OPTIONS_PROJECT } from "@/lib/site";

export const alt = "Options Pricing: Monte Carlo Options Pricing Engine";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({
    eyebrow: "Dean Cabanes",
    title: OPTIONS_PROJECT.name,
    subtitle: "Black-Scholes, Monte Carlo and binomial trees: prices, Greeks, implied volatility and early exercise",
  });
}
