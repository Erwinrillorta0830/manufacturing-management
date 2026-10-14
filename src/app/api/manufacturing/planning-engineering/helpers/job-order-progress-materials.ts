type RelationValue = number | string | { id?: number | string; lot_id?: number | string } | null | undefined;

export interface WipTopUpMovement {
    quantity?: number | string | null;
    mm_lot_id?: RelationValue;
    batch_no?: string | null;
    remarks?: string | null;
}

export interface WipAdditionalIndex {
    byMaterial: Map<number, number>;
    byMaterialLotBatch: Map<string, number>;
}

function relationId(value: RelationValue): number {
    const rawValue = typeof value === "object" && value !== null
        ? value.lot_id ?? value.id
        : value;
    const id = Number(rawValue || 0);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function materialIdFromRemarks(remarks: unknown): number {
    const match = String(remarks || "").match(/\bjo_material_id=(\d+)\b/i);
    const id = Number(match?.[1] || 0);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function lotBatchKey(materialId: number, mmLotId: number, batchNo: string): string {
    return `${materialId}:${mmLotId}:${batchNo.trim().toUpperCase()}`;
}

export function buildWipAdditionalIndex(movements: readonly WipTopUpMovement[]): WipAdditionalIndex {
    const byMaterial = new Map<number, number>();
    const byMaterialLotBatch = new Map<string, number>();

    movements.forEach((movement) => {
        const materialId = materialIdFromRemarks(movement.remarks);
        const quantity = Number(movement.quantity || 0);
        const mmLotId = relationId(movement.mm_lot_id);
        const batchNo = String(movement.batch_no || "").trim();
        const addedQuantity = Number.isFinite(quantity) && quantity < 0 ? Math.abs(quantity) : 0;
        if (!materialId || !mmLotId || !batchNo || addedQuantity <= 0) return;

        byMaterial.set(materialId, (byMaterial.get(materialId) || 0) + addedQuantity);
        const key = lotBatchKey(materialId, mmLotId, batchNo);
        byMaterialLotBatch.set(key, (byMaterialLotBatch.get(key) || 0) + addedQuantity);
    });

    return { byMaterial, byMaterialLotBatch };
}

export function getWipAdditionalForLot(
    index: WipAdditionalIndex,
    materialId: number,
    mmLotId: number | null,
    batchNo: string | null
): number {
    if (!mmLotId || !batchNo) return 0;
    return index.byMaterialLotBatch.get(lotBatchKey(materialId, mmLotId, batchNo)) || 0;
}

export function calculateWipMaterialBalance(
    issuedQuantity: number,
    additionalQuantity: number,
    consumedQuantity: number,
    returnedQuantity: number
): { reserved: number; additional: number; consumed: number; remaining: number } {
    const finiteNonNegative = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
    const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
    const issued = finiteNonNegative(issuedQuantity);
    const additional = finiteNonNegative(additionalQuantity);
    const consumed = finiteNonNegative(consumedQuantity);
    const returned = finiteNonNegative(returnedQuantity);
    const reserved = round6(Math.max(0, issued - additional));

    return {
        reserved,
        additional: round6(additional),
        consumed: round6(consumed),
        remaining: round6(Math.max(0, reserved + additional - consumed - returned))
    };
}
