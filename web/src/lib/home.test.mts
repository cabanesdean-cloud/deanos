// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_VIEW, parseView, VIEW_SCRIPT, VIEWS, viewHref, viewTitle } from "./home.ts";

test("overview is the default for a bare, empty or unknown view", () => {
  assert.equal(DEFAULT_VIEW, "overview");
  assert.equal(parseView(""), "overview");
  assert.equal(parseView("?"), "overview");
  assert.equal(parseView("?view="), "overview");
  assert.equal(parseView("?view=nope"), "overview");
  assert.equal(parseView("?other=projects"), "overview");
});

test("every view round-trips through its URL", () => {
  for (const v of VIEWS) {
    const href = viewHref(v.id);
    assert.equal(parseView(href.includes("?") ? href.slice(href.indexOf("?")) : ""), v.id);
  }
  assert.equal(viewHref("overview"), "/");
  assert.equal(viewHref("projects"), "/?view=projects");
});

test("case, whitespace, other params and aliases", () => {
  assert.equal(parseView("?view=Projects"), "projects");
  assert.equal(parseView("view=%20skills%20"), "skills");
  assert.equal(parseView("?utm_source=x&view=education"), "education");
  assert.equal(parseView("?view=leadership"), "experience");
  assert.equal(parseView("?view=interests"), "skills");
});

test("titles", () => {
  assert.equal(viewTitle("overview", "Dean Cabanes"), "Dean Cabanes");
  assert.equal(viewTitle("experience", "Dean Cabanes"), "Experience & leadership · Dean Cabanes");
});

test("the inline pre-paint script agrees with parseView", () => {
  const cases = ["", "?view=projects", "?view=EXPERIENCE", "?view=leadership", "?view=bogus", "?a=1&view=skills", "?view=%20education"];
  for (const search of cases) {
    const dataset: Record<string, string> = {};
    const run = new Function("location", "document", VIEW_SCRIPT);
    run({ search }, { documentElement: { dataset } });
    assert.equal(dataset.homeView, parseView(search), search);
  }
});
