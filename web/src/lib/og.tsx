import { ImageResponse } from "next/og";

/** Shared Open Graph card: title, subtitle, and an abstract fan of outcomes. */
export const OG_SIZE = { width: 1200, height: 630 };

export function ogImage({
  eyebrow,
  title,
  subtitle,
  footer = "deancabanes.com/deanos · educational project, not investment advice",
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  footer?: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#1a1a19",
          color: "#f2f1ed",
          padding: "64px 72px",
          position: "relative",
        }}
      >
        <svg width="560" height="630" viewBox="0 0 560 630" style={{ position: "absolute", right: 0, top: 0 }}>
          <path d="M160 360 C 320 330, 400 200, 560 90 L 560 610 C 400 520, 320 420, 160 360 Z" fill="#3987e5" fillOpacity="0.18" />
          <path d="M160 360 C 320 340, 400 260, 560 210 L 560 470 C 400 440, 320 390, 160 360 Z" fill="#3987e5" fillOpacity="0.32" />
          <path d="M160 360 C 320 350, 400 320, 560 330" stroke="#86b6ef" strokeWidth="5" fill="none" />
          <line x1="160" y1="360" x2="560" y2="360" stroke="#9d9c93" strokeWidth="2" strokeDasharray="8 8" />
        </svg>
        <div style={{ display: "flex", fontSize: 28, color: "#c3c2b7" }}>{eyebrow}</div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 600 }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>{title}</div>
          <div style={{ display: "flex", fontSize: 34, color: "#c3c2b7", marginTop: 20, lineHeight: 1.3 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#9d9c93" }}>
          {footer}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
