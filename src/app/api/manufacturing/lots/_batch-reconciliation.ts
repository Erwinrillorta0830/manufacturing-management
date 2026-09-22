export interface BatchBalanceSnapshot {
    branchId: number;
    lotId: number;
    productId: number;
    batchNo: string;
    manufacturingDate?: string | null;
    expirationDate?: string | null;
    onHand: number;
    lastMovementDate?: string | null;
}

export interface BatchBalanceMovement {
    branchId: number;
    lotId: number;
    productId: number;
    batchNo: string;
    manufacturingDate?: string | null;
    expirationDate?: string | null;
    quantity: number;
    createdAt?: string | null;
}

function text(value: unknown): string {
    return String(value ?? "").trim();
}

function normalizedDate(value: unknown): string {
    return text(value).slice(0, 10);
}

function timestamp(value: unknown): number | null {
    const raw = text(value);
    if (!raw) return null;

    const normalized = raw.includes(" ") ? raw.replace(" ", "T") : raw;
    const withTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
        ? normalized
        : `${normalized}+08:00`;
    const parsed = Date.parse(withTimezone);
    return Number.isFinite(parsed) ? parsed : null;
}

function sameBatch(snapshot: BatchBalanceSnapshot, movement: BatchBalanceMovement): boolean {
    if (snapshot.branchId !== movement.branchId
        || snapshot.lotId !== movement.lotId
        || snapshot.productId !== movement.productId
        || snapshot.batchNo.toLowerCase() !== movement.batchNo.toLowerCase()) {
        return false;
    }

    const snapshotManufacturingDate = normalizedDate(snapshot.manufacturingDate);
    const movementManufacturingDate = normalizedDate(movement.manufacturingDate);
    const snapshotExpirationDate = normalizedDate(snapshot.expirationDate);
    const movementExpirationDate = normalizedDate(movement.expirationDate);

    return (!snapshotManufacturingDate || !movementManufacturingDate || snapshotManufacturingDate === movementManufacturingDate)
        && (!snapshotExpirationDate || !movementExpirationDate || snapshotExpirationDate === movementExpirationDate);
}

/**
 * Returns only canonical movements that are newer than the live snapshot.
 * This lets the BFF repair a projection that has not consumed a recent lot
 * transfer while avoiding a second application when the projection is current.
 */
export function unreflectedMovementDelta(
    snapshot: BatchBalanceSnapshot,
    movements: BatchBalanceMovement[]
): number {
    const snapshotTimestamp = timestamp(snapshot.lastMovementDate);

    return movements
        .filter((movement) => sameBatch(snapshot, movement))
        .filter((movement) => {
            const movementTimestamp = timestamp(movement.createdAt);
            return snapshotTimestamp === null
                || movementTimestamp === null
                || movementTimestamp > snapshotTimestamp;
        })
        .reduce((sum, movement) => sum + movement.quantity, 0);
}
