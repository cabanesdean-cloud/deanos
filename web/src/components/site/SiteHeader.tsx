"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { projectBrand, type ProjectLink, PROJECTS, projectForPath, SITE } from "@/lib/site";

import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/explore", label: "Portfolio explorer" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
] as const;

export function SiteHeader() {
  // The overview is served at "/" through a platform rewrite to /deanos/home, so the
  // browser path and the route differ there; the route segment is reliable either way.
  const segment = useSelectedLayoutSegment();
  const rawPath = usePathname();
  const pathname = segment === "home" ? "/home" : rawPath;
  const [open, setOpen] = useState(false);
  const projects = useRef<HTMLDetailsElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const mobileNav = useRef<HTMLElement>(null);

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

  // Phone menu: lock the page behind it, move focus into it, and give focus back
  // to the button when it closes. It closes itself if the window grows to the
  // desktop layout, where the menu button does not exist.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    const nav = mobileNav.current;
    nav?.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => wide.matches && setOpen(false);
    wide.addEventListener("change", onWide);
    const button = toggle.current;
    return () => {
      root.style.overflow = prev;
      wide.removeEventListener("change", onWide);
      // The menu is already unmounted here, so focus inside it has fallen back to <body>.
      const active = document.activeElement;
      if (button && (!active || active === document.body || nav?.contains(active))) button.focus({ preventScroll: true });
    };
  }, [open]);

  const closeProjects = () => projects.current?.removeAttribute("open");

  const isCurrent = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const project = projectForPath(pathname);
  const brand = project ? projectBrand(project) : null;

  return (
    <header className="site-header">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="container site-header__row">
        <div className="site-header__brands">
          {/* The overview lives outside the /deanos base path, so this is a plain link. */}
          {SITE.homeUrl ? (
            <a className="site-header__brand" href={SITE.homeUrl} aria-current={project === null && pathname === "/home" ? "page" : undefined}>
              {SITE.owner}
            </a>
          ) : (
            <span className="site-header__brand">{SITE.owner}</span>
          )}
          {brand && (
            <>
              <span className="faint" aria-hidden>
                /
              </span>
              <Link className="site-header__brand site-header__brand--project" href={brand.href as Route}>
                {brand.name}
              </Link>
            </>
          )}
        </div>

        <nav className="site-nav" aria-label="Main">
          <details className="nav-projects" ref={projects}>
            <summary>Projects</summary>
            <div className="nav-projects__menu">
              {PROJECTS.map((p) => (
                <ProjectItem key={p.id} project={p} current={p.id === project} onNavigate={closeProjects} />
              ))}
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
            ref={toggle}
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
        <nav id="mobile-nav" ref={mobileNav} className="mobile-nav container" aria-label="Main">
          {SITE.homeUrl && (
            <a href={SITE.homeUrl} aria-current={pathname === "/home" ? "page" : undefined}>
              Overview
            </a>
          )}
          {NAV.map((n) => (
            // Closing on tap also covers links to the page already open, where the path does not change.
            <Link key={n.href} href={n.href} aria-current={isCurrent(n.href) ? "page" : undefined} onClick={() => setOpen(false)}>
              {n.label}
            </Link>
          ))}
          {SITE.githubUrl && <a href={SITE.githubUrl}>GitHub</a>}
          <div className="mobile-nav__label">Projects</div>
          <div className="mobile-nav__projects">
            {PROJECTS.map((p) => (
              <ProjectItem key={p.id} project={p} current={p.id === project} onNavigate={() => setOpen(false)} />
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

/** One project in the Projects menu: name and status on the first line, a short description below. */
function ProjectItem({ project: p, current, onNavigate }: { project: ProjectLink; current: boolean; onNavigate: () => void }) {
  const body = (
    <>
      <span className="menu-item__name">{p.name}</span>
      {current ? (
        <span className="menu-item__tag menu-item__tag--current">Current</span>
      ) : !p.href ? (
        <span className="menu-item__tag">Coming soon</span>
      ) : p.note ? (
        <span className="menu-item__tag">{p.note}</span>
      ) : null}
      <span className="menu-item__blurb">{p.blurb}</span>
    </>
  );
  if (!p.href)
    return (
      <div className="menu-item" aria-disabled="true">
        {body}
      </div>
    );
  return (
    <Link className="menu-item" href={p.href as Route} aria-current={current ? "page" : undefined} onClick={onNavigate}>
      {body}
    </Link>
  );
}
