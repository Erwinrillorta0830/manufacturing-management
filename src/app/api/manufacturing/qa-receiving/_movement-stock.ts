import { canonicalMovementLotId, movementLegacyLotId, movementMmLotId } from "./_mm-lot-compat";

export function relationId(value: unknown, key: string): number {
    const raw = value && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
        : value;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function movementQuantity(value: unknown): number {
    const quantity = Number(value || 0);
    return Number.isFinite(quantity) ? quantity : 0;
}

export function movementLotId(row: Record<string, unknown>): number {
    return canonicalMovementLotId(row) || 0;
}

export function movementMmLotReference(row: Record<string, unknown>): number {
    return movementMmLotId(row) || 0;
}

export function movementLegacyLotReference(row: Record<string, unknown>): number {
    return movementLegacyLotId(row) || 0;
}

export function movementStockKey(row: Record<string, unknown>): string {
    const productId = relationId(row.product_id, "product_id");
    const branchId = relationId(row.branch_id, "id") || relationId(row.branch_id, "branch_id");
    const lotId = movementLotId(row);
    const batchNo = String(row.batch_no ?? row.lot_number ?? "LOT-N/A").trim() || "LOT-N/A";
    return `${productId}:${branchId}:${lotId}:${batchNo}`;
}

export function sumMovementQuantitiesByLot(rows: Record<string, unknown>[]): Map<number, number> {
    const quantities = new Map<number, number>();
    for (const row of rows) {
        const lotId = movementLotId(row);
        if (!lotId) continue;
        quantities.set(lotId, (quantities.get(lotId) || 0) + movementQuantity(row.quantity));
    }
    return quantities;
}

export function sumMovementQuantitiesByStorageLot(
    rows: Record<string, unknown>[],
    legacyToMmLot: Map<number, number> = new Map()
): Map<number, number> {
    const quantities = new Map<number, number>();
    for (const row of rows) {
        const mmLotId = movementMmLotReference(row);
        const legacyLotId = movementLegacyLotReference(row);
        const lotId = mmLotId || legacyToMmLot.get(legacyLotId) || legacyLotId;
        if (!lotId) continue;
        quantities.set(lotId, (quantities.get(lotId) || 0) + movementQuantity(row.quantity));
    }
    return quantities;
}

export function sumMovementQuantitiesByStock(rows: Record<string, unknown>[]): Map<string, number> {
    const quantities = new Map<string, number>();
    for (const row of rows) {
        const key = movementStockKey(row);
        if (key.startsWith("0:")) continue;
        quantities.set(key, (quantities.get(key) || 0) + movementQuantity(row.quantity));
    }
    return quantities;
}

export function uniqueRowsByMovementStockKey<T extends Record<string, unknown>>(rows: T[]): T[] {
    const seen = new Set<string>();
    return rows.filter(row => {
        const key = movementStockKey(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
