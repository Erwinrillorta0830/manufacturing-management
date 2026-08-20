import type { GroupIndexEntry, ProductCatalogFilters } from "./_productGroups";

export type GroupIndexCachePayload = {
    groups: GroupIndexEntry[];
    totalVariants: number;
};

type CachedGroupIndex = GroupIndexCachePayload & {
    expiresAt: number;
    lastAccessedAt: number;
};

// Per-process only; not shared across serverless instances.
const CACHE_TTL_MS = 30_000;
const MAX_ENTRIES = 50;

const cache = new Map<string, CachedGroupIndex>();
const inFlight = new Map<string, Promise<GroupIndexCachePayload>>();

function sortedStrings(values: string[] | undefined): string[] {
    return [...(values ?? [])].map((value) => String(value)).sort();
}

function sortedSupplierIds(supplierProductIds: number[] | null): number[] | null {
    if (supplierProductIds == null) return null;
    return [...supplierProductIds].sort((a, b) => a - b);
}

export function buildGroupIndexCacheKey(
    filters: ProductCatalogFilters,
    supplierProductIds: number[] | null,
): string {
    return JSON.stringify({
        q: String(filters.q ?? ""),
        categoryIds: sortedStrings(filters.categoryIds),
        brandIds: sortedStrings(filters.brandIds),
        unitIds: sortedStrings(filters.unitIds),
        activeOnly: filters.activeOnly ?? true,
        missingTier: filters.missingTier ?? false,
        supplierProductIds: sortedSupplierIds(supplierProductIds),
    });
}

function touchEntry(entry: CachedGroupIndex): void {
    entry.lastAccessedAt = Date.now();
}

function trimCache(): void {
    while (cache.size > MAX_ENTRIES) {
        let oldestKey: string | null = null;
        let oldestAccess = Number.POSITIVE_INFINITY;

        for (const [key, entry] of cache.entries()) {
            if (entry.lastAccessedAt < oldestAccess) {
                oldestAccess = entry.lastAccessedAt;
                oldestKey = key;
            }
        }

        if (!oldestKey) break;
        cache.delete(oldestKey);
    }
}

export function getCachedGroupIndex(key: string): GroupIndexCachePayload | null {
    const entry = cache.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }

    touchEntry(entry);
    return {
        groups: entry.groups,
        totalVariants: entry.totalVariants,
    };
}

export function setCachedGroupIndex(key: string, value: GroupIndexCachePayload): void {
    const now = Date.now();
    cache.set(key, {
        ...value,
        expiresAt: now + CACHE_TTL_MS,
        lastAccessedAt: now,
    });
    trimCache();
}

export async function getOrBuildGroupIndex(
    key: string,
    buildFn: () => Promise<GroupIndexCachePayload>,
): Promise<GroupIndexCachePayload> {
    const cached = getCachedGroupIndex(key);
    if (cached) return cached;

    const pending = inFlight.get(key);
    if (pending) return pending;

    const promise = (async () => {
        const built = await buildFn();
        setCachedGroupIndex(key, built);
        return built;
    })();

    inFlight.set(key, promise);

    try {
        return await promise;
    } finally {
        inFlight.delete(key);
    }
}

export function invalidateGroupIndexCache(): void {
    cache.clear();
    inFlight.clear();
}

/** Call after any mutation that changes product catalog fields used by the group index. */
export function invalidateGroupIndexCacheOnCatalogChange(): void {
    invalidateGroupIndexCache();
}
