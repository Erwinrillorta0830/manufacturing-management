import { DIRECTUS_URL, headers } from "./core-api.service";

export const MM_LOT_COLLECTION = "mm_lots";
export const MM_INVENTORY_LOT_COLLECTION = "mm_inventory_lots";

export class MmLotError extends Error {
    constructor(
        message: string,
        readonly status = 503,
        readonly code = "MM_LOT_LOOKUP_FAILED"
    ) {
        super(message);
        this.name = "MmLotError";
    }
}

export interface MmLotRecord extends Record<string, unknown> {
    lot_id: number;
    lot_name?: string | null;
    branch_id?: number | Record<string, unknown> | null;
    unit_id?: number | Record<string, unknown> | null;
    max_batch_capacity?: number | string | null;
    status?: string | null;
}

export interface MmInventoryLotRecord extends Record<string, unknown> {
    inventory_lot_id: number;
    lot_id: number | Record<string, unknown>;
    branch_id: number | Record<string, unknown>;
    product_id: number | Record<string, unknown>;
    batch_no: string;
    manufacturing_date?: string | null;
    expiry_date?: string | null;
    unit_cost?: number | string | null;
    qa_status?: string | null;
    status?: string | null;
    created?: boolean;
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

export function mmInventoryLotId(value: unknown): number | null {
    return relationId(value, ["inventory_lot_id", "id"]);
}

export function unitId(value: unknown): number | null {
    return relationId(value, ["unit_id", "id"]);
}

export function movementMmLotId(row: Record<string, unknown>): number | null {
    return mmLotId(row.mm_lot_id);
}

/**
 * Legacy lot IDs are retained only for historical display and migration
 * reports. New manufacturing code must use movementMmLotId instead.
 */
export function historicalLotId(row: Record<string, unknown>): number | null {
    return relationId(row.lot_id, ["lot_id", "id"]);
}

function responseRows(body: unknown): Record<string, unknown>[] {
    return body && typeof body === "object" && "data" in body && Array.isArray(body.data)
        ? body.data as Record<string, unknown>[]
        : [];
}

async function readRows<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
    label: string
): Promise<T[]> {
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${path.startsWith("/") ? path : `/${path}`}`, {
            headers,
            cache: "no-store"
        });
    } catch {
        throw new MmLotError(`${label} could not be reached.`);
    }

    if (!response.ok) {
        throw new MmLotError(`${label} failed with HTTP ${response.status}.`, response.status >= 400 && response.status < 500 ? response.status : 503);
    }

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        throw new MmLotError(`${label} returned invalid JSON.`);
    }

    const rows = responseRows(payload);
    if (!Array.isArray(rows)) throw new MmLotError(`${label} returned an invalid collection.`);
    return rows as T[];
}

export async function resolveProductUnitId(productId: number): Promise<number> {
    if (!Number.isSafeInteger(productId) || productId <= 0) {
        throw new MmLotError("A valid product is required to resolve its UOM.", 400, "MM_LOT_INVALID");
    }
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}/items/products/${productId}?fields=product_id,unit_of_measurement.unit_id`, {
            headers,
            cache: "no-store"
        });
    } catch {
        throw new MmLotError("Product UOM lookup could not be reached.");
    }
    if (!response.ok) {
        throw new MmLotError(`Product UOM lookup failed with HTTP ${response.status}.`, response.status >= 400 && response.status < 500 ? response.status : 503);
    }
    const body = await response.json().catch(() => null) as { data?: Record<string, unknown> } | null;
    const resolved = unitId(body?.data?.unit_of_measurement);
    if (!resolved) throw new MmLotError(`Product ${productId} has no valid UOM.`, 409, "MM_LOT_INVALID");
    return resolved;
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
    return readRows<MmLotRecord>(`/items/${MM_LOT_COLLECTION}?${params.toString()}`, "Manufacturing Management lot lookup");
}

export async function loadMmInventoryLots(options: {
    ids?: number[];
    mmLotIds?: number[];
    productId?: number;
    branchId?: number;
    batchNo?: string;
    onlyActive?: boolean;
} = {}): Promise<MmInventoryLotRecord[]> {
    const params = new URLSearchParams({
        fields: "*",
        limit: "-1",
        sort: "expiry_date,batch_no"
    });
    const ids = [...new Set((options.ids || []).filter(id => Number.isSafeInteger(id) && id > 0))];
    const mmLotIds = [...new Set((options.mmLotIds || []).filter(id => Number.isSafeInteger(id) && id > 0))];
    if (ids.length > 0) params.set("filter[inventory_lot_id][_in]", ids.join(","));
    if (mmLotIds.length > 0) params.set("filter[lot_id][_in]", mmLotIds.join(","));
    if (options.productId !== undefined) params.set("filter[product_id][_eq]", String(options.productId));
    if (options.branchId !== undefined) params.set("filter[branch_id][_eq]", String(options.branchId));
    if (options.batchNo?.trim()) params.set("filter[batch_no][_eq]", options.batchNo.trim());
    if (options.onlyActive !== false) params.set("filter[status][_eq]", "ACTIVE");
    return readRows<MmInventoryLotRecord>(
        `/items/${MM_INVENTORY_LOT_COLLECTION}?${params.toString()}`,
        "Manufacturing Management inventory-lot lookup"
    );
}

