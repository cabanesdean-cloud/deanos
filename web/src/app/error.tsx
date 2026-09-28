"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container">
      <header className="page-head">
        <h1>Something went wrong</h1>
        <p>This page hit an unexpected problem. Nothing you entered was saved or sent anywhere else.</p>
      </header>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="button button--primary" onClick={() => retry()}>
          Try again
        </button>
        <Link className="button" href="/">
          Go to the home page
        </Link>
      </div>
    </div>
  );
}
