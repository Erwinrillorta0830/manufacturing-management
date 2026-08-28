import { AllocatedLot, MaterialStagingItem } from "./types";

const QUANTITY_EPSILON = 0.000001;

export interface BatchStagePlanSegment {
    allocation_id?: number;
    lot_id: number;
    batch_no: string;
    quantity: number;
    available_lot_quantity: number;
    available_allocation_quantity: number;
}

export interface BatchStageSkippedLot {
    allocation_id?: number;
    lot_id: number;
    batch_no: string;
    available_lot_quantity: number;
    available_allocation_quantity: number;
    reason: string;
}

export interface BatchStagePlan {
    requested_quantity: number;
    planned_quantity: number;
    remaining_quantity: number;
    segments: BatchStagePlanSegment[];
    skipped_lots: BatchStageSkippedLot[];
}

function roundQuantity(value: number): number {
    return Number(Math.max(0, value).toFixed(6));
}

function allocationSortValue(allocation: AllocatedLot, index: number): [number, number, number] {
    const createdAt = allocation.created_at ? Date.parse(allocation.created_at) : Number.MAX_SAFE_INTEGER;
    const allocationId = allocation.allocation_id ?? Number.MAX_SAFE_INTEGER;
    return [Number.isFinite(createdAt) ? createdAt : Number.MAX_SAFE_INTEGER, allocationId, index];
}

function compareAllocations(
    left: { allocation: AllocatedLot; index: number },
    right: { allocation: AllocatedLot; index: number }
): number {
    const leftValues = allocationSortValue(left.allocation, left.index);
    const rightValues = allocationSortValue(right.allocation, right.index);

    for (let index = 0; index < leftValues.length; index += 1) {
        if (leftValues[index] !== rightValues[index]) return leftValues[index] - rightValues[index];
    }

    return 0;
}

function physicalLotKey(allocation: AllocatedLot): string {
    return `${allocation.lot_id}:${normalizeBatchNo(allocation.batch_no)}`;
}

function normalizeBatchNo(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
}

export function buildBatchStagePlan(material: MaterialStagingItem): BatchStagePlan {
    const requestedQuantity = roundQuantity(material.required_quantity - material.staged_quantity);
    if (requestedQuantity <= QUANTITY_EPSILON) {
        return {
            requested_quantity: 0,
            planned_quantity: 0,
            remaining_quantity: 0,
            segments: [],
            skipped_lots: []
        };
    }

    const sortedAllocations = material.allocations
        .map((allocation, index) => ({ allocation, index }))
        .sort(compareAllocations);
    const physicalStockRemaining = new Map<string, number>();
    const segments: BatchStagePlanSegment[] = [];
    const skippedLots: BatchStageSkippedLot[] = [];
    let remainingQuantity = requestedQuantity;

    for (const { allocation } of sortedAllocations) {
        const batchNo = String(allocation.batch_no ?? "").trim();
        const sourceBin = String(allocation.source_bin ?? "MAIN-STORE").trim();
        const availableLotQuantity = roundQuantity(allocation.on_hand_lot_quantity);
        const availableAllocationQuantity = roundQuantity(
            allocation.allocated_quantity - allocation.staged_quantity
        );
        const baseLot = {
            allocation_id: allocation.allocation_id,
            lot_id: allocation.lot_id,
            batch_no: batchNo,
            available_lot_quantity: availableLotQuantity,
            available_allocation_quantity: availableAllocationQuantity
        };

        if (!batchNo) {
            skippedLots.push({ ...baseLot, reason: "The allocation has no batch number." });
            continue;
        }

        if (sourceBin.toUpperCase() !== "MAIN-STORE") {
            skippedLots.push({ ...baseLot, reason: "The allocation is not sourced from MAIN-STORE." });
            continue;
        }

        if (availableAllocationQuantity <= QUANTITY_EPSILON) {
            skippedLots.push({ ...baseLot, reason: "The allocation has no remaining quantity to stage." });
            continue;
        }

        const lotKey = physicalLotKey(allocation);
        const hasSeenPhysicalLot = physicalStockRemaining.has(lotKey);
        const remainingPhysicalQuantity = hasSeenPhysicalLot
            ? physicalStockRemaining.get(lotKey) || 0
            : availableLotQuantity;

        if (remainingPhysicalQuantity <= QUANTITY_EPSILON) {
            skippedLots.push({
                ...baseLot,
                available_lot_quantity: roundQuantity(remainingPhysicalQuantity),
                reason: hasSeenPhysicalLot
                    ? "This physical lot/batch has already been allocated by an earlier reservation row."
                    : "This physical lot/batch has no exact on-hand stock."
            });
            continue;
        }

        const segmentQuantity = roundQuantity(Math.min(
            remainingQuantity,
            availableAllocationQuantity,
            remainingPhysicalQuantity
        ));

        if (segmentQuantity <= QUANTITY_EPSILON) {
            skippedLots.push({ ...baseLot, reason: "The lot cannot satisfy a positive staging quantity." });
            continue;
        }

        segments.push({
            allocation_id: allocation.allocation_id,
            lot_id: allocation.lot_id,
            batch_no: allocation.batch_no,
            quantity: segmentQuantity,
            available_lot_quantity: roundQuantity(remainingPhysicalQuantity),
            available_allocation_quantity: availableAllocationQuantity
        });
        physicalStockRemaining.set(lotKey, roundQuantity(remainingPhysicalQuantity - segmentQuantity));
        remainingQuantity = roundQuantity(remainingQuantity - segmentQuantity);

        if (remainingQuantity <= QUANTITY_EPSILON) break;
    }

    const plannedQuantity = roundQuantity(requestedQuantity - remainingQuantity);
    return {
        requested_quantity: requestedQuantity,
        planned_quantity: plannedQuantity,
        remaining_quantity: remainingQuantity,
        segments,
        skipped_lots: skippedLots
    };
}
