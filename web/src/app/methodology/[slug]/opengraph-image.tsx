import { getMethod, groupOf, METHODS } from "@/content/methodology";
import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "DeanOS methodology";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return METHODS.map((m) => ({ slug: m.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = getMethod(slug);
  return ogImage({
    eyebrow:
      m && groupOf(m) === "options"
        ? "Options Pricing · Methodology"
        : m && groupOf(m) === "transactions"
          ? "Transaction ML · Methodology"
          : "DeanOS · Methodology",
    title: m?.short ?? "Methodology",
    subtitle: m?.summary ?? "How the models work and where they fail.",
  });
}
