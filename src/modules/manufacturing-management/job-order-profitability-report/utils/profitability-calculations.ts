const QUANTITY_SCALE = 1_000_000;

function nonNegative(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function roundQuantity(value: number): number {
    return Math.round(value * QUANTITY_SCALE) / QUANTITY_SCALE;
}

export interface BatchOutputShare {
    key: string;
    goodQuantity: number;
    allocatedQuantity: number;
    unallocatedQuantity: number;
}

export function allocateOutputProportionally(
    batches: Array<{ key: string; goodQuantity: number }>,
    totalAllocatedQuantity: number
): BatchOutputShare[] {
    const cleanBatches = batches.map((batch) => ({
        key: batch.key,
        goodQuantity: nonNegative(batch.goodQuantity)
    }));
    const totalGood = cleanBatches.reduce((sum, batch) => sum + batch.goodQuantity, 0);
    const allocatedTotal = Math.min(totalGood, nonNegative(totalAllocatedQuantity));
    let allocatedSoFar = 0;

    return cleanBatches.map((batch, index) => {
        const last = index === cleanBatches.length - 1;
        const rawAllocated = totalGood > 0
            ? batch.goodQuantity * allocatedTotal / totalGood
            : 0;
        const allocatedQuantity = roundQuantity(last
            ? Math.min(batch.goodQuantity, Math.max(0, allocatedTotal - allocatedSoFar))
            : Math.min(batch.goodQuantity, rawAllocated));
        allocatedSoFar += allocatedQuantity;
        return {
            ...batch,
            allocatedQuantity,
            unallocatedQuantity: roundQuantity(Math.max(0, batch.goodQuantity - allocatedQuantity))
        };
    });
}

export function weightedNetUnitPrice(
    lines: Array<{ allocatedQuantity: number; netUnitPrice: number }>
): number | null {
    const validLines = lines.filter((line) =>
        Number.isFinite(line.allocatedQuantity)
        && line.allocatedQuantity > 0
        && Number.isFinite(line.netUnitPrice)
        && line.netUnitPrice >= 0
    );
    const allocated = validLines.reduce((sum, line) => sum + line.allocatedQuantity, 0);
    if (allocated <= 0) return null;
    return validLines.reduce((sum, line) => sum + line.allocatedQuantity * line.netUnitPrice, 0) / allocated;
}

export function allocatedBatchCost(batchCost: number | null, goodQuantity: number, allocatedQuantity: number): number | null {
    if (batchCost === null || !Number.isFinite(batchCost) || goodQuantity <= 0) return null;
    return batchCost * Math.min(goodQuantity, nonNegative(allocatedQuantity)) / goodQuantity;
}