export async function findMmLotByName(options: {
    lotName: string;
    branchId: number;
    unitId?: number;
    onlyActive?: boolean;
}): Promise<MmLotRecord | null> {
    const lots = await loadMmLots({
        branchId: options.branchId,
        onlyActive: options.onlyActive,
    });
    return lots.find(lot =>
        String(lot.lot_name || "").trim() === options.lotName.trim()
        && (options.unitId === undefined || unitId(lot.unit_id) === options.unitId)
    ) || null;
}

export async function createMmLot(payload: {
    lotName: string;
    branchId: number;
    unitId: number;
    maxBatchCapacity?: number;
    description?: string | null;
    status?: string;
    createdBy?: number | null;
}): Promise<MmLotRecord> {
    if (!payload.lotName.trim()) throw new MmLotError("A lot name is required.", 400, "MM_LOT_INVALID");
    if (!Number.isSafeInteger(payload.branchId) || payload.branchId <= 0) throw new MmLotError("A valid lot branch is required.", 400, "MM_LOT_INVALID");
    if (!Number.isSafeInteger(payload.unitId) || payload.unitId <= 0) throw new MmLotError("A valid lot UOM is required.", 400, "MM_LOT_INVALID");

    const response = await fetch(`${DIRECTUS_URL}/items/${MM_LOT_COLLECTION}`, {
        method: "POST",
        headers,
        cache: "no-store",
        body: JSON.stringify({
            lot_name: payload.lotName.trim(),
            branch_id: payload.branchId,
            unit_id: payload.unitId,
            max_batch_capacity: payload.maxBatchCapacity ?? 100000,
            description: payload.description ?? null,
            status: payload.status || "ACTIVE",
            ...(payload.createdBy ? { created_by: payload.createdBy } : {})
        })
    });
    if (!response.ok) {
        throw new MmLotError(`Manufacturing Management lot creation failed with HTTP ${response.status}.`, response.status >= 400 && response.status < 500 ? response.status : 503, "MM_LOT_WRITE_FAILED");
    }
    let payloadBody: unknown;
    try {
        payloadBody = await response.json();
    } catch {
        throw new MmLotError("Manufacturing Management lot creation returned invalid JSON.", 503, "MM_LOT_WRITE_FAILED");
    }
    const rowValue = (payloadBody as Record<string, unknown>)?.data;
    const row = rowValue && typeof rowValue === "object" && !Array.isArray(rowValue)
        ? rowValue as Record<string, unknown>
        : null;
    const lotId = mmLotId(row?.lot_id);
    if (!row || !lotId) throw new MmLotError("Manufacturing Management lot creation returned no valid lot ID.", 503, "MM_LOT_WRITE_FAILED");
    return { ...row, lot_id: lotId } as MmLotRecord;
}

export async function resolveOrCreateMmLot(payload: {
    lotName: string;
    branchId: number;
    unitId: number;
    maxBatchCapacity?: number;
    description?: string | null;
    createdBy?: number | null;
}): Promise<MmLotRecord> {
    const lots = await loadMmLots({ branchId: payload.branchId, onlyActive: false });
    const exact = lots.find(lot =>
        String(lot.lot_name || "").trim() === payload.lotName.trim()
        && unitId(lot.unit_id) === payload.unitId
    );
    if (exact) return exact;

    const sameNameExists = lots.some(lot => String(lot.lot_name || "").trim() === payload.lotName.trim());
    if (!sameNameExists) return createMmLot(payload);

    const suffix = `-UOM-${payload.unitId}`;
    const baseName = payload.lotName.trim().slice(0, Math.max(1, 100 - suffix.length));
    const collisionSafeName = `${baseName}${suffix}`;
    const collisionSafeLot = lots.find(lot =>
        String(lot.lot_name || "").trim() === collisionSafeName
        && unitId(lot.unit_id) === payload.unitId
    );
    return collisionSafeLot || createMmLot({ ...payload, lotName: collisionSafeName });
}

