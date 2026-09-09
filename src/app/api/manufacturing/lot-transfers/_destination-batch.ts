import type { LotTransferRecord } from "./_types";

export type DestinationBatchResolutionAction = "MERGE" | "CREATE";
export type DestinationBatchRecord = Record<string, unknown>;
export type ReadDestinationBatchRows = (path: string, action: string) => Promise<DestinationBatchRecord[]>;

export interface DestinationBatchResolution {
    action: DestinationBatchResolutionAction;
    valid: boolean;
    inventoryLotId: number | null;
    lotId: number;
    productId: number;
    batchNo: string;
    manufacturingDate: string | null;
    expiryDate: string | null;
    qaStatus: string;
    unitCost: number | null;
    message: string;
}

export interface DestinationBatchContext {
    sourceInventoryLot: DestinationBatchRecord;
    targetInventoryLot: DestinationBatchRecord;
    targetInventoryLotCandidates: DestinationBatchRecord[];
    providedTargetInventoryLot: DestinationBatchRecord | null;
}

type DestinationBatchRecordInput = Pick<
    LotTransferRecord,
    "targetBatchNo" | "sourceBatchNo" | "sourceLotId" | "targetLotId" | "productId" | "targetInventoryLotId"
>;

const MM_INVENTORY_LOT_COLLECTION = "mm_inventory_lots";

function isRecord(value: unknown): value is DestinationBatchRecord {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numeric(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function firstValue(row: DestinationBatchRecord, keys: string[]): unknown {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    }
    return undefined;
}

function relationId(value: unknown, preferredKeys: string[] = []): number {
    if (typeof value === "number" || typeof value === "string") return numeric(value);
    if (!isRecord(value)) return 0;
    for (const key of [...preferredKeys, "id"]) {
        const candidate = numeric(value[key]);
        if (candidate > 0) return candidate;
    }
    return 0;
}

function inventoryLotId(row: DestinationBatchRecord): number {
    return relationId(firstValue(row, ["inventory_lot_id", "id"]), ["inventory_lot_id", "id"]);
}

function lotId(row: DestinationBatchRecord): number {
    return relationId(row.lot_id, ["lot_id"]);
}

function productId(row: DestinationBatchRecord): number {
    return relationId(row.product_id, ["product_id"]);
}

function stringValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value).trim();
}

function nullableNumeric(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value: unknown): string {
    return stringValue(value).toUpperCase().replace(/[_-]+/g, " ");
}

function normalizedBatch(value: unknown): string {
    return stringValue(value).toLowerCase();
}

function dateValue(row: DestinationBatchRecord, keys: string[]): string | null {
    const value = stringValue(firstValue(row, keys));
    return value || null;
}

