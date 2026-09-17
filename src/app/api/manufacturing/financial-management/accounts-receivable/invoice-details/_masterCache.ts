export const MASTER_CACHE_TTL_MS = 60_000;

export interface UnitMaster {
  unit_id: number;
  unit_name?: string;
  unit_shortcut?: string;
  order?: number | null;
  sku_code?: string | null;
}

export interface DiscountTypeMaster {
  id: number;
  discount_type?: string;
  total_percent?: string | number;
}

export interface MasterCache<T> {
  data: Map<number, T>;
  expires: number;
}

let unitsMasterCache: MasterCache<UnitMaster> | null = null;
let discountTypesMasterCache: MasterCache<DiscountTypeMaster> | null = null;

export function resetMasterCaches(): void {
  unitsMasterCache = null;
  discountTypesMasterCache = null;
}

export function mergeMasterCacheEntries<T>(
  existing: Map<number, T>,
  incoming: T[],
  getId: (item: T) => number,
): Map<number, T> {
  const merged = new Map(existing);
  for (const item of incoming) {
    merged.set(getId(item), item);
  }
  return merged;
}

async function resolveCachedMasterData<T>(
  ids: number[],
  getCache: () => MasterCache<T> | null,
  setCache: (next: MasterCache<T> | null) => void,
  getId: (item: T) => number,
  fetchByIds: (missingIds: number[]) => Promise<T[]>,
): Promise<Map<number, T>> {
  const map = new Map<number, T>();
  const missing = new Set(ids);
  const now = Date.now();
  const cache = getCache();

  if (cache && now < cache.expires) {
    for (const id of ids) {
      const hit = cache.data.get(id);
      if (hit) {
        map.set(id, hit);
        missing.delete(id);
      }
    }
  }

  if (missing.size > 0) {
    const fetched = await fetchByIds(Array.from(missing));
    for (const item of fetched) {
      map.set(getId(item), item);
    }

    const currentCache = getCache();
    const expires = now + MASTER_CACHE_TTL_MS;
    if (!currentCache || now >= currentCache.expires) {
      setCache({
        data: new Map(fetched.map((item) => [getId(item), item])),
        expires,
      });
    } else {
      setCache({
        data: mergeMasterCacheEntries(currentCache.data, fetched, getId),
        expires: currentCache.expires,
      });
    }
  }

  return map;
}

export async function getCachedUnits(
  ids: number[],
  fetchByIds: (missingIds: number[]) => Promise<UnitMaster[]>,
): Promise<Map<number, UnitMaster>> {
  return resolveCachedMasterData(
    ids,
    () => unitsMasterCache,
    (next) => { unitsMasterCache = next; },
    (u) => u.unit_id,
    fetchByIds,
  );
}

export async function getCachedDiscountTypes(
  ids: number[],
  fetchByIds: (missingIds: number[]) => Promise<DiscountTypeMaster[]>,
): Promise<Map<number, DiscountTypeMaster>> {
  return resolveCachedMasterData(
    ids,
    () => discountTypesMasterCache,
    (next) => { discountTypesMasterCache = next; },
    (d) => d.id,
    fetchByIds,
  );
}
