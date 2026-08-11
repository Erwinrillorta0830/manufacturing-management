import { directusHeaders, fetchDirectus, mustBase } from "./price-change-batches/_batch";
import { getSupplierProductIds } from "./_supplierFilters";

export const DEFAULT_PAGE_SIZE = 500;
export const IN_CHUNK_SIZE = 200;
export const PRODUCTS_COLLECTION = "products";

type DirectusList<T> = { data?: T[]; meta?: { filter_count?: number } | null };

export function chunkArray<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

export async function fetchAllPages<T>(
    collection: string,
    buildParams: (offset: number, limit: number) => URLSearchParams,
    pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
    const all: T[] = [];
    let offset = 0;

    while (true) {
        const params = buildParams(offset, pageSize);
        params.set("limit", String(pageSize));
        params.set("offset", String(offset));

        const url = `${mustBase()}/items/${collection}?${params.toString()}`;
        const json = await fetchDirectus<DirectusList<T>>(url, { headers: directusHeaders() });
        const rows = json.data ?? [];
        all.push(...rows);

        if (rows.length < pageSize) break;
        offset += pageSize;
    }

    return all;
}

export async function fetchOnePage<T>(
    collection: string,
    buildParams: (offset: number, limit: number) => URLSearchParams,
    offset: number,
    limit: number,
    options?: { includeFilterCount?: boolean },
): Promise<{ rows: T[]; filterCount?: number }> {
    const params = buildParams(offset, limit);
    params.set("limit", String(limit));
    params.set("offset", String(offset));

    if (options?.includeFilterCount) {
        params.set("meta", "filter_count");
    }

    const url = `${mustBase()}/items/${collection}?${params.toString()}`;
    const json = await fetchDirectus<DirectusList<T>>(url, { headers: directusHeaders() });

    return {
        rows: json.data ?? [],
        filterCount:
            options?.includeFilterCount && json.meta?.filter_count != null
                ? Number(json.meta.filter_count)
                : undefined,
    };
}

export async function fetchItemsWhereIn<T>(
    collection: string,
    inField: string,
    ids: number[],
    applyBaseParams: (params: URLSearchParams, chunkIds: number[]) => void,
    chunkSize = IN_CHUNK_SIZE,
    pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
    if (!ids.length) return [];

    const all: T[] = [];

    for (const chunkIds of chunkArray(ids, chunkSize)) {
        const rows = await fetchAllPages<T>(
            collection,
            () => {
                const params = new URLSearchParams();
                applyBaseParams(params, chunkIds);
                params.set(`filter[${inField}][_in]`, chunkIds.join(","));
                return params;
            },
            pageSize,
        );
        all.push(...rows);
    }

    return all;
}

export async function getSupplierProductIdsForSuppliers(
    resolvedSupplierIds: string[],
): Promise<number[]> {
    const all: number[] = [];

    for (const supplierId of resolvedSupplierIds) {
        const trimmed = String(supplierId ?? "").trim();
        if (!trimmed) continue;
        const ids = await getSupplierProductIds(trimmed);
        all.push(...ids);
    }

    return Array.from(new Set(all.filter((n) => Number.isFinite(n) && n > 0)));
}

export async function getChildProductIdsForParents(parentIds: number[]): Promise<number[]> {
    if (!parentIds.length) return [];

    const rows = await fetchItemsWhereIn<{ product_id?: number | string | null }>(
        PRODUCTS_COLLECTION,
        "parent_id",
        parentIds,
        (params) => {
            params.set("fields", "product_id");
        },
    );

    const ids: number[] = [];
    for (const row of rows) {
        const n = Number(row.product_id);
        if (Number.isFinite(n) && n > 0) ids.push(n);
    }

    return Array.from(new Set(ids));
}
