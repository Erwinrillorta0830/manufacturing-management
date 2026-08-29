import { procurementDirectusFetch } from "../procurement/_directus";

export const MM_LOT_COLLECTION = "mm_lots";
export const MM_LOT_LEGACY_MAP_COLLECTION = "mm_lot_legacy_lot_map";

export class MmLotCompatibilityError extends Error {
    constructor(message: string, readonly status = 503) {
        super(message);
    }
}

export interface MmLotRecord {
    lot_id: number;
    lot_name?: string | null;
    branch_id?: number | Record<string, unknown> | null;
    unit_id?: number | Record<string, unknown> | null;
    max_batch_capacity?: number | string | null;
    status?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    [key: string]: unknown;
}

export interface MmLotLegacyMapping {
    id?: number;
    branch_id: number;
    mm_lot_id: number;
    legacy_lot_id: number;
    created_by?: number | null;
    created_at?: string | null;
    updated_at?: string | null;
}

function relationId(value: unknown, keys: string[]): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const nested = relationId(record[key], keys);
            if (nested !== null) return nested;
        }
        return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function mmLotId(value: unknown): number | null {
    return relationId(value, ["lot_id", "id"]);
}

export function legacyLotId(value: unknown): number | null {
    return relationId(value, ["lot_id", "id"]);
}

export function branchId(value: unknown): number | null {
    return relationId(value, ["branch_id", "id"]);
}

export function unitId(value: unknown): number | null {
    return relationId(value, ["unit_id", "id"]);
}

export function movementMmLotId(row: Record<string, unknown>): number | null {
    return mmLotId(row.mm_lot_id);
}

export function movementLegacyLotId(row: Record<string, unknown>): number | null {
    return legacyLotId(row.lot_id);
}

export function canonicalMovementLotId(row: Record<string, unknown>): number | null {
    return movementMmLotId(row) || movementLegacyLotId(row);
}

function responseRows(body: unknown): Record<string, unknown>[] {
    return body && typeof body === "object" && "data" in body && Array.isArray(body.data)
        ? body.data as Record<string, unknown>[]
        : [];
}

async function readRows(path: string, message: string): Promise<Record<string, unknown>[]> {
    const response = await procurementDirectusFetch(path);
    if (!response.ok) throw new MmLotCompatibilityError(`${message} (${response.status}).`, 503);
    return responseRows(await response.json());
}

export async function loadMmLots(options: {
    ids?: number[];
    branchId?: number;
    onlyActive?: boolean;
} = {}): Promise<MmLotRecord[]> {
    const params = new URLSearchParams({
        fields: "*",
        limit: "-1",
        sort: "lot_name"
    });
    const ids = [...new Set((options.ids || []).filter(id => Number.isSafeInteger(id) && id > 0))];
    if (ids.length > 0) params.set("filter[lot_id][_in]", ids.join(","));
    if (options.branchId !== undefined) params.set("filter[branch_id][_eq]", String(options.branchId));
    if (options.onlyActive !== false) params.set("filter[status][_eq]", "ACTIVE");
    return await readRows(
        `/items/${MM_LOT_COLLECTION}?${params.toString()}`,
        "Unable to load Manufacturing Management storage lots"
    ) as MmLotRecord[];
}

export async function loadLegacyLots(ids: number[]): Promise<Record<string, unknown>[]> {
    const normalizedIds = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
    if (normalizedIds.length === 0) return [];
    const params = new URLSearchParams({
        "filter[lot_id][_in]": normalizedIds.join(","),
        fields: "*",
        limit: "-1"
    });
    return readRows(`/items/lots?${params.toString()}`, "Unable to load legacy storage lots");
}

