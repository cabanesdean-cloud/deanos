"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { ThemeToggle } from "@/components/site/ThemeToggle";
import { DEFAULT_VIEW, parseView, VIEWS, viewHref, viewTitle, type ViewId } from "@/lib/home";
import { PERSON, SITE } from "@/lib/site";

import { Icon } from "./icons";
import { ContactButtons, ViewLink, type Navigate } from "./parts";
import { EducationView, ExperienceView, OverviewView, ProjectsView, SkillsView } from "./views";

// The active view is the URL (?view=...). React reads it through this store; the
// CSS shows the matching view from <html data-home-view>, which VIEW_SCRIPT sets
// before first paint, so a deep link never flashes the overview.
const EVENT = "home-view";
function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener(EVENT, cb);
  };
}
const clientView = () => parseView(window.location.search);
const serverView = (): ViewId => DEFAULT_VIEW;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")).filter((el) => el.getClientRects().length > 0);
}

function SectionList({ className, view, navigate, onBeforeNavigate }: { className: string; view: ViewId; navigate: Navigate; onBeforeNavigate?: () => void }) {
  return (
    <ul className={className}>
      {VIEWS.map((v) => (
        <li key={v.id}>
          <ViewLink view={v.id} navigate={navigate} current={v.id === view} onBeforeNavigate={onBeforeNavigate}>
            {v.label}
          </ViewLink>
        </li>
      ))}
    </ul>
  );
}

export function HomeApp() {
  const view = useSyncExternalStore(subscribe, clientView, serverView);
  const menu = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const keepFocus = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [nameInBar, setNameInBar] = useState(false);

  // Keep <html data-home-view> equal to the URL (also after client-side navigation back to "/").
  useIsoLayoutEffect(() => {
    document.documentElement.dataset.homeView = parseView(window.location.search);
  }, [view]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.homeView;
    },
    [],
  );
  // The tab title follows the view. Next writes the page's metadata title into
  // <head> after hydration, so keep correcting it while this page is mounted.
  useEffect(() => {
    const want = viewTitle(view, PERSON.name);
    const set = () => {
      if (document.title !== want) document.title = want;
    };
    set();
    const mo = new MutationObserver(set);
    mo.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [view]);

  // Phone and tablet: the bar shows the name once the large one has scrolled away (or is not shown).
  useEffect(() => {
    const el = heading.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNameInBar(!e.isIntersecting), { rootMargin: "-56px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The corner menu only exists below 768px; close it if the window grows past that.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches && menu.current?.open) menu.current.close();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const navigate = useCallback<Navigate>((id, opts = {}) => {
    if (parseView(window.location.search) !== id) {
      window.history.pushState(null, "", viewHref(id));
      document.documentElement.dataset.homeView = id;
      window.dispatchEvent(new Event(EVENT));
    }
    const target = opts.focus ? document.getElementById(opts.focus) : null;
    if (target) {
      target.scrollIntoView({ block: "start" });
      target.focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: 0 });
      document.getElementById(`view-${id}-title`)?.focus({ preventScroll: true });
    }
  }, []);

  // Keyboard: focus the current section. Pointer/touch: focus the sheet itself, so no focus ring flashes.
  const openMenu = (fromKeyboard: boolean) => {
    const d = menu.current;
    if (!d || d.open) return;
    d.showModal();
    setMenuOpen(true);
    if (fromKeyboard) d.querySelector<HTMLElement>("[aria-current='page']")?.focus();
    else d.focus();
  };
  const closeMenu = (returnFocus: boolean) => {
    keepFocus.current = !returnFocus;
    menu.current?.close();
  };

  const closeForNavigation = () => closeMenu(false);

  const titled = nameInBar || view !== DEFAULT_VIEW;

  return (
    <div className="home">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {/* Phone + tablet bar. Tablet: tabs. Phone: the corner menu. */}
      <nav className={"home-bar" + (titled ? " is-titled" : "")} aria-label="Site">
        <ViewLink className="home-bar__name" view="overview" navigate={navigate} tabIndex={titled ? undefined : -1} aria-hidden={titled ? undefined : true}>
          {PERSON.name}
        </ViewLink>
        <div className="home-tabs">
          <SectionList className="home-tabs__list" view={view} navigate={navigate} />
        </div>
        <div className="home-bar__actions">
          <ThemeToggle />
          <button
            ref={menuButton}
            type="button"
            className="button home-menu-button"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls="home-menu"
            onClick={(e) => openMenu(e.detail === 0)}
          >
            <Icon.Menu />
            Menu
          </button>
        </div>
      </nav>

      <dialog
        ref={menu}
        id="home-menu"
        className="home-sheet"
        aria-label="Menu"
        tabIndex={-1}
        onClose={() => {
          setMenuOpen(false);
          if (!keepFocus.current) menuButton.current?.focus();
          keepFocus.current = false;
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeMenu(true);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Tab" || !menu.current) return;
          const f = focusables(menu.current);
          if (!f.length) return;
          const first = f[0];
          const last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="home-sheet__inner">
          <div className="home-sheet__head">
            <span className="home-sheet__title">{PERSON.name}</span>
            <button type="button" className="icon-button" aria-label="Close menu" onClick={() => closeMenu(true)}>
              <Icon.Close />
            </button>
          </div>
          <nav aria-label="Sections"><SectionList className="home-sheet__nav" view={view} navigate={navigate} onBeforeNavigate={closeForNavigation} /></nav>
          <ContactButtons className="home-contact--sheet" />
          <div className="home-sheet__foot">
            <Link className="button button--ghost" href="/deanos/about">
              How this site was built
            </Link>
          </div>
        </div>
      </dialog>

      <header className="home-rail">
        <div className="home-rail__top">
          <h1 ref={heading} className="home-rail__name">
            {PERSON.name}
          </h1>
          <div className="home-rail__theme">
            <ThemeToggle />
          </div>
        </div>
        <p className="home-rail__summary">{PERSON.summary}</p>
        <p className="home-rail__loc">
          <Icon.Pin size={14} />
          {PERSON.location}
        </p>
        <p className="print-only home-print-contact">
          {PERSON.location} · cabanesdean@gmail.com · linkedin.com/in/dean-cabanes-3504aa367 · github.com/cabanesdean-cloud
        </p>
        <ContactButtons className="home-contact--rail" />
        <nav className="home-railnav" aria-label="Sections">
          <SectionList className="home-railnav__list" view={view} navigate={navigate} />
        </nav>
        <div className="home-rail__foot">
          <Link className="button button--ghost" href="/deanos/about">
            How this site was built
          </Link>
          {SITE.githubUrl && (
            <a className="button button--ghost" href={SITE.githubUrl}>
              Source on GitHub
            </a>
          )}
        </div>
      </header>

      <main id="main" className="home-main" tabIndex={-1}>
        <OverviewView navigate={navigate} />
        <ProjectsView navigate={navigate} />
        <ExperienceView />
        <EducationView />
        <SkillsView />
        <footer className="home-foot">
          <Link className="button button--ghost" href="/deanos/about">
            How this site was built
          </Link>
          {SITE.githubUrl && (
            <a className="button button--ghost" href={SITE.githubUrl}>
              Source on GitHub
            </a>
          )}
        </footer>
      </main>
    </div>
  );
}
