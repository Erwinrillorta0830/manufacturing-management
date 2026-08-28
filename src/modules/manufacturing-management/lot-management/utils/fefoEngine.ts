import { Batch, Lot, FefoPriorityInfo, FefoAllocationResult, FefoAllocationItem } from "../types";

/**
 * Checks if a batch is eligible for FEFO stock allocation.
 * Ineligible: CLOSED, INACTIVE, QUARANTINED, DAMAGED, EXPIRED, quantity <= 0, or past expiry date.
 * NOTE: Ineligible batches remain VISIBLE in the UI for operational monitoring, but are excluded from FEFO allocation.
 */
export function evaluateBatchEligibility(batch: Batch): { isEligible: boolean; exclusionReason?: string } {
    const rawStatus = String(batch.status || "").toUpperCase();
    if (rawStatus === "CLOSED" || rawStatus === "INACTIVE") {
        return { isEligible: false, exclusionReason: rawStatus };
    }

    const rawQa = String(batch.qaStatus || "").toUpperCase();
    if (rawQa === "QUARANTINED" || rawQa === "DAMAGED" || rawQa === "EXPIRED") {
        return { isEligible: false, exclusionReason: rawQa };
    }

    if (batch.quantity <= 0) {
        return { isEligible: false, exclusionReason: "ZERO_QUANTITY" };
    }

    if (batch.expirationDate) {
        try {
            const expDate = new Date(batch.expirationDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (!isNaN(expDate.getTime()) && expDate.getTime() < today.getTime()) {
                return { isEligible: false, exclusionReason: "EXPIRED" };
            }
        } catch {
            // ignore date parse errors
        }
    }

    return { isEligible: true };
}

/**
 * Sorts an array of batches according to FEFO rules:
 * 1. Expiry Date ASC (earliest expiry first)
 * 2. Manufacturing Date ASC (earliest MFG date first)
 * 3. Batch ID ASC (deterministic fallback)
 */
export function sortBatchesByFefo(batches: Batch[]): Batch[] {
    return [...batches].sort((a, b) => {
        const timeA = a.expirationDate ? new Date(a.expirationDate).getTime() : Infinity;
        const timeB = b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity;

        if (timeA !== timeB) {
            return timeA - timeB;
        }

        const mfgA = a.manufacturingDate ? new Date(a.manufacturingDate).getTime() : Infinity;
        const mfgB = b.manufacturingDate ? new Date(b.manufacturingDate).getTime() : Infinity;
        if (mfgA !== mfgB) {
            return mfgA - mfgB;
        }

        return a.batchId - b.batchId;
    });
}

/**
 * Computes a FEFO Priority Map keyed by batchId.
 * FEFO is ALWAYS calculated per product_id context (never a global cross-product ranking).
 * The earliest eligible batch for EACH product receives Priority #1 (isFefoNext = true).
 */
export function getFefoPriorityMap(
    batches: Batch[],
    selectedProductId?: number | "ALL"
): Map<number, FefoPriorityInfo> {
    const priorityMap = new Map<number, FefoPriorityInfo>();

    // Group batches by productId
    const productGroups = new Map<number, Batch[]>();
    batches.forEach((b) => {
        const pid = Number(b.productId || 1);
        if (!productGroups.has(pid)) {
            productGroups.set(pid, []);
        }
        productGroups.get(pid)!.push(b);
    });

    // Process each product group independently to enforce per-product FEFO ordering
    productGroups.forEach((groupBatches, productId) => {
        const sampleBatch = groupBatches[0];
        const productName = sampleBatch?.productName || sampleBatch?.itemCode || `Product #${productId}`;

        const eligibleBatches: Batch[] = [];

        groupBatches.forEach((batch) => {
            const evalRes = evaluateBatchEligibility(batch);
            if (evalRes.isEligible) {
                eligibleBatches.push(batch);
            } else {
                priorityMap.set(batch.batchId, {
                    priority: null,
                    isFefoNext: false,
                    isEligible: false,
                    exclusionReason: evalRes.exclusionReason,
                    productGroupId: productId,
                    productName
                });
            }
        });

        // Sort eligible batches for this specific product by FEFO
        const fefoSorted = sortBatchesByFefo(eligibleBatches);

        const isFilteredProduct = selectedProductId !== undefined && selectedProductId !== "ALL" && Number(selectedProductId) === productId;

        fefoSorted.forEach((batch, index) => {
            const priority = index + 1;
            priorityMap.set(batch.batchId, {
                priority,
                isFefoNext: priority === 1 && (selectedProductId === "ALL" || isFilteredProduct),
                isEligible: true,
                productGroupId: productId,
                productName
            });
        });
    });

    return priorityMap;
}

/**
 * Sorts batches for table display so FEFO priority #1 items appear at the very top,
 * followed by #2, #3 priorities, and finally exempt/ineligible items at the bottom.
 */
export function sortBatchesForDisplay(
    batches: Batch[],
    selectedProductId?: number | "ALL"
): Batch[] {
    const fefoMap = getFefoPriorityMap(batches, selectedProductId);

    return [...batches].sort((a, b) => {
        const infoA = fefoMap.get(a.batchId);
        const infoB = fefoMap.get(b.batchId);

        const isEligibleA = infoA?.isEligible ? 1 : 0;
        const isEligibleB = infoB?.isEligible ? 1 : 0;

        // Eligible batches come before ineligible/exempt batches
        if (isEligibleA !== isEligibleB) {
            return isEligibleB - isEligibleA;
        }

        // Among eligible batches, sort by FEFO Next (#1 first)
        const isNextA = infoA?.isFefoNext ? 1 : 0;
        const isNextB = infoB?.isFefoNext ? 1 : 0;
        if (isNextA !== isNextB) {
            return isNextB - isNextA;
        }

        // Then by priority rank (1, 2, 3...)
        const prioA = infoA?.priority ?? Infinity;
        const prioB = infoB?.priority ?? Infinity;
        if (prioA !== prioB) {
            return prioA - prioB;
        }

        // Expiry Date ASC
        const expA = a.expirationDate ? new Date(a.expirationDate).getTime() : Infinity;
        const expB = b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity;
        if (expA !== expB) {
            return expA - expB;
        }

        return a.batchId - b.batchId;
    });
}

/**
 * Derives each Storage Lot / Rack's sequence based on the earliest eligible FEFO batch inside it.
 */
export function sortLotsByFefoExpiry(
    lots: Lot[],
    batches: Batch[],
    selectedProductId?: number | "ALL"
): Lot[] {
    const lotEarliestExpiry = new Map<number, number>();

    batches.forEach((b) => {
        const pid = Number(b.productId || 1);
        if (selectedProductId !== undefined && selectedProductId !== "ALL" && Number(selectedProductId) !== pid) {
            return;
        }

        const evalRes = evaluateBatchEligibility(b);
        if (!evalRes.isEligible) return;

        const expTime = b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity;
        const currentEarliest = lotEarliestExpiry.get(b.lotId) ?? Infinity;
        if (expTime < currentEarliest) {
            lotEarliestExpiry.set(b.lotId, expTime);
        }
    });

    return [...lots].sort((a, b) => {
        const expA = lotEarliestExpiry.get(a.lotId) ?? Infinity;
        const expB = lotEarliestExpiry.get(b.lotId) ?? Infinity;

        if (expA !== expB) {
            return expA - expB;
        }

        return a.lotId - b.lotId;
    });
}

/**
 * Authoritative Server/BFF & Client FEFO Stock Allocation Engine.
 * Automatically allocates requested stock quantity against active eligible FEFO batches for a given product.
 */
export function allocateFefoStock(
    batches: Batch[],
    productId: number,
    requestedQty: number
): FefoAllocationResult {
    const targetProductId = Number(productId);
    const eligibleBatches = batches.filter((b) => {
        if (Number(b.productId) !== targetProductId) return false;
        return evaluateBatchEligibility(b).isEligible;
    });

    const sortedBatches = sortBatchesByFefo(eligibleBatches);

    let remainingNeeded = Math.max(0, requestedQty);
    const allocations: FefoAllocationItem[] = [];

    sortedBatches.forEach((batch, idx) => {
        if (remainingNeeded <= 0) return;

        const available = batch.quantity || 0;
        const allocate = Math.min(available, remainingNeeded);

        if (allocate > 0) {
            allocations.push({
                batchId: batch.batchId,
                batchNumber: batch.batchNumber,
                lotId: batch.lotId,
                lotName: batch.lotName,
                allocatedQty: allocate,
                expiryDate: batch.expirationDate || "",
                priority: idx + 1,
                batch
            });
            remainingNeeded -= allocate;
        }
    });

    const allocatedQuantity = requestedQty - remainingNeeded;

    return {
        productId: targetProductId,
        requestedQuantity: requestedQty,
        allocatedQuantity,
        remainingQuantity: Math.max(0, remainingNeeded),
        fullyAllocated: remainingNeeded === 0,
        allocations
    };
}
