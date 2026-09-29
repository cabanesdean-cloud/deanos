import { OG_SIZE, ogImage } from "@/lib/og";
import { TX_PROJECT } from "@/lib/site";

export const alt = "Transaction ML: Explainable Transaction Categorization";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({
    eyebrow: "Dean Cabanes",
    title: TX_PROJECT.name,
    subtitle: "Categorizing bank transactions with calibrated probabilities, explanations and an honest held-out evaluation",
  });
}
