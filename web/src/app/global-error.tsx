"use client";

/** Last-resort boundary if the root layout itself fails. Renders its own document. */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, maxWidth: 560 }}>
        <h1 style={{ fontSize: 24 }}>DeanOS could not load</h1>
        <p>Something unexpected went wrong. Please try again.</p>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  );
}
