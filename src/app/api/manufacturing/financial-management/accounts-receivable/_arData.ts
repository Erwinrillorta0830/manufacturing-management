/**
 * Public API for accounts-receivable BFF.
 * Types, Directus fetchers, derivation functions, and orchestrator live in
 * _arFetchAndDerive.ts. This file provides the cache layer and re-exports
 * everything consumed by route.ts.
 */

import type { ARFullPayload } from './_arFetchAndDerive';
import {
  applyARFilters,
  deriveScopedUnpostedMetrics,
  fetchARFullPayload,
} from './_arFetchAndDerive';

// Re-export types consumed by route.ts
export type { ARTableFilters, ARFullPayload, ARRow } from './_arFetchAndDerive';

// Re-export filter/group/metrics functions consumed by route.ts
export { applyARFilters, deriveScopedUnpostedMetrics };

export { buildCustomerGroups } from './_arFetchAndDerive';

// ── In-memory cache (60s TTL) ────────────────────────────────────────────────
//
// Two-layer strategy:
//   1. payloadInFlight — coalesces concurrent requests for the same cache key
//   2. payloadCache      — 60s TTL for recently fetched full AR payloads
//
// Caveat: these are per-process Map caches. They are NOT shared across
// processes or instances. On self-hosted / single-process deployments this
// works well. If migrating to a multi-instance platform (Vercel, Lambda),
// replace with Redis or another distributed cache to avoid cold-start
// cache misses on every instance.
const CACHE_TTL_MS = 60_000;
const payloadCache = new Map<string, { payload: ARFullPayload; expires: number }>();
const payloadInFlight = new Map<string, Promise<ARFullPayload>>();

export function getCachedARPayload(cacheKey: string): ARFullPayload | null {
  const entry = payloadCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expires) { payloadCache.delete(cacheKey); return null; }
  return entry.payload;
}

export function setCachedARPayload(cacheKey: string, payload: ARFullPayload): void {
  payloadCache.set(cacheKey, { payload, expires: Date.now() + CACHE_TTL_MS });
}

export async function getARPayload(cacheKey: string): Promise<ARFullPayload> {
  const cached = getCachedARPayload(cacheKey);
  if (cached) return cached;

  const pending = payloadInFlight.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    const payload = await fetchARFullPayload();
    setCachedARPayload(cacheKey, payload);
    return payload;
  })();

  payloadInFlight.set(cacheKey, promise);
  try { return await promise; } finally { payloadInFlight.delete(cacheKey); }
}
