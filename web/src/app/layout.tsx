import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://deancabanes.com"),
  title: "DeanOS: Portfolio Risk & Modeling Engine",
  description:
    "Explore how a portfolio behaves across changing market conditions using quantitative risk models, simulations and scenario analysis.",
  alternates: { canonical: "/deanos" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
