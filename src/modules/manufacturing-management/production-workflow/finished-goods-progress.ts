export interface FinishedGoodsAllocationInput {
    orderNo: string;
    allocatedQuantity: number;
}

export interface FinishedGoodsProgressLine {
    orderNo: string;
    targetQuantity: number;
    good: number;
    nad: number;
    totalProduced: number;
    remaining: number;
}

export interface FinishedGoodsProgressTotals {
    targetQuantity: number;
    goodQuantity: number;
    nadQuantity: number;
    totalProducedQuantity: number;
    remainingQuantity: number;
    overrunQuantity: number;
}

export interface FinishedGoodsProgressBreakdown {
    salesOrders: FinishedGoodsProgressLine[];
    bufferStock: FinishedGoodsProgressLine[];
    totals: FinishedGoodsProgressTotals;
}

const QUANTITY_SCALE = 1_000_000;

function nonNegativeNumber(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function roundQuantity(value: number): number {
    return Math.round(nonNegativeNumber(value) * QUANTITY_SCALE) / QUANTITY_SCALE;
}

export function buildFinishedGoodsProgress(
    targetQuantityInput: number,
    goodQuantityInput: number,
    nadQuantityInput: number,
    allocations: FinishedGoodsAllocationInput[]
): FinishedGoodsProgressBreakdown {
    const targetQuantity = roundQuantity(targetQuantityInput);
    const goodQuantity = roundQuantity(goodQuantityInput);
    const nadQuantity = roundQuantity(nadQuantityInput);
    const allocationsByOrder = new Map<string, number>();

    allocations.forEach((allocation) => {
        const orderNo = String(allocation.orderNo || "").trim();
        const allocatedQuantity = roundQuantity(allocation.allocatedQuantity);
        if (!orderNo || allocatedQuantity <= 0) return;
        allocationsByOrder.set(orderNo, roundQuantity(
            (allocationsByOrder.get(orderNo) || 0) + allocatedQuantity
        ));
    });

    const allocatedQuantity = roundQuantity(
        [...allocationsByOrder.values()].reduce((total, quantity) => total + quantity, 0)
    );
    const bufferTargetQuantity = roundQuantity(Math.max(0, targetQuantity - allocatedQuantity));
    const distributionBasis = Math.max(targetQuantity, allocatedQuantity);
    const salesOrderTargets = [...allocationsByOrder.entries()].map(([orderNo, quantity]) => ({
        orderNo,
        targetQuantity: quantity
    }));
    const hasBufferTarget = bufferTargetQuantity > 0;
    const outputBuckets = salesOrderTargets.map((line) => ({
        orderNo: line.orderNo,
        targetQuantity: line.targetQuantity,
        weight: distributionBasis > 0 ? line.targetQuantity / distributionBasis : 0,
        isBuffer: false
    }));

    if (hasBufferTarget || (outputBuckets.length === 0 && (targetQuantity > 0 || goodQuantity + nadQuantity > 0))) {
        outputBuckets.push({
            orderNo: "Unallocated Buffer / Stock",
            targetQuantity: bufferTargetQuantity || targetQuantity,
            weight: outputBuckets.length === 0 || distributionBasis === 0
                ? 1
                : bufferTargetQuantity / distributionBasis,
            isBuffer: true
        });
    }

    const weights = outputBuckets.map((bucket) => bucket.weight);
    const allocatedGood = distributeQuantity(Math.min(goodQuantity, targetQuantity), weights);
    const allocatedNad = distributeQuantity(nadQuantity, weights);

    const salesOrders: FinishedGoodsProgressLine[] = [];
    const bufferStock: FinishedGoodsProgressLine[] = [];
    outputBuckets.forEach((bucket, index) => {
        const good = allocatedGood[index];
        const nad = allocatedNad[index];
        const line: FinishedGoodsProgressLine = {
            orderNo: bucket.orderNo,
            targetQuantity: bucket.targetQuantity,
            good,
            nad,
            totalProduced: roundQuantity(good + nad),
            remaining: roundQuantity(Math.max(0, bucket.targetQuantity - good))
        };
        if (bucket.isBuffer) bufferStock.push(line);
        else salesOrders.push(line);
    });

    return {
        salesOrders,
        bufferStock,
        totals: {
            targetQuantity,
            goodQuantity,
            nadQuantity,
            totalProducedQuantity: roundQuantity(goodQuantity + nadQuantity),
            remainingQuantity: roundQuantity(Math.max(0, targetQuantity - goodQuantity)),
            overrunQuantity: roundQuantity(Math.max(0, goodQuantity - targetQuantity))
        }
    };
}

function distributeQuantity(quantity: number, weights: number[]): number[] {
    const quantityMicros = Math.round(quantity * QUANTITY_SCALE);
    const rawShares = weights.map((weight) => quantityMicros * weight);
    const allocatedMicros = rawShares.map((share) => Math.floor(share));
    let remainingMicros = quantityMicros - allocatedMicros.reduce((total, amount) => total + amount, 0);
    const remainderOrder = rawShares
        .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
        .sort((left, right) => right.fraction - left.fraction);

    for (let index = 0; remainingMicros > 0 && remainderOrder.length > 0; index += 1) {
        allocatedMicros[remainderOrder[index % remainderOrder.length].index] += 1;
        remainingMicros -= 1;
    }

    return allocatedMicros.map((amount) => amount / QUANTITY_SCALE);
}
