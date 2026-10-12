export interface AllocationReservationIndexRow {
    materialId: number;
    productId: number;
    branchId: number;
    mmLotId: number;
    inventoryLotId: number;
    batchNo: string;
    reservedQuantity: number;
    stagedQuantity: number;
    actualUsedQuantity: number;
}

export interface AllocationStockIdentity {
    productId: number;
    branchId: number;
    mmLotId: number;
    inventoryLotId: number;
    batchNo: string;
}

export interface AllocationReservationIndexes {
    stagedByMaterialId: Map<number, number>;
    reservedElsewhereByStockIdentity: Map<string, number>;
}

export function allocationStockIdentityKey(
    identity: AllocationStockIdentity,
    normalizeBatchNo: (value: unknown) => string
): string {
    return `${identity.productId}:${identity.branchId}:${identity.mmLotId}:${identity.inventoryLotId}:${normalizeBatchNo(identity.batchNo)}`;
}

export function buildAllocationReservationIndexes(
    reservations: readonly AllocationReservationIndexRow[],
    selectedMaterialIds: ReadonlySet<number>,
    normalizeBatchNo: (value: unknown) => string
): AllocationReservationIndexes {
    const stagedByMaterialId = new Map<number, number>();
    const reservedElsewhereByStockIdentity = new Map<string, number>();

    for (const reservation of reservations) {
        stagedByMaterialId.set(
            reservation.materialId,
            (stagedByMaterialId.get(reservation.materialId) || 0) + reservation.stagedQuantity
        );

        if (selectedMaterialIds.has(reservation.materialId)) continue;
        const identity = allocationStockIdentityKey(reservation, normalizeBatchNo);
        const remainingReservation = Math.max(
            0,
            reservation.reservedQuantity - reservation.actualUsedQuantity - reservation.stagedQuantity
        );
        reservedElsewhereByStockIdentity.set(
            identity,
            (reservedElsewhereByStockIdentity.get(identity) || 0) + remainingReservation
        );
    }

    return { stagedByMaterialId, reservedElsewhereByStockIdentity };
}

export function addStagedMovementQuantity(
    stagedByMaterialId: Map<number, number>,
    materialId: number,
    quantity: number,
    isReturnMovement: boolean
): void {
    const stagedQuantity = isReturnMovement
        ? -Math.abs(quantity)
        : quantity < 0 ? Math.abs(quantity) : quantity;
    stagedByMaterialId.set(materialId, (stagedByMaterialId.get(materialId) || 0) + stagedQuantity);
}

export function indexInventoryLotsByProduct<T>(
    inventoryLots: readonly T[],
    getProductId: (inventoryLot: T) => number
): Map<number, T[]> {
    const inventoryLotsByProduct = new Map<number, T[]>();
    for (const inventoryLot of inventoryLots) {
        const productId = getProductId(inventoryLot);
        const productLots = inventoryLotsByProduct.get(productId) || [];
        productLots.push(inventoryLot);
        inventoryLotsByProduct.set(productId, productLots);
    }
    return inventoryLotsByProduct;
}
