import type { MaterialCandidateLot } from "../types";

export interface PreferredTopUpLot {
    mmLotId?: number | null;
    inventoryLotId?: number | null;
    batchNo?: string | null;
}

export interface PlannedTopUpAllocation {
    lot: MaterialCandidateLot;
    quantity: number;
}

function normalized(value: unknown): string {
    return String(value ?? "").trim().toUpperCase();
}

function round6(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 1_000_000) / 1_000_000;
}

function expiryTime(value: string | null | undefined): number | null {
    const expiry = String(value ?? "").trim();
    if (!expiry) return null;
    const parsed = Date.parse(expiry);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function isEligibleRawMaterialTopUpLot(
    lot: MaterialCandidateLot,
    now = new Date()
): boolean {
    if (normalized(lot.status) !== "ACTIVE" || normalized(lot.qa_status) !== "GOOD") return false;
    if (!Number.isFinite(Number(lot.available)) || Number(lot.available) <= 0) return false;

    const expiry = expiryTime(lot.expiry_date);
    if (Number.isNaN(expiry)) return false;
    if (expiry === null) return true;

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return expiry >= today.getTime();
}

function matchesPreferredLot(lot: MaterialCandidateLot, preferred?: PreferredTopUpLot): boolean {
    if (!preferred) return false;
    const batchNo = String(preferred.batchNo ?? "").trim();
    const hasCanonicalId = Number(preferred.mmLotId || 0) > 0 || Number(preferred.inventoryLotId || 0) > 0;
    if (Number(preferred.mmLotId || 0) > 0 && Number(lot.mm_lot_id || 0) !== Number(preferred.mmLotId)) return false;
    if (Number(preferred.inventoryLotId || 0) > 0 && Number(lot.inventory_lot_id || 0) !== Number(preferred.inventoryLotId)) return false;
    if (batchNo && normalized(lot.lot_no) !== normalized(batchNo)) return false;
    return hasCanonicalId || Boolean(batchNo);
}

function compareFefo(left: MaterialCandidateLot, right: MaterialCandidateLot): number {
    const leftExpiryValue = expiryTime(left.expiry_date);
    const rightExpiryValue = expiryTime(right.expiry_date);
    const leftExpiry = leftExpiryValue === null || Number.isNaN(leftExpiryValue) ? Number.MAX_SAFE_INTEGER : leftExpiryValue;
    const rightExpiry = rightExpiryValue === null || Number.isNaN(rightExpiryValue) ? Number.MAX_SAFE_INTEGER : rightExpiryValue;
    if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;

    const leftManufacturingValue = expiryTime(left.manufacturing_date);
    const rightManufacturingValue = expiryTime(right.manufacturing_date);
    const leftManufacturing = leftManufacturingValue === null || Number.isNaN(leftManufacturingValue) ? Number.MAX_SAFE_INTEGER : leftManufacturingValue;
    const rightManufacturing = rightManufacturingValue === null || Number.isNaN(rightManufacturingValue) ? Number.MAX_SAFE_INTEGER : rightManufacturingValue;
    if (leftManufacturing !== rightManufacturing) return leftManufacturing - rightManufacturing;

    return Number(left.inventory_lot_id || left.mm_lot_id || 0)
        - Number(right.inventory_lot_id || right.mm_lot_id || 0);
}

export function orderTopUpCandidates(
    lots: MaterialCandidateLot[],
    preferred?: PreferredTopUpLot
): MaterialCandidateLot[] {
    return [...lots].sort((left, right) => {
        const leftPreferred = matchesPreferredLot(left, preferred);
        const rightPreferred = matchesPreferredLot(right, preferred);
        if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
        return compareFefo(left, right);
    });
}

export function allocateTopUpQuantity(
    lots: MaterialCandidateLot[],
    requestedQuantity: number,
    preferred?: PreferredTopUpLot
): PlannedTopUpAllocation[] {
    let remaining = round6(Math.max(0, requestedQuantity));
    const allocations: PlannedTopUpAllocation[] = [];

    for (const lot of orderTopUpCandidates(lots, preferred)) {
        if (remaining <= 0) break;
        const available = round6(Math.max(0, Number(lot.available) || 0));
        const quantity = round6(Math.min(available, remaining));
        if (quantity <= 0) continue;
        allocations.push({ lot, quantity });
        remaining = round6(remaining - quantity);
    }

    return allocations;
}
