"use client";

import { useEffect, useState } from "react";

/**
 * Engine API client. Requests are GETs keyed by their full URL, cached in
 * memory for the session (responses only change when the nightly data
 * does) and de-duplicated while in flight.
 */

const BASE = "/deanos/api";
const TIMEOUT_MS = 45_000;
const MAX_CACHE = 60;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

export function apiUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const qs = q.toString();
  return `${BASE}/${path}${qs ? `?${qs}` : ""}`;
}

async function request<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    const body = (await res.json().catch(() => null)) as { error?: string; detail?: unknown } | null;
    if (!res.ok) {
      const msg =
        body?.error ??
        (res.status === 422 ? "Some settings are out of range." : `Request failed (${res.status}).`);
      throw new ApiError(msg, res.status);
    }
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError")
      throw new ApiError("The engine took too long to respond. Try again in a moment.", 504);
    throw new ApiError("Could not reach the engine. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }
}

export function fetchApi<T>(url: string): Promise<T> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) as T);
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;
  const p = request<T>(url)
    .then((data) => {
      cache.set(url, data);
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
      return data;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

export type ApiState<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "ready"; data: T; error?: undefined }
  | { status: "error"; data?: undefined; error: ApiError };

/** Fetch ``url`` (or nothing when null). Keeps the previous data visible while a new URL loads. */
export function useApi<T>(url: string | null): ApiState<T> & { stale: boolean } {
  const [state, setState] = useState<{ url: string; s: ApiState<T> } | null>(null);

  useEffect(() => {
    if (!url || cache.has(url)) return;
    let live = true;
    fetchApi<T>(url).then(
      (data) => live && setState({ url, s: { status: "ready", data } }),
      (error: ApiError) => live && setState({ url, s: { status: "error", error } }),
    );
    return () => {
      live = false;
    };
  }, [url]);

  if (url && cache.has(url)) return { status: "ready", data: cache.get(url) as T, stale: false };
  if (state && state.url === url) return { ...state.s, stale: false };
  if (state?.s.status === "ready") return { ...state.s, stale: true };
  return { status: "loading", stale: false };
}
