// Run with: npm test (node's built-in runner; Node 24 strips the types).
import assert from "node:assert/strict";
import { test } from "node:test";

import { date, num, pct, plural, range, signedPct, trimNum, years } from "./format.ts";

test("years in running text drop a trailing .0 and keep real fractions", () => {
  assert.equal(years(2520), "10 years");
  assert.equal(years(2519), "10 years");
  assert.equal(years(2646), "10.5 years");
  assert.equal(years(252), "1 year");
  assert.equal(years(126), "0.5 years");
});

test("trimNum and plural", () => {
  assert.equal(trimNum(10), "10");
  assert.equal(trimNum(10.04), "10");
  assert.equal(trimNum(10.05, 2), "10.05");
  assert.equal(trimNum(-3.5), "−3.5");
  assert.equal(trimNum(1234.25), "1,234.3");
  assert.equal(trimNum(Number.NaN), "n/a");
  assert.equal(plural(1, "observation"), "1 observation");
  assert.equal(plural(1254, "observation"), "1,254 observations");
  assert.equal(plural(2, "day"), "2 days");
});

test("financial figures keep their fixed precision", () => {
  assert.equal(pct(0.1), "10.0%");
  assert.equal(pct(-0.0734), "−7.3%");
  assert.equal(signedPct(0.02, 0), "+2%");
  assert.equal(num(1.5), "1.50");
  assert.equal(range(0.01, 0.02), "1.0% to 2.0%");
  assert.equal(date("2020-03-23"), "Mar 23, 2020");
});
