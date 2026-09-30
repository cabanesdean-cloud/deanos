"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { projectForPath, SITE, TOOL_HEADERS } from "@/lib/site";

import { ThemeToggle } from "./ThemeToggle";

/**
 * Each tool's own minimal header: a way back to Dean's résumé homepage, the
 * tool's name, and its own sections and methodology. No cross-project menu.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const tool = TOOL_HEADERS[projectForPath(pathname)];
  const isCurrent = (href: string) => {
    const path = href.split("#")[0];
    return !href.includes("#") && (pathname === path || pathname.startsWith(path + "/"));
  };

  return (
    <header className="site-header tool-header">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="container tool-header__row">
        <div className="tool-header__brands">
          <Link className="tool-header__back" href="/">
            <span aria-hidden>← </span>
            {SITE.owner}
          </Link>
          <Link
            className="tool-header__name"
            href={tool.href as Route}
            aria-current={pathname === tool.href ? "page" : undefined}
          >
            <span className={tool.short ? "tool-header__full has-short" : "tool-header__full"}>{tool.name}</span>
            {tool.short && <span className="tool-header__short">{tool.short}</span>}
          </Link>
        </div>
        <nav className="tool-header__nav" aria-label={`${tool.name} sections`}>
          {tool.nav.map((n) => (
            <Link key={n.href} href={n.href as Route} aria-current={isCurrent(n.href) ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="tool-header__actions">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
