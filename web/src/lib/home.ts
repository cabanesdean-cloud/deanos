/**
 * Homepage views. The home page is one document with five views; the active
 * view lives in the URL (`/?view=projects`) so deep links, reloads and the
 * back button work. The overview is the default and has the bare `/` URL.
 *
 * No imports: node --test loads this file directly.
 */

export const VIEWS = [
  { id: "overview", label: "Overview", title: "Overview" },
  { id: "projects", label: "Projects", title: "Projects" },
  { id: "experience", label: "Experience", title: "Experience & leadership" },
  { id: "education", label: "Education", title: "Education" },
  { id: "skills", label: "Skills", title: "Skills & interests" },
] as const;

export type ViewId = (typeof VIEWS)[number]["id"];

export const DEFAULT_VIEW: ViewId = "overview";

const VIEW_IDS: readonly string[] = VIEWS.map((v) => v.id);

/** Other names people might type for a view. */
const ALIASES: Record<string, ViewId> = {
  about: "overview",
  home: "overview",
  work: "experience",
  leadership: "experience",
  volunteering: "experience",
  school: "education",
  interests: "skills",
};

/** The view named by a query string ("?view=projects" or "view=projects"); unknown or missing means the overview. */
export function parseView(search: string): ViewId {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = (q.get("view") ?? "").trim().toLowerCase();
  const id = ALIASES[raw] ?? raw;
  return VIEW_IDS.includes(id) ? (id as ViewId) : DEFAULT_VIEW;
}

/** URL of a view. The overview is the bare root. */
export function viewHref(id: ViewId): string {
  return id === DEFAULT_VIEW ? "/" : `/?view=${id}`;
}

/** Document title for a view. */
export function viewTitle(id: ViewId, name: string): string {
  if (id === DEFAULT_VIEW) return name;
  const v = VIEWS.find((x) => x.id === id);
  return `${v ? v.title : id} · ${name}`;
}

/**
 * Inline script (runs before first paint and before React): marks the active
 * view on <html data-home-view>, which the CSS uses to show one view. Same
 * rules as parseView; home.test.mts checks that they agree.
 */
export const VIEW_SCRIPT = `try{var v=(new URLSearchParams(location.search).get("view")||"").trim().toLowerCase(),a=${JSON.stringify(
  ALIASES,
)},i=${JSON.stringify(VIEW_IDS)};v=a[v]||v;document.documentElement.dataset.homeView=i.indexOf(v)>=0?v:"${DEFAULT_VIEW}"}catch(e){}`;
