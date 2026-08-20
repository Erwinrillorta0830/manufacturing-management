import { getChildProductIdsForParents, getSupplierProductIdsForSuppliers } from "./_directusPaging";
import {
    DETAILS,
    directusHeaders,
    fetchDirectus,
    isRecord,
    mustBase,
} from "./price-change-batches/_batch";

export const PRODUCT_PER_SUPPLIER = "product_per_supplier";

type DirectusSupplierProductRow = {
    product_id?: number | string | { product_id?: number | string | null } | null;
};

type DirectusBatchLineRow = {
    header_id?: number | string | null;
};

const SUPPLIER_PAGE_SIZE = 500;
const PRODUCT_ID_CHUNK_SIZE = 200;

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function parseSupplierProductId(row: DirectusSupplierProductRow): number | null {
    let n: number | null = null;
    if (typeof row.product_id === "number") {
        n = row.product_id;
    } else if (isRecord(row.product_id) && typeof row.product_id.product_id === "number") {
        n = row.product_id.product_id;
    }
    if (n !== null && Number.isFinite(n) && n > 0) return n;
    return null;
}

export async function getSupplierProductIds(supplierId: string): Promise<number[]> {
    const ids: number[] = [];
    let offset = 0;

    while (true) {
        const sp = new URLSearchParams();
        sp.set("limit", String(SUPPLIER_PAGE_SIZE));
        sp.set("offset", String(offset));
        sp.set("fields", "product_id,product_id.product_id");
        sp.set("filter[supplier_id][_eq]", supplierId);

        const url = `${mustBase()}/items/${PRODUCT_PER_SUPPLIER}?${sp.toString()}`;
        const res = await fetchDirectus<{ data?: DirectusSupplierProductRow[] }>(url, { headers: directusHeaders() });
        const rows = res.data ?? [];

        for (const row of rows) {
            const n = parseSupplierProductId(row);
            if (n !== null) ids.push(n);
        }

        if (rows.length < SUPPLIER_PAGE_SIZE) break;
        offset += SUPPLIER_PAGE_SIZE;
    }

    return Array.from(new Set(ids));
}

export async function getSupplierScopedProductIds(supplierId: string): Promise<number[]> {
    const directIds = await getSupplierProductIds(supplierId);
    if (!directIds.length) return [];

    const childIds = await getChildProductIdsForParents(directIds);
    return Array.from(new Set([...directIds, ...childIds]));
}

export function appendProductIdInFilter(
    params: URLSearchParams,
    andIdx: number,
    productIds: number[],
): number {
    if (!productIds.length) return andIdx;

    const idChunks = chunk(productIds, PRODUCT_ID_CHUNK_SIZE);
    if (idChunks.length === 1) {
        params.set(`filter[_and][${andIdx}][product_id][_in]`, idChunks[0].join(","));
        return andIdx + 1;
    }

    for (let i = 0; i < idChunks.length; i++) {
        params.set(
            `filter[_and][${andIdx}][_or][${i}][product_id][_in]`,
            idChunks[i].join(","),
        );
    }

    return andIdx + 1;
}

export async function getBatchHeaderIdsForProducts(productIds: number[]): Promise<number[]> {
    if (productIds.length === 0) return [];

    const batches = chunk(productIds, PRODUCT_ID_CHUNK_SIZE);
    const results = await Promise.all(
        batches.map(async (batch) => {
            const sp = new URLSearchParams();
            sp.set("limit", "500");
            sp.set("fields", "header_id");
            sp.set("filter[product_id][_in]", batch.join(","));

            const url = `${mustBase()}/items/${DETAILS}?${sp.toString()}`;
            const res = await fetchDirectus<{ data?: DirectusBatchLineRow[] }>(url, { headers: directusHeaders() });
            return res.data ?? [];
        }),
    );

    const ids: number[] = [];
    for (const rows of results) {
        for (const row of rows) {
            const n = Number(row.header_id);
            if (Number.isFinite(n) && n > 0) {
                ids.push(n);
            }
        }
    }
    return Array.from(new Set(ids));
}

export async function resolveBatchSupplierFilter(supplierId: string): Promise<{
    headerIdsFromProducts: number[];
}> {
    const productIds = await getSupplierScopedProductIds(supplierId);
    const headerIdsFromProducts =
        productIds.length > 0 ? await getBatchHeaderIdsForProducts(productIds) : [];
    return { headerIdsFromProducts };
}

