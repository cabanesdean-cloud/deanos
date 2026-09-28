import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "DeanOS: Portfolio Risk & Modeling Engine";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({
    eyebrow: "Dean Cabanes",
    title: "DeanOS",
    subtitle: "Portfolio risk and modeling engine: volatility, simulation, regimes, factors and stress tests",
  });
}
