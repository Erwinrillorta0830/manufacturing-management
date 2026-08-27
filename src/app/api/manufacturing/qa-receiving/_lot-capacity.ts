export const LOT_CAPACITY_EPSILON = 1e-9;

export type LotCapacityAllocationKind = "Passed" | "Rejected";

export interface LotCapacityAllocationInput {
    key: string;
    lotId: number;
    quantity: number;
}

export interface LotCapacityAudit {
    capacityOverride: boolean;
    capacityAvailableBeforeReceipt: number | null;
    capacityOverrideQuantity: number;
}

export interface LotCapacityAllocationAudit extends LotCapacityAudit {
    key: string;
    lotId: number;
}

export interface LotCapacityEvaluation {
    lotId: number;
    capacity: number | null;
    occupiedQuantity: number;
    incomingQuantity: number;
    availableBeforeReceipt: number | null;
    receiptOverageQuantity: number;
    allocations: LotCapacityAllocationAudit[];
}

export function allocationCapacityKey(
    lineId: number,
    kind: LotCapacityAllocationKind,
    allocationIndex: number
): string {
    return `${lineId}:${kind}:${allocationIndex}`;
}

export function normalizeLotCapacity(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const capacity = Number(value);
    return Number.isFinite(capacity) && capacity > 0 ? capacity : null;
}

export function evaluateLotCapacities(
    capacityByLot: ReadonlyMap<number, number | null>,
    occupiedByLot: ReadonlyMap<number, number>,
    allocations: readonly LotCapacityAllocationInput[]
): Map<number, LotCapacityEvaluation> {
    const allocationsByLot = new Map<number, LotCapacityAllocationInput[]>();
    for (const allocation of allocations) {
        const existing = allocationsByLot.get(allocation.lotId) || [];
        existing.push(allocation);
        allocationsByLot.set(allocation.lotId, existing);
    }

    const evaluations = new Map<number, LotCapacityEvaluation>();
    for (const [lotId, lotAllocations] of allocationsByLot) {
        const capacity = capacityByLot.get(lotId) ?? null;
        const occupiedQuantity = Math.max(0, Number(occupiedByLot.get(lotId) || 0));
        const incomingQuantity = lotAllocations.reduce(
            (sum, allocation) => sum + Math.max(0, Number(allocation.quantity) || 0),
            0
        );
        const availableBeforeReceipt = capacity === null
            ? null
            : Math.max(0, capacity - occupiedQuantity);
        const receiptOverageQuantity = availableBeforeReceipt === null
            ? 0
            : Math.max(0, incomingQuantity - availableBeforeReceipt);
        let incomingBeforeAllocation = 0;
        const allocationAudits = lotAllocations.map(allocation => {
            const quantity = Math.max(0, Number(allocation.quantity) || 0);
            const remainingBeforeAllocation = availableBeforeReceipt === null
                ? null
                : Math.max(0, availableBeforeReceipt - incomingBeforeAllocation);
            const capacityOverrideQuantity = remainingBeforeAllocation === null
                ? 0
                : Math.max(0, quantity - remainingBeforeAllocation);
            incomingBeforeAllocation += quantity;
            return {
                key: allocation.key,
                lotId,
                capacityOverride: capacityOverrideQuantity > LOT_CAPACITY_EPSILON,
                capacityAvailableBeforeReceipt: availableBeforeReceipt,
                capacityOverrideQuantity
            };
        });

        evaluations.set(lotId, {
            lotId,
            capacity,
            occupiedQuantity,
            incomingQuantity,
            availableBeforeReceipt,
            receiptOverageQuantity,
            allocations: allocationAudits
        });
    }

    return evaluations;
}

export function readLotCapacityAudit(row: Record<string, unknown>): LotCapacityAudit | null {
    if (!Object.prototype.hasOwnProperty.call(row, "is_capacity_override")
        || !Object.prototype.hasOwnProperty.call(row, "capacity_override_quantity")
        || !Object.prototype.hasOwnProperty.call(row, "capacity_available_before_receipt")) {
        return null;
    }

    const capacityOverrideQuantity = Number(row.capacity_override_quantity);
    if (!Number.isFinite(capacityOverrideQuantity) || capacityOverrideQuantity < -LOT_CAPACITY_EPSILON) return null;

    const availableRaw = row.capacity_available_before_receipt;
    const capacityAvailableBeforeReceipt = availableRaw === null || availableRaw === undefined
        ? null
        : Number(availableRaw);
    if (capacityAvailableBeforeReceipt !== null
        && (!Number.isFinite(capacityAvailableBeforeReceipt) || capacityAvailableBeforeReceipt < -LOT_CAPACITY_EPSILON)) {
        return null;
    }

    return {
        capacityOverride: row.is_capacity_override === true || Number(row.is_capacity_override) === 1,
        capacityAvailableBeforeReceipt,
        capacityOverrideQuantity: Math.max(0, capacityOverrideQuantity)
    };
}

export function capacityAuditsEqual(left: LotCapacityAudit, right: LotCapacityAudit): boolean {
    const availableMatches = left.capacityAvailableBeforeReceipt === null || right.capacityAvailableBeforeReceipt === null
        ? left.capacityAvailableBeforeReceipt === right.capacityAvailableBeforeReceipt
        : Math.abs(left.capacityAvailableBeforeReceipt - right.capacityAvailableBeforeReceipt) <= LOT_CAPACITY_EPSILON;
    return left.capacityOverride === right.capacityOverride
        && availableMatches
        && Math.abs(left.capacityOverrideQuantity - right.capacityOverrideQuantity) <= LOT_CAPACITY_EPSILON;
}