export function appendBatchSupplierFilter(
    params: URLSearchParams,
    andIdx: number,
    supplierId: string,
    headerIdsFromProducts: number[],
): number {
    if (!supplierId) return andIdx;

    if (headerIdsFromProducts.length === 0) {
        params.set(`filter[_and][${andIdx}][supplier_id][_eq]`, supplierId);
        return andIdx + 1;
    }

    const headerChunks = chunk(headerIdsFromProducts, PRODUCT_ID_CHUNK_SIZE);
    params.set(`filter[_and][${andIdx}][_or][0][supplier_id][_eq]`, supplierId);

    if (headerChunks.length === 1) {
        params.set(`filter[_and][${andIdx}][_or][1][header_id][_in]`, headerChunks[0].join(","));
        return andIdx + 1;
    }

    for (let i = 0; i < headerChunks.length; i++) {
        params.set(
            `filter[_and][${andIdx}][_or][${i + 1}][header_id][_in]`,
            headerChunks[i].join(","),
        );
    }

    return andIdx + 1;
}

function normSupplierParam(value: string | null): string {
    const text = String(value ?? "").trim();
    if (!text || text === "undefined" || text === "null") return "";
    return text;
}

export function resolveSupplierIds(searchParams: URLSearchParams): string[] {
    const multi = normSupplierParam(searchParams.get("supplier_ids"));
    if (multi) {
        return multi
            .split(",")
            .map((part) => part.trim())
            .filter((part) => /^\d+$/.test(part));
    }

    const single = normSupplierParam(searchParams.get("supplier_id"));
    return single ? [single] : [];
}

export async function getSupplierScopedProductIdsForSuppliers(supplierIds: string[]): Promise<number[]> {
    if (!supplierIds.length) return [];

    const directIds = await getSupplierProductIdsForSuppliers(supplierIds);
    if (!directIds.length) return [];

    const childIds = await getChildProductIdsForParents(directIds);
    return Array.from(new Set([...directIds, ...childIds]));
}

export async function resolveBatchSuppliersFilter(supplierIds: string[]): Promise<{
    headerIdsFromProducts: number[];
}> {
    const productIds = await getSupplierScopedProductIdsForSuppliers(supplierIds);
    const headerIdsFromProducts =
        productIds.length > 0 ? await getBatchHeaderIdsForProducts(productIds) : [];
    return { headerIdsFromProducts };
}

export function appendBatchSuppliersFilter(
    params: URLSearchParams,
    andIdx: number,
    supplierIds: string[],
    headerIdsFromProducts: number[],
): number {
    if (!supplierIds.length) return andIdx;

    if (supplierIds.length === 1 && headerIdsFromProducts.length === 0) {
        params.set(`filter[_and][${andIdx}][supplier_id][_eq]`, supplierIds[0]);
        return andIdx + 1;
    }

    let orIdx = 0;
    for (const supplierId of supplierIds) {
        params.set(`filter[_and][${andIdx}][_or][${orIdx}][supplier_id][_eq]`, supplierId);
        orIdx += 1;
    }

    if (headerIdsFromProducts.length > 0) {
        const headerChunks = chunk(headerIdsFromProducts, PRODUCT_ID_CHUNK_SIZE);
        for (const headerChunk of headerChunks) {
            params.set(
                `filter[_and][${andIdx}][_or][${orIdx}][header_id][_in]`,
                headerChunk.join(","),
            );
            orIdx += 1;
        }
    }

    return andIdx + 1;
}

export const CHUNK_SIZE = 200;
export const WRITE_CONCURRENCY = 5;

export { chunk };

/**
 * Append a chunked _or filter for a given field and ID list.
 * Handles cases where the ID list exceeds the chunk size by splitting into
 * multiple _or branches.
 */
export function appendChunkedInFilter(
    params: URLSearchParams,
    andIdx: number,
    field: string,
    ids: number[],
    chunkSize = CHUNK_SIZE,
): number {
    if (ids.length === 0) return andIdx;

    if (ids.length <= chunkSize) {
        params.set(`filter[_and][${andIdx}][${field}][_in]`, ids.join(","));
        return andIdx + 1;
    }

    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const orIdx = Math.floor(i / chunkSize);
        params.set(`filter[_and][${andIdx}][_or][${orIdx}][${field}][_in]`, chunk.join(","));
    }
    return andIdx + 1;
}

/**
 * Run an async operation on each item with a fixed concurrency limit.
 */
export async function batchAsyncOps<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    concurrency = WRITE_CONCURRENCY,
): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
    }
    return results;
}
