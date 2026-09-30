import Link from "next/link";

/** One line on every DeanOS page: what the public version is, and what it leaves out. */
export function RebuildNote({ className }: { className?: string }) {
  return (
    <p className={`rebuild-note small muted${className ? ` ${className}` : ""}`}>
      This is a public rebuild of a personal system. The personal version also includes a Telegram-based agent and
      live broker data, which are left out for privacy, and some models were revised:{" "}
      <Link href="/deanos/about#judgment">an example</Link>.
    </p>
  );
}
