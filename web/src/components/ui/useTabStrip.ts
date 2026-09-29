"use client";

import { useEffect, useRef } from "react";

/**
 * Section tabs that scroll sideways on phones and tablets. When the active tab
 * changes, center it in the strip; after the first render, if the strip is
 * stuck under the header (the reader switched tabs from further down), bring
 * the new section's start back into view. Does nothing when the tabs are a
 * vertical sidebar (the desktop layout).
 */
export function useTabStrip<T extends HTMLElement>(active: string) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useEffect(() => {
    const nav = ref.current;
    const initial = first.current;
    first.current = false;
    if (!nav) return;
    const style = getComputedStyle(nav);
    if (style.flexDirection !== "row") return;
    const smooth = !initial && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tab = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (tab && nav.scrollWidth > nav.clientWidth) {
      const left = tab.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
      nav.scrollTo({ left: Math.max(0, left - (nav.clientWidth - tab.offsetWidth) / 2), behavior: smooth ? "smooth" : "auto" });
    }
    if (initial || style.position !== "sticky") return;
    const stickyTop = parseFloat(style.top) || 0;
    const parent = nav.parentElement;
    if (!parent || nav.getBoundingClientRect().top > stickyTop + 1) return;
    window.scrollTo({ top: window.scrollY + parent.getBoundingClientRect().top - stickyTop, behavior: "auto" });
  }, [active]);
  return ref;
}
