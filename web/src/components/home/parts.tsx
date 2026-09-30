"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";

import { viewHref, type ViewId } from "@/lib/home";
import { CONTACT } from "@/lib/site";

import type { HomeProject } from "./content";
import { Icon } from "./icons";

export type Navigate = (id: ViewId, opts?: { focus?: string }) => void;

/** A link to a view: a real href (works before hydration, opens in a new tab), switched in place on a plain click. */
export function ViewLink({
  view,
  navigate,
  focus,
  current,
  className,
  onBeforeNavigate,
  children,
  ...rest
}: {
  view: ViewId;
  navigate: Navigate;
  focus?: string;
  current?: boolean;
  className?: string;
  onBeforeNavigate?: () => void;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  return (
    <a
      {...rest}
      href={viewHref(view)}
      className={className}
      aria-current={current ? "page" : undefined}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onBeforeNavigate?.();
        navigate(view, { focus });
      }}
    >
      {children}
    </a>
  );
}

/** Copies the email address and says so, in text and to screen readers. */
export function CopyEmail({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const label = state === "copied" ? "Copied" : state === "failed" ? "Press and hold to copy" : "Copy";
  return (
    <button
      type="button"
      className={"button home-copy" + (state === "copied" ? " is-copied" : "")}
      aria-label={state === "idle" ? `Copy email address ${email}` : undefined}
      title={email}
      onClick={async () => {
        window.clearTimeout(timer.current);
        try {
          await navigator.clipboard.writeText(email);
          setState("copied");
        } catch {
          setState("failed");
        }
        timer.current = window.setTimeout(() => setState("idle"), 2200);
      }}
    >
      <span className="home-copy__icon" aria-hidden>
        {state === "copied" ? <Icon.Check /> : <Icon.Copy />}
      </span>
      <span aria-live="polite">{label}</span>
    </button>
  );
}

/** Email (with copy), LinkedIn, GitHub and the résumé PDF, as buttons. Slots without a value are left out. */
export function ContactButtons({ className = "" }: { className?: string }) {
  return (
    <div className={"home-contact " + className}>
      {CONTACT.email && (
        <div className="home-contact__email">
          <a className="button button--primary" href={`mailto:${CONTACT.email}`}>
            <Icon.Mail />
            Email
          </a>
          <CopyEmail email={CONTACT.email} />
        </div>
      )}
      {CONTACT.linkedinUrl && (
        <a className="button" href={CONTACT.linkedinUrl} rel="me noopener">
          <Icon.LinkedIn />
          LinkedIn
        </a>
      )}
      {CONTACT.githubProfileUrl && (
        <a className="button" href={CONTACT.githubProfileUrl} rel="me noopener">
          <Icon.GitHub />
          GitHub
        </a>
      )}
      {CONTACT.resumeUrl && (
        <a className="button home-contact__resume" href={CONTACT.resumeUrl} download>
          <Icon.Download />
          Download résumé
          <span className="home-contact__kind">PDF</span>
        </a>
      )}
    </div>
  );
}

/** A clickable project card: the whole card opens the tool; secondary actions sit above the click target. */
export function ProjectCard({
  p,
  variant,
  navigate,
  headingLevel = 3,
}: {
  p: HomeProject;
  variant: "feature" | "row" | "full";
  navigate: Navigate;
  headingLevel?: 3 | 4;
}) {
  const H = headingLevel === 3 ? "h3" : "h4";
  const full = variant === "full";
  return (
    <article
      className={`pcard pcard--${variant}${p.note === "Side project" ? " pcard--side" : ""}`}
      id={full ? `project-${p.id}` : undefined}
      tabIndex={full ? -1 : undefined}
      aria-labelledby={`${variant}-${p.id}-name`}
    >
      <div className="pcard__body">
        <div className="pcard__top">
          <H className="pcard__name" id={`${variant}-${p.id}-name`}>
            {p.name}
          </H>
          {p.note && <span className="pcard__tag">{p.note}</span>}
        </div>
        <p className="pcard__text">{full ? p.description : p.blurb}</p>
        {full && (
          <>
            <ul className="pcard__stack" aria-label="Built with">
              {p.stack.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="pcard__path print-only">{p.path}</p>
          </>
        )}
      </div>
      <div className="pcard__actions">
        <Link className={"button pcard__open" + (p.featured || full ? " button--primary" : "")} href={p.href as Route}>
          Open<span className="visually-hidden"> {p.name}</span>
        </Link>
        {full ? (
          <Link className="button" href={p.methodHref as Route}>
            Methodology<span className="visually-hidden"> for {p.name}</span>
          </Link>
        ) : (
          <ViewLink className="button button--ghost" view="projects" focus={`project-${p.id}`} navigate={navigate}>
            Details<span className="visually-hidden"> about {p.name}</span>
          </ViewLink>
        )}
      </div>
    </article>
  );
}