export async function loadMovementRowsForMmLots(
    mmLotIds: number[],
    fields = "movement_id,product_id,mm_lot_id,lot_id,branch_id,transaction_type_id,source_document_id,source_document_no,batch_no,quantity,manufacturing_date,expiry_date,version_id,is_capacity_override,capacity_available_before_receipt,capacity_override_quantity,created_at"
): Promise<Record<string, unknown>[]> {
    const normalizedIds = [...new Set(mmLotIds.filter(id => Number.isSafeInteger(id) && id > 0))];
    if (normalizedIds.length === 0) return [];
    return readRows(
        `/items/inventory_movements?filter[mm_lot_id][_in]=${normalizedIds.join(",")}&fields=${encodeURIComponent(fields)}&limit=-1`,
        "Manufacturing Management inventory movement lookup"
    );
}

export async function resolveOrCreateMmInventoryLot(payload: {
    mmLotId: number;
    branchId: number;
    productId: number;
    batchNo: string;
    manufacturingDate?: string | null;
    expiryDate?: string | null;
    unitCost?: number;
    qaStatus?: string;
    sourceType?: string | null;
    sourceReference?: string | null;
    remarks?: string | null;
    createdBy: number;
}): Promise<MmInventoryLotRecord> {
    const existing = await loadMmInventoryLots({
        mmLotIds: [payload.mmLotId],
        branchId: payload.branchId,
        productId: payload.productId,
        batchNo: payload.batchNo,
        onlyActive: true
    });
    if (existing.length > 0) return { ...existing[0], created: false };

    if (!Number.isSafeInteger(payload.mmLotId) || payload.mmLotId <= 0) {
        throw new MmLotError("A valid MM lot is required for inventory-lot creation.", 400, "MM_LOT_INVALID");
    }
    if (!Number.isSafeInteger(payload.branchId) || payload.branchId <= 0) {
        throw new MmLotError("A valid inventory branch is required for inventory-lot creation.", 400, "MM_LOT_INVALID");
    }
    if (!Number.isSafeInteger(payload.productId) || payload.productId <= 0) {
        throw new MmLotError("A valid product is required for inventory-lot creation.", 400, "MM_LOT_INVALID");
    }
    if (!payload.batchNo.trim()) {
        throw new MmLotError("A batch number is required for inventory-lot creation.", 400, "MM_LOT_INVALID");
    }
    if (!Number.isSafeInteger(payload.createdBy) || payload.createdBy <= 0) {
        throw new MmLotError("A valid creator is required for inventory-lot creation.", 400, "MM_LOT_INVALID");
    }

    const response = await fetch(`${DIRECTUS_URL}/items/${MM_INVENTORY_LOT_COLLECTION}`, {
        method: "POST",
        headers,
        cache: "no-store",
        body: JSON.stringify({
            lot_id: payload.mmLotId,
            branch_id: payload.branchId,
            product_id: payload.productId,
            batch_no: payload.batchNo.trim(),
            manufacturing_date: payload.manufacturingDate || null,
            expiry_date: payload.expiryDate || null,
            unit_cost: payload.unitCost ?? 0,
            qa_status: payload.qaStatus || "GOOD",
            status: "ACTIVE",
            source_type: payload.sourceType || "PURCHASE_RECEIVING_QA",
            source_reference: payload.sourceReference || null,
            remarks: payload.remarks || null,
            created_by: payload.createdBy
        })
    });
    if (!response.ok) {
        throw new MmLotError(
            `Manufacturing Management inventory-lot creation failed with HTTP ${response.status}.`,
            response.status >= 400 && response.status < 500 ? response.status : 503,
            "MM_INVENTORY_LOT_WRITE_FAILED"
        );
    }
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new MmLotError("Manufacturing Management inventory-lot creation returned invalid JSON.", 503, "MM_INVENTORY_LOT_WRITE_FAILED");
    }
    const rowValue = (body as Record<string, unknown>)?.data;
    const row = rowValue && typeof rowValue === "object" && !Array.isArray(rowValue)
        ? rowValue as Record<string, unknown>
        : null;
    const inventoryLotId = mmInventoryLotId(row?.inventory_lot_id);
    if (!row || !inventoryLotId) {
        throw new MmLotError("Manufacturing Management inventory-lot creation returned no valid inventory-lot ID.", 503, "MM_INVENTORY_LOT_WRITE_FAILED");
    }
    return { ...row, inventory_lot_id: inventoryLotId, lot_id: payload.mmLotId, created: true } as MmInventoryLotRecord;
}
