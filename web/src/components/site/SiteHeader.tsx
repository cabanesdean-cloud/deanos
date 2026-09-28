"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PROJECTS, SITE } from "@/lib/site";

import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const projects = useRef<HTMLDetailsElement>(null);

  // Close menus after navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    projects.current?.removeAttribute("open");
  }, [pathname]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const d = projects.current;
      if (d?.open && !d.contains(e.target as Node)) d.removeAttribute("open");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        projects.current?.removeAttribute("open");
        setOpen(false);
      }
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const isCurrent = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="site-header">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="container site-header__row">
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
          {SITE.homeUrl ? (
            <a className="site-header__brand" href={SITE.homeUrl}>
              {SITE.owner}
            </a>
          ) : (
            <span className="site-header__brand">{SITE.owner}</span>
          )}
          <span className="faint" aria-hidden>
            /
          </span>
          <Link className="site-header__brand" href="/">
            {SITE.name}
          </Link>
        </div>

        <nav className="site-nav" aria-label="Main">
          <details className="nav-projects" ref={projects}>
            <summary>Projects</summary>
            <div className="nav-projects__menu">
              {PROJECTS.map((p) =>
                p.href ? (
                  <Link key={p.name} className="menu-item" href={p.href as Route} aria-current={p.current ? "page" : undefined}>
                    {p.name}
                    {p.current && <span className="menu-item__note">You are here</span>}
                  </Link>
                ) : (
                  <span key={p.name} className="menu-item" aria-disabled="true">
                    {p.name}
                    <span className="menu-item__note">Coming soon</span>
                  </span>
                ),
              )}
            </div>
          </details>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isCurrent(n.href) ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
          {SITE.githubUrl && <a href={SITE.githubUrl}>GitHub</a>}
        </nav>

        <div className="site-header__actions">
          <ThemeToggle />
          <button
            type="button"
            className="icon-button menu-toggle"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              {open ? <path d="M4 4l10 10M14 4L4 14" /> : <path d="M3 5h12M3 9h12M3 13h12" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" className="mobile-nav container" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isCurrent(n.href) ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
          {SITE.githubUrl && <a href={SITE.githubUrl}>GitHub</a>}
          <div className="mobile-nav__label">Projects</div>
          {PROJECTS.map((p) =>
            p.href ? (
              <Link key={p.name} href={p.href as Route}>
                {p.name}
              </Link>
            ) : (
              <span key={p.name}>{p.name} (coming soon)</span>
            ),
          )}
        </nav>
      )}
    </header>
  );
}
