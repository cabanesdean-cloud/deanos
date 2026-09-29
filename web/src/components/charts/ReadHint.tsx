/**
 * Instruction for reading a chart, chosen by input capability in CSS (not
 * viewport width), so it is right on first paint and never flips during
 * hydration: "hover" for mouse and keyboard, "tap" for touch-first devices,
 * and a combined line for devices with both (see .hint-* in globals.css).
 */
export function ReadHint({
  hover = "Hover or use arrow keys to read values",
  touch = "Tap to read values",
  both = "Hover, tap or use arrow keys to read values",
}: {
  hover?: string;
  touch?: string;
  both?: string;
}) {
  return (
    <span className="faint">
      <span className="hint-hover">{hover}</span>
      <span className="hint-touch">{touch}</span>
      <span className="hint-both">{both}</span>
    </span>
  );
}
