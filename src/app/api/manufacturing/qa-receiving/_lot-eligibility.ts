import { unitId, type MmLotRecord } from "../services/mm-lots.service";
import { inspectLotCapacity, type LotCapacityStatus } from "./_lot-capacity";

export interface LotProductScope {
    productTypeId: number;
    productFamilyIds?: number[];
    uomId: number;
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
    if (unitId(lot.unit_id) !== product.uomId) return false;

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
        const reason = unitId(lot.unit_id) === product.uomId ? "PRODUCT_SCOPE" : "UOM";
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
