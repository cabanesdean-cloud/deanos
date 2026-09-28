"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

function current(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  window.addEventListener("deanos-theme", cb);
  return () => {
    mq.removeEventListener("change", cb);
    window.removeEventListener("deanos-theme", cb);
  };
}

/** Light/dark switch. The choice is kept in localStorage; system setting is the default. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, current, () => "light" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("deanos-theme", next);
        } catch {
          /* storage unavailable: the choice lasts for this page only */
        }
        window.dispatchEvent(new Event("deanos-theme"));
      }}
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

/** Inline script for <head>: applies a saved theme before first paint. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("deanos-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
