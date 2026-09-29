import assert from "node:assert/strict";
import { test } from "node:test";

import { apiParams, BETA_DEFAULTS, readParams, toQuery } from "./beta.ts";

const from = (q: string) => {
  const u = new URLSearchParams(q);
  return readParams((k) => u.get(k));
};

test("defaults are the original tracker's example", () => {
  assert.deepEqual(from(""), BETA_DEFAULTS);
  assert.equal(toQuery(BETA_DEFAULTS), "");
});

test("settings round-trip through the URL", () => {
  const p = { ...BETA_DEFAULTS, asset: "BRK-B", benchmark: "QQQ", lookback: "10Y" as const, freq: "weekly" as const, ret: "simple" as const, window: 120, winsorize: true };
  assert.deepEqual(from(toQuery(p)), p);
});

test("malformed input falls back instead of reaching the engine", () => {
  const p = from("asset=<script>&benchmark=&lb=7Y&freq=hourly&ret=x&w=5&wz=yes");
  assert.deepEqual(p, BETA_DEFAULTS);
  assert.equal(from("asset=brk.b").asset, "BRK-B");
});

test("engine query is explicit so every visitor shares the CDN cache entry", () => {
  assert.deepEqual(apiParams(BETA_DEFAULTS), { asset: "NVDA", benchmark: "SPY", lookback: "5Y", freq: "daily", ret: "log", window: 60 });
});