export async function loadMmLotMappings(mmLotIds: number[], requestedBranchId?: number): Promise<MmLotLegacyMapping[]> {
    const normalizedIds = [...new Set(mmLotIds.filter(id => Number.isSafeInteger(id) && id > 0))];
    if (normalizedIds.length === 0) return [];
    const params = new URLSearchParams({
        "filter[mm_lot_id][_in]": normalizedIds.join(","),
        fields: "id,branch_id,mm_lot_id,legacy_lot_id,created_by,created_at,updated_at",
        limit: "-1"
    });
    if (requestedBranchId !== undefined) params.set("filter[branch_id][_eq]", String(requestedBranchId));
    const rows = await readRows(
        `/items/${MM_LOT_LEGACY_MAP_COLLECTION}?${params.toString()}`,
        "Unable to load the approved Manufacturing Management lot mappings"
    );
    return rows.flatMap(row => {
        const mappedBranchId = branchId(row.branch_id);
        const mappedMmLotId = mmLotId(row.mm_lot_id);
        const mappedLegacyLotId = legacyLotId(row.legacy_lot_id);
        return mappedBranchId && mappedMmLotId && mappedLegacyLotId
            ? [{
                id: relationId(row.id, ["id"] ) || undefined,
                branch_id: mappedBranchId,
                mm_lot_id: mappedMmLotId,
                legacy_lot_id: mappedLegacyLotId,
                created_by: relationId(row.created_by, ["user_id", "id"]),
                created_at: row.created_at ? String(row.created_at) : null,
                updated_at: row.updated_at ? String(row.updated_at) : null
            }]
            : [];
    });
}

export function resolveMmLotMappings(
    mmLots: MmLotRecord[],
    mappings: MmLotLegacyMapping[],
    branchId: number
): Map<number, MmLotLegacyMapping> {
    const mappingByMmLot = new Map<number, MmLotLegacyMapping>();
    const mappingByLegacyLot = new Map<number, MmLotLegacyMapping>();
    for (const mapping of mappings) {
        if (mapping.branch_id !== branchId) continue;
        const existingMm = mappingByMmLot.get(mapping.mm_lot_id);
        const existingLegacy = mappingByLegacyLot.get(mapping.legacy_lot_id);
        if ((existingMm && existingMm.legacy_lot_id !== mapping.legacy_lot_id)
            || (existingLegacy && existingLegacy.mm_lot_id !== mapping.mm_lot_id)) {
            throw new MmLotCompatibilityError("The approved MM-lot mapping is ambiguous; reconciliation is required.", 409);
        }
        mappingByMmLot.set(mapping.mm_lot_id, mapping);
        mappingByLegacyLot.set(mapping.legacy_lot_id, mapping);
    }
    const missing = mmLots
        .map(lot => lot.lot_id)
        .filter(id => !mappingByMmLot.has(id));
    if (missing.length > 0) {
        throw new MmLotCompatibilityError(
            `Storage lot mapping is not configured for MM lot(s): ${missing.join(", ")}.`,
            409
        );
    }
    return mappingByMmLot;
}

export function legacyToMmLotMap(mappings: Iterable<MmLotLegacyMapping>): Map<number, number> {
    return new Map([...mappings].map(mapping => [mapping.legacy_lot_id, mapping.mm_lot_id]));
}

export async function loadMovementRowsForLotRefs(
    mmLotIds: number[],
    legacyLotIds: number[],
    fields = "movement_id,product_id,mm_lot_id,lot_id,branch_id,transaction_type_id,source_document_id,source_document_no,batch_no,quantity,manufacturing_date,expiry_date,version_id,is_capacity_override,capacity_available_before_receipt,capacity_override_quantity,created_at"
): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    const read = async (filter: string) => {
        const params = new URLSearchParams({
            [filter.startsWith("mm") ? "filter[mm_lot_id][_in]" : "filter[lot_id][_in]"]: filter.slice(filter.indexOf(":") + 1),
            fields,
            limit: "-1"
        });
        return readRows(`/items/inventory_movements?${params.toString()}`, "Unable to load inventory movements");
    };
    if (mmLotIds.length > 0) rows.push(...await read(`mm:${[...new Set(mmLotIds)].join(",")}`));
    if (legacyLotIds.length > 0) rows.push(...await read(`legacy:${[...new Set(legacyLotIds)].join(",")}`));
    const seen = new Set<string>();
    return rows.filter(row => {
        const id = relationId(row.movement_id, ["movement_id", "id"]);
        const key = id ? `id:${id}` : JSON.stringify([canonicalMovementLotId(row), row.source_document_id, row.batch_no, row.quantity]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
