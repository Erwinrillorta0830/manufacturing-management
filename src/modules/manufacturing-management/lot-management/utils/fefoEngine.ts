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

/**
 * Groups and sums batches within a storage lot according to business rules:
 * 1. Same lot, same batch no, same mfg date, same expiry date -> SUM quantities together into one card/record.
 * 2. Same lot, same batch no, but DIFFERENT mfg date or expiry date -> DO NOT sum.
 *    The first group keeps the original batch number, subsequent groups get `-1`, `-2`, etc. appended.
 */
export function groupAndSumLotBatches(lotBatches: Batch[]): Batch[] {
    const batchesByKey = new Map<string, Batch[]>();
    for (const b of lotBatches) {
        const bNo = (b.batchNumber || "").trim().toLowerCase();
        const pId = Number(b.productId || 0);
        const lId = Number(b.lotId || 0);
        const key = `${lId}_${pId}_${bNo}`;
        const list = batchesByKey.get(key) || [];
        list.push(b);
        batchesByKey.set(key, list);
    }

    const result: Batch[] = [];

    batchesByKey.forEach((group) => {
        const dateGroups = new Map<string, Batch[]>();
        for (const b of group) {
            const mfg = (b.manufacturingDate || "").slice(0, 10);
            const exp = (b.expirationDate || "").slice(0, 10);
            const dateKey = `${mfg}_${exp}`;
            const list = dateGroups.get(dateKey) || [];
            list.push(b);
            dateGroups.set(dateKey, list);
        }

        // Sort date groups by earliest expiry / mfg date
        const sortedDateGroups = Array.from(dateGroups.values()).sort((a, b) => {
            const expA = a[0]?.expirationDate ? new Date(a[0].expirationDate).getTime() : Infinity;
            const expB = b[0]?.expirationDate ? new Date(b[0].expirationDate).getTime() : Infinity;
            if (expA !== expB) return expA - expB;
            const mfgA = a[0]?.manufacturingDate ? new Date(a[0].manufacturingDate).getTime() : Infinity;
            const mfgB = b[0]?.manufacturingDate ? new Date(b[0].manufacturingDate).getTime() : Infinity;
            return mfgA - mfgB;
        });

        sortedDateGroups.forEach((subGroup, idx) => {
            const base = subGroup[0];
            const totalQty = subGroup.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            if (totalQty === 0) return;

            const baseBatchNumber = base.rawBatchNumber || base.batchNumber;
            const displayBatchNumber = idx === 0 ? baseBatchNumber : `${baseBatchNumber}-${idx}`;

            result.push({
                ...base,
                batchNumber: displayBatchNumber,
                rawBatchNumber: baseBatchNumber,
                quantity: totalQty,
            });
        });
    });

    return result;
}
