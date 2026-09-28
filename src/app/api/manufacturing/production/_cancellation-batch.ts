export interface ReservationReleaseBatchTarget {
    id: number;
    reservedQuantity: number;
    stagedQuantity: number;
    actualUsedQuantity: number;
    reservationStatus: string | null;
}

export interface MaterialReleaseBatchTarget {
    id: number;
    reservedQuantity: number;
}

export interface ReservationReleaseBatch {
    snapshots: Array<{ id: number; payload: Record<string, unknown> }>;
    updates: Array<Record<string, unknown>>;
}

export interface MaterialReleaseBatch {
    snapshots: Array<{ id: number; reservedQuantity: number }>;
    updates: Array<Record<string, unknown>>;
}

export interface ReturnMovementIdentity {
    productId: number;
    branchId: number;
    mmLotId: number;
    inventoryLotId: number;
    batchNo: string;
    transactionTypeId: number;
    quantity: number;
}

export const DIRECTUS_BATCH_SIZE = 100;

export function chunkBatch<T>(items: T[], size = DIRECTUS_BATCH_SIZE): T[][] {
    if (!Number.isSafeInteger(size) || size <= 0) {
        throw new RangeError("Batch size must be a positive integer.");
    }

    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

export function buildReservationReleaseBatch(
    targets: ReservationReleaseBatchTarget[],
    roundQuantity: (quantity: number) => number
): ReservationReleaseBatch {
    const releasable = targets.filter(target =>
        Number.isSafeInteger(target.id)
        && target.id > 0
        && (target.reservedQuantity > 0 || target.stagedQuantity > 0)
    );

    return {
        snapshots: releasable.map(target => ({
            id: target.id,
            payload: {
                reserved_quantity: target.reservedQuantity,
                staged_quantity: target.stagedQuantity,
                reservation_status: target.reservationStatus
            }
        })),
        updates: releasable.map(target => ({
            jo_materials_reservation_id: target.id,
            reserved_quantity: 0,
            staged_quantity: roundQuantity(Math.min(target.stagedQuantity, target.actualUsedQuantity)),
            reservation_status: "RELEASED"
        }))
    };
}

export function buildMaterialReleaseBatch(targets: MaterialReleaseBatchTarget[]): MaterialReleaseBatch {
    const releasable = targets.filter(target =>
        Number.isSafeInteger(target.id)
        && target.id > 0
        && target.reservedQuantity > 0
    );

    return {
        snapshots: releasable.map(target => ({
            id: target.id,
            reservedQuantity: target.reservedQuantity
        })),
        updates: releasable.map(target => ({
            jo_material_id: target.id,
            reserved_quantity: 0
        }))
    };
}

export function matchesExistingReturnMovement(
    row: Record<string, unknown>,
    expected: ReturnMovementIdentity,
    quantityEpsilon = 0.000001
): boolean {
    const number = (value: unknown): number => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const batch = (value: unknown): string => String(value ?? "").trim().toLowerCase();

    return number(row.product_id) === expected.productId
        && number(row.branch_id) === expected.branchId
        && number(row.mm_lot_id) === expected.mmLotId
        && number(row.inventory_lot_id) === expected.inventoryLotId
        && batch(row.batch_no) === batch(expected.batchNo)
        && number(row.transaction_type_id) === expected.transactionTypeId
        && Math.abs(number(row.quantity) - expected.quantity) <= quantityEpsilon;
}