function dateOnly(value: string | null): string | null {
    if (!value) return null;
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function sameTraceabilityDate(left: string | null, right: string | null): boolean {
    return dateOnly(left) === dateOnly(right);
}

export async function readDestinationBatchCandidates(input: {
    lotId: number;
    productId: number;
    batchNo: string;
    readRows: ReadDestinationBatchRows;
}): Promise<DestinationBatchRecord[]> {
    const encodedBatch = encodeURIComponent(input.batchNo.trim());
    const paths = [
        `/items/${MM_INVENTORY_LOT_COLLECTION}?filter[lot_id][_eq]=${input.lotId}&filter[product_id][_eq]=${input.productId}&filter[batch_no][_eq]=${encodedBatch}&fields=*&limit=-1`,
        `/items/${MM_INVENTORY_LOT_COLLECTION}?filter[lot_id][_eq]=${input.lotId}&filter[product_id][_eq]=${input.productId}&filter[batch_no][_icontains]=${encodedBatch}&fields=*&limit=-1`
    ];
    let lastError: unknown = null;
    for (const path of paths) {
        try {
            const rows = await input.readRows(path, "Destination inventory-lot batch lookup");
            const exactRows = rows.filter((row) => normalizedBatch(row.batch_no) === normalizedBatch(input.batchNo));
            if (exactRows.length > 0 || path === paths[paths.length - 1]) return exactRows;
        } catch (error) {
            lastError = error;
            const statusCode = error instanceof Error && typeof error === "object" && "statusCode" in error
                ? Number((error as Error & { statusCode?: number }).statusCode)
                : 0;
            if (![400, 404].includes(statusCode)) {
                throw error;
            }
        }
    }
    if (lastError instanceof Error && typeof lastError === "object" && "statusCode" in lastError
        && Number((lastError as Error & { statusCode?: number }).statusCode) === 503) {
        throw lastError;
    }
    return [];
}

export function resolveDestinationBatch(
    record: DestinationBatchRecordInput,
    context: DestinationBatchContext
): DestinationBatchResolution {
    const batchNo = record.targetBatchNo.trim() || record.sourceBatchNo.trim();
    const sourceManufacturingDate = dateValue(context.sourceInventoryLot, ["manufacturing_date", "manufacturingDate"]);
    const sourceExpiryDate = dateValue(context.sourceInventoryLot, ["expiry_date", "expiration_date", "expiryDate"]);
    const sourceQaStatus = stringValue(context.sourceInventoryLot.qa_status) || "GOOD";
    const sourceUnitCost = nullableNumeric(firstValue(context.sourceInventoryLot, ["unit_cost", "cost_per_unit", "final_landed_unit_cost"]));
    const basicCandidate = context.targetInventoryLotCandidates[0]
        || (inventoryLotId(context.providedTargetInventoryLot || {}) > 0 && context.targetInventoryLot);
    const candidateId = basicCandidate ? inventoryLotId(basicCandidate) : null;
    const candidateBatchNo = basicCandidate ? stringValue(basicCandidate.batch_no) : "";
    const candidateMatchesKey = Boolean(basicCandidate)
        && lotId(basicCandidate) === record.targetLotId
        && productId(basicCandidate) === record.productId
        && normalizedBatch(candidateBatchNo) === normalizedBatch(batchNo);
    const providedId = inventoryLotId(context.providedTargetInventoryLot || {});
    const idMatchesCandidate = !providedId || (candidateId !== null && providedId === candidateId);
    const action: DestinationBatchResolutionAction = candidateMatchesKey ? "MERGE" : "CREATE";

    if (context.targetInventoryLotCandidates.length > 1) {
        return {
            action: "MERGE",
            inventoryLotId: candidateId,
            lotId: record.targetLotId,
            productId: record.productId,
            batchNo,
            manufacturingDate: sourceManufacturingDate,
            expiryDate: sourceExpiryDate,
            qaStatus: sourceQaStatus,
            unitCost: sourceUnitCost,
            valid: false,
            message: "Multiple destination batch records share the same canonical key. Reconcile them before posting."
        };
    }

    if (providedId && (!candidateMatchesKey || !idMatchesCandidate)) {
        return {
            action,
            inventoryLotId: candidateMatchesKey ? candidateId : null,
            lotId: record.targetLotId,
            productId: record.productId,
            batchNo,
            manufacturingDate: sourceManufacturingDate,
            expiryDate: sourceExpiryDate,
            qaStatus: sourceQaStatus,
            unitCost: sourceUnitCost,
            valid: false,
            message: "The stored destination inventory-lot reference is stale or does not match the resolved batch."
        };
    }

    if (!candidateMatchesKey) {
        return {
            action: "CREATE",
            inventoryLotId: null,
            lotId: record.targetLotId,
            productId: record.productId,
            batchNo,
            manufacturingDate: sourceManufacturingDate,
            expiryDate: sourceExpiryDate,
            qaStatus: sourceQaStatus,
            unitCost: sourceUnitCost,
            valid: true,
            message: "No compatible destination batch exists. A new batch will be created only when the transfer is posted."
        };
    }

    const candidateManufacturingDate = dateValue(basicCandidate, ["manufacturing_date", "manufacturingDate"]);
    const candidateExpiryDate = dateValue(basicCandidate, ["expiry_date", "expiration_date", "expiryDate"]);
    const candidateQaStatus = stringValue(basicCandidate.qa_status) || "GOOD";
    const active = normalizeStatus(basicCandidate.status) === "ACTIVE";
    const traceabilityMatches = sameTraceabilityDate(candidateManufacturingDate, sourceManufacturingDate)
        && sameTraceabilityDate(candidateExpiryDate, sourceExpiryDate)
        && normalizeStatus(candidateQaStatus) === normalizeStatus(sourceQaStatus);
    const message = !active
        ? "The matching destination batch is not active. Reactivate or reconcile it before posting."
        : !traceabilityMatches
            ? "A destination batch has the same lot, product, and batch number but conflicting traceability data. Choose a distinct batch identity or reconcile the existing record."
            : "A compatible destination batch was found. The posted quantity will be merged into that batch.";
    return {
        action: "MERGE",
        inventoryLotId: candidateId,
        lotId: record.targetLotId,
        productId: record.productId,
        batchNo,
        manufacturingDate: sourceManufacturingDate,
        expiryDate: sourceExpiryDate,
        qaStatus: sourceQaStatus,
        unitCost: nullableNumeric(firstValue(basicCandidate, ["unit_cost", "cost_per_unit", "final_landed_unit_cost"])) ?? sourceUnitCost,
        valid: active && traceabilityMatches,
        message
    };
}
