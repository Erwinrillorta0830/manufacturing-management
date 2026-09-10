import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { LotTransferError, MM_LOT_CANONICAL_REFERENCE_CODE } from "./_errors";

export type RecordValue = Record<string, unknown>;
export const MM_LOT_COLLECTION = "mm_lots";
export const MM_INVENTORY_LOT_COLLECTION = "mm_inventory_lots";

function isRecord(value: unknown): value is RecordValue {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value).trim();
}

function nullableString(value: unknown): string | null {
    const result = stringValue(value);
    return result || null;
}

function errorMessage(payload: unknown, fallback: string): string {
    if (!isRecord(payload)) return fallback;
    const errors = payload.errors;
    if (Array.isArray(errors)) {
        const first = errors.find(isRecord);
        const message = first ? nullableString(first.message) : null;
        if (message) return message;
    }
    return nullableString(payload.message) || nullableString(payload.error) || fallback;
}

function mapUpstreamStatus(status: number): number {
    if (status === 404) return 404;
    if (status === 409) return 409;
    if (status === 400) return 400;
    if (status === 403 || status === 401) return 503;
    return 502;
}

export async function directusRequest(path: string, init: RequestInit = {}, action: string): Promise<unknown> {
    if (!DIRECTUS_URL) throw new LotTransferError(503, "Manufacturing Directus is not configured.");

    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${path}`, {
            ...init,
            headers: {
                ...headers,
                ...(init.headers || {})
            },
            cache: "no-store"
        });
    } catch (error) {
        throw new LotTransferError(503, `${action} could not reach Directus.`, {
            cause: error instanceof Error ? error.message : String(error)
        });
    }

    const text = await response.text().catch(() => "");
    let payload: unknown = {};
    try {
        payload = text ? JSON.parse(text) : {};
    } catch {
        payload = { message: text };
    }

    if (!response.ok) {
        throw new LotTransferError(
            mapUpstreamStatus(response.status),
            `${action} failed: ${errorMessage(payload, `Directus returned ${response.status}`)}`,
            { upstreamStatus: response.status }
        );
    }
    return payload;
}

export async function directusRows(path: string, action: string): Promise<RecordValue[]> {
    const payload = await directusRequest(path, {}, action);
    if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
    return payload.data.filter(isRecord);
}

export async function directusItem(path: string, action: string): Promise<RecordValue> {
    const payload = await directusRequest(path, {}, action);
    if (!isRecord(payload) || !isRecord(payload.data)) {
        throw new LotTransferError(502, `${action} returned an invalid Directus response.`);
    }
    return payload.data;
}

export async function mutateDirectus(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: unknown,
    action: string
): Promise<RecordValue | null> {
    const payload = await directusRequest(path, {
        method,
        body: method === "DELETE" ? undefined : JSON.stringify(body)
    }, action);
    if (!isRecord(payload) || payload.data === undefined || payload.data === null) return null;
    return isRecord(payload.data) ? payload.data : null;
}

export async function updateDirectusItems(
    path: string,
    query: RecordValue,
    data: RecordValue,
    action: string
): Promise<RecordValue[]> {
    const payload = await directusRequest(path, {
        method: "PATCH",
        body: JSON.stringify({ data, query })
    }, action);
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new LotTransferError(502, `${action} returned an invalid Directus update response.`);
    }
    return payload.data.filter(isRecord);
}

export async function readById(collections: string[], id: number, action: string): Promise<RecordValue> {
    for (const collection of collections) {
        try {
            return await directusItem(`/items/${collection}/${encodeURIComponent(String(id))}?fields=*`, action);
        } catch (error) {
            if (error instanceof LotTransferError && error.statusCode === 404) continue;
            throw error;
        }
    }
    throw new LotTransferError(404, `${action} was not found.`);
}

function canonicalReferenceError(action: string, collection: string, id: number): LotTransferError {
    return new LotTransferError(
        409,
        `${action} must reference a canonical Manufacturing Management record.`,
        { code: MM_LOT_CANONICAL_REFERENCE_CODE, collection, id }
    );
}

export async function readMmLot(id: number, action: string): Promise<RecordValue> {
    const params = new URLSearchParams({
        "filter[lot_id][_eq]": String(id),
        limit: "1",
        fields: "*"
    });
    const rows = await directusRows(`/items/${MM_LOT_COLLECTION}?${params.toString()}`, action);
    if (rows[0]) return rows[0];
    throw canonicalReferenceError(action, MM_LOT_COLLECTION, id);
}

export interface InventoryLotLookup {
    row: RecordValue;
    collection: string;
}

export async function readOptionalInventoryLot(id: number | null | undefined, action: string): Promise<InventoryLotLookup | null> {
    if (!id || id <= 0) return null;
    return readInventoryLot(id, action);
}

export async function readInventoryLot(id: number, action: string): Promise<InventoryLotLookup> {
    const queryPaths = [
        `/items/${MM_INVENTORY_LOT_COLLECTION}?filter[inventory_lot_id][_eq]=${id}&limit=1&fields=*`,
        `/items/${MM_INVENTORY_LOT_COLLECTION}?filter[id][_eq]=${id}&limit=1&fields=*`
    ];

    let lastError: unknown = null;
    for (const path of queryPaths) {
        try {
            const rows = await directusRows(path, action);
            if (rows[0]) return { row: rows[0], collection: MM_INVENTORY_LOT_COLLECTION };
        } catch (error) {
            lastError = error;
            if (!(error instanceof LotTransferError) || ![400, 404].includes(error.statusCode)) throw error;
        }
    }
    if (lastError instanceof LotTransferError && lastError.statusCode === 503) throw lastError;
    throw canonicalReferenceError(action, MM_INVENTORY_LOT_COLLECTION, id);
}

export async function readProduct(id: number): Promise<RecordValue> {
    const expandedPath = `/items/products/${encodeURIComponent(String(id))}?fields=*,allergens.*,product_allergens.*`;
    try {
        return await directusItem(expandedPath, "Product lookup");
    } catch (error) {
        if (!(error instanceof LotTransferError) || error.statusCode !== 400) throw error;
        return directusItem(`/items/products/${encodeURIComponent(String(id))}?fields=*`, "Product lookup");
    }
}
