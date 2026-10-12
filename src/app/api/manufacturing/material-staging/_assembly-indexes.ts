export function groupMaterialsByJobOrder<T>(
    materials: readonly T[],
    getJobOrderId: (material: T) => number
): Map<number, T[]> {
    const materialsByJobOrder = new Map<number, T[]>();
    for (const material of materials) {
        const jobOrderId = getJobOrderId(material);
        const rows = materialsByJobOrder.get(jobOrderId) || [];
        rows.push(material);
        materialsByJobOrder.set(jobOrderId, rows);
    }
    return materialsByJobOrder;
}

interface IndexedAllocation<T> {
    allocation: T;
    order: number;
}

export interface MaterialAllocationIndexes<T> {
    byMaterialId: Map<number, IndexedAllocation<T>[]>;
    withoutMaterialByJobOrderProduct: Map<string, IndexedAllocation<T>[]>;
}

function jobOrderProductKey(jobOrderId: number, productId: number): string {
    return `${jobOrderId}:${productId}`;
}

export function indexAllocationsByMaterial<T>(
    allocationsByJobOrder: ReadonlyMap<number, readonly T[]>,
    getMaterialId: (allocation: T) => number,
    getProductId: (allocation: T) => number
): MaterialAllocationIndexes<T> {
    const byMaterialId = new Map<number, IndexedAllocation<T>[]>();
    const withoutMaterialByJobOrderProduct = new Map<string, IndexedAllocation<T>[]>();

    for (const [jobOrderId, allocations] of allocationsByJobOrder) {
        allocations.forEach((allocation, order) => {
            const materialId = getMaterialId(allocation);
            const indexedAllocation = { allocation, order };
            if (materialId > 0) {
                const rows = byMaterialId.get(materialId) || [];
                rows.push(indexedAllocation);
                byMaterialId.set(materialId, rows);
                return;
            }

            const productId = getProductId(allocation);
            if (productId > 0) {
                const key = jobOrderProductKey(jobOrderId, productId);
                const rows = withoutMaterialByJobOrderProduct.get(key) || [];
                rows.push(indexedAllocation);
                withoutMaterialByJobOrderProduct.set(key, rows);
            }
        });
    }

    return { byMaterialId, withoutMaterialByJobOrderProduct };
}

export function getAllocationsForMaterialGroup<T>(
    indexes: MaterialAllocationIndexes<T>,
    jobOrderId: number,
    materialIds: readonly number[],
    productId: number
): T[] {
    const matches: IndexedAllocation<T>[] = [];
    for (const materialId of new Set(materialIds)) {
        matches.push(...(indexes.byMaterialId.get(materialId) || []));
    }
    matches.push(...(indexes.withoutMaterialByJobOrderProduct.get(jobOrderProductKey(jobOrderId, productId)) || []));
    matches.sort((left, right) => left.order - right.order);
    return matches.map(({ allocation }) => allocation);
}

export interface StagingMovementIdentity {
    jobOrderId: number;
    branchId: number;
    productId: number;
    lotId: number;
    inventoryLotId: number;
    normalizedBatchNo: string;
}

export interface StagingMovementSummary {
    quantity: number;
    lotId: number;
    inventoryLotId: number;
    stagingBin: string | null;
    negativeOverride: boolean;
}

export function stagingMovementExactKey(identity: StagingMovementIdentity): string {
    return `${identity.jobOrderId}:${identity.branchId}:${identity.productId}:${identity.lotId}:${identity.inventoryLotId}:${identity.normalizedBatchNo}`;
}

export function stagingMovementLotBatchKey(identity: StagingMovementIdentity): string {
    return `${identity.jobOrderId}:${identity.branchId}:${identity.productId}:${identity.lotId}:${identity.normalizedBatchNo}`;
}

export interface StagingMovementIndexes {
    byExactIdentity: Map<string, StagingMovementSummary>;
    firstByLotBatch: Map<string, StagingMovementSummary>;
}

interface StagingMovementRow {
    product_id?: number | null;
    mm_lot_id?: number | null;
    inventory_lot_id?: number | null;
    branch_id?: number | null;
    transaction_type_id?: number | null;
    transaction_type?: string | null;
    source_document_id?: number | null;
    batch_no?: string | null;
    quantity: number;
    remarks?: string | null;
}

export function buildStagingMovementIndexes(
    movements: readonly StagingMovementRow[],
    normalizeBatchNo: (value: unknown) => string,
    canonicalTypeName: (value: unknown) => string
): StagingMovementIndexes {
    const byExactIdentity = new Map<string, StagingMovementSummary>();
    const firstExactKeyByLotBatch = new Map<string, string>();

    for (const movement of movements) {
        const remarks = String(movement.remarks || "");
        const productId = Number(movement.product_id || 0);
        const lotId = Number(movement.mm_lot_id || 0);
        const inventoryLotId = Number(movement.inventory_lot_id || 0);
        const jobOrderId = Number(movement.source_document_id || 0);
        const branchId = Number(movement.branch_id || 0);
        const batchNo = String(movement.batch_no || "").trim();
        const normalizedBatchNo = normalizeBatchNo(batchNo);
        const quantity = Number(movement.quantity || 0);
        const isStagingMovement = remarks.includes("[MM-MATERIAL-STAGING]");
        const isReturnMovement = remarks.includes("[MM-MATERIAL-STAGING-RETURN]");
        const canonicalType = canonicalTypeName(String(movement.transaction_type || ""));
        const isCanonicalIssue = canonicalType === "MATERIAL_STAGING_ISSUE";
        const isCanonicalReversal = canonicalType === "MATERIAL_STAGING_REVERSAL";

        if (
            (!isStagingMovement && !isReturnMovement) ||
            (!isCanonicalIssue && !isCanonicalReversal && Number(movement.transaction_type_id) !== 4) ||
            quantity === 0 ||
            !productId ||
            !lotId ||
            !jobOrderId ||
            !branchId ||
            !normalizedBatchNo
        ) continue;

        const identity = { jobOrderId, branchId, productId, lotId, inventoryLotId, normalizedBatchNo };
        const exactKey = stagingMovementExactKey(identity);
        const lotBatchKey = stagingMovementLotBatchKey(identity);
        if (!firstExactKeyByLotBatch.has(lotBatchKey)) firstExactKeyByLotBatch.set(lotBatchKey, exactKey);

        const targetBin = remarks.match(/target_bin=([^;|]+)/i)?.[1]?.trim() || null;
        const stagedQuantity = isReturnMovement
            ? -Math.abs(quantity)
            : isCanonicalIssue || quantity < 0
                ? Math.abs(quantity)
                : quantity;
        const current = byExactIdentity.get(exactKey);
        byExactIdentity.set(exactKey, {
            quantity: (current?.quantity || 0) + stagedQuantity,
            lotId: lotId || current?.lotId || 0,
            inventoryLotId: inventoryLotId || current?.inventoryLotId || 0,
            stagingBin: isReturnMovement ? (current?.stagingBin || null) : (targetBin || current?.stagingBin || null),
            negativeOverride: isReturnMovement
                ? Boolean(current?.negativeOverride)
                : Boolean(current?.negativeOverride || remarks.includes("[NEGATIVE OVERRIDE]"))
        });
    }

    const firstByLotBatch = new Map<string, StagingMovementSummary>();
    for (const [lotBatchKey, exactKey] of firstExactKeyByLotBatch) {
        const movement = byExactIdentity.get(exactKey);
        if (movement) firstByLotBatch.set(lotBatchKey, movement);
    }

    return { byExactIdentity, firstByLotBatch };
}
