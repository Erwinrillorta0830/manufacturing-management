import { lotUnitId, type MmLotRecord } from "../services/mm-lots.service";
import { inspectLotCapacity, type LotCapacityStatus } from "./_lot-capacity";

export interface LotProductScope {
    productTypeId: number;
    productFamilyIds?: number[];
    uomId: number;
    productId?: number;
}

export interface StorageLotStoredProduct {
    productId: number;
    productTypeId: number | null;
}

// Mirrors the client-side resolveProductClassification mapping used by the
// Stock Adjustment lot allocation modal so server and UI agree on conflicts.
const CLASSIFIED_PRODUCT_TYPE_IDS: Record<number, "RM" | "PKG" | "FG"> = {
    389: "RM",
    390: "PKG",
    388: "FG"
};

const CLASSIFICATION_LABELS: Record<"RM" | "PKG" | "FG" | "OTHER", string> = {
    RM: "Raw Material",
    PKG: "Packaging",
    FG: "Finished Good",
    OTHER: "General Stock"
};

export function productTypeClassification(productTypeId: number | null): { code: "RM" | "PKG" | "FG" | "OTHER"; label: string } {
    const code = productTypeId === null ? null : CLASSIFIED_PRODUCT_TYPE_IDS[productTypeId] ?? null;
    return code ? { code, label: CLASSIFICATION_LABELS[code] } : { code: "OTHER", label: CLASSIFICATION_LABELS.OTHER };
}

/**
 * A storage lot may not hold products of different product types. Empty lots
 * (and lots whose stored stock has an unknown/general classification) accept
 * any product type.
 */
export function findStorageLotContentConflict(
    storedProducts: readonly StorageLotStoredProduct[],
    product: LotProductScope
): StorageLotStoredProduct | null {
    const target = productTypeClassification(product.productTypeId);
    if (target.code === "OTHER") return null;
    for (const stored of storedProducts) {
        if (product.productId && stored.productId === product.productId) continue;
        const storedClassification = productTypeClassification(stored.productTypeId);
        if (storedClassification.code === "OTHER" || storedClassification.code === target.code) continue;
        return stored;
    }
    return null;
}

export interface StorageLotEligibility {
    eligible: boolean;
    reason: "STATUS" | "UOM" | "PRODUCT_SCOPE" | "CAPACITY" | "FULL" | null;
    capacity: number | null;
    capacityStatus: LotCapacityStatus;
    occupiedQuantity: number;
    remainingCapacity: number | null;
}

function relationNumber(value: unknown, keys: string[]): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const nested = relationNumber(record[key], keys);
            if (nested !== null) return nested;
        }
        return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizedStatus(value: unknown): string | null {
    const status = String(value ?? "").trim().toUpperCase();
    return status || null;
}

function explicitProductTypeId(lot: MmLotRecord): number | null {
    return relationNumber(lot.product_type_id, ["product_type_id", "type_id", "id"])
        || relationNumber(lot.product_type, ["product_type_id", "type_id", "id"]);
}

function explicitProductFamilyId(lot: MmLotRecord): number | null {
    return relationNumber(lot.product_family_id, ["product_family_id", "family_id", "product_id", "id"])
        || relationNumber(lot.family_id, ["family_id", "product_family_id", "product_id", "id"])
        || relationNumber(lot.product_family, ["family_id", "product_family_id", "product_id", "id"]);
}

/**
 * Empty/Vacant is an occupancy state, not a reason to hide a lot. The
 * collection query already limits results to active lifecycle states, but
 * this guard keeps the rule explicit when a Directus row contains one of the
 * supported labels.
 */
export function isStorageLotStatusEligible(status: unknown): boolean {
    const normalized = normalizedStatus(status);
    return !normalized || ["ACTIVE", "EMPTY", "VACANT", "EMPTY / VACANT"].includes(normalized);
}

export function isStorageLotProductCompatible(lot: MmLotRecord, product: LotProductScope): boolean {
    if (lotUnitId(lot) !== product.uomId) return false;

    const lotProductTypeId = explicitProductTypeId(lot);
    if (lotProductTypeId !== null && lotProductTypeId !== product.productTypeId) return false;

    const lotProductFamilyId = explicitProductFamilyId(lot);
    if (lotProductFamilyId !== null
        && product.productFamilyIds
        && !product.productFamilyIds.includes(lotProductFamilyId)) return false;

    return true;
}

export function evaluateStorageLotEligibility(
    lot: MmLotRecord,
    product: LotProductScope,
    occupiedQuantity: number
): StorageLotEligibility {
    const inspectedCapacity = inspectLotCapacity(lot.max_batch_capacity);
    const normalizedOccupied = Math.max(0, Number(occupiedQuantity) || 0);
    const remainingCapacity = inspectedCapacity.capacity === null
        ? null
        : Math.max(0, inspectedCapacity.capacity - normalizedOccupied);

    if (!isStorageLotStatusEligible(lot.status)) {
        return {
            eligible: false,
            reason: "STATUS",
            capacity: inspectedCapacity.capacity,
            capacityStatus: inspectedCapacity.status,
            occupiedQuantity: normalizedOccupied,
            remainingCapacity
        };
    }
    if (!isStorageLotProductCompatible(lot, product)) {
        const reason = lotUnitId(lot) === product.uomId ? "PRODUCT_SCOPE" : "UOM";
        return {
            eligible: false,
            reason,
            capacity: inspectedCapacity.capacity,
            capacityStatus: inspectedCapacity.status,
            occupiedQuantity: normalizedOccupied,
            remainingCapacity
        };
    }
    if (inspectedCapacity.status === "INVALID") {
        return {
            eligible: false,
            reason: "CAPACITY",
            capacity: inspectedCapacity.capacity,
            capacityStatus: inspectedCapacity.status,
            occupiedQuantity: normalizedOccupied,
            remainingCapacity
        };
    }
    if (remainingCapacity !== null && remainingCapacity <= 0) {
        return {
            eligible: false,
            reason: "FULL",
            capacity: inspectedCapacity.capacity,
            capacityStatus: inspectedCapacity.status,
            occupiedQuantity: normalizedOccupied,
            remainingCapacity
        };
    }

    return {
        eligible: true,
        reason: null,
        capacity: inspectedCapacity.capacity,
        capacityStatus: inspectedCapacity.status,
        occupiedQuantity: normalizedOccupied,
        remainingCapacity
    };
}
