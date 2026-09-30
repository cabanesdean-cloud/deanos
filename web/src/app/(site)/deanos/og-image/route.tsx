import { ogImage } from "@/lib/og";

// A stable share-image URL for DeanOS pages without their own image (explore,
// methodology index, about). File-convention images get hashed URLs, so pages
// cannot reference them by path.
export const dynamic = "force-static";

export function GET() {
  return ogImage({
    eyebrow: "Dean Cabanes",
    title: "DeanOS",
    subtitle: "Portfolio risk and modeling engine: volatility, simulation, regimes, factors and stress tests",
  });
}
