export const ALLOCATION_QUANTITY_EPSILON = 0.000001;

export function roundAllocationQuantity(value: number): number {
    return Number(Math.max(0, value).toFixed(6));
}

export function getManualAllocationLimit(availableQuantity: number, alreadyAllocatedElsewhere = 0): number {
    return roundAllocationQuantity(Math.max(0, availableQuantity - alreadyAllocatedElsewhere));
}

export function exceedsAvailableQuantity(quantity: number, availableQuantity: number): boolean {
    return Number.isFinite(quantity) && Number.isFinite(availableQuantity) && quantity > availableQuantity;
}

export function getOverTargetQuantity(allocatedQuantity: number, remainingTarget: number): number {
    return roundAllocationQuantity(Math.max(0, roundAllocationQuantity(allocatedQuantity) - roundAllocationQuantity(remainingTarget)));
}

export function getAllocationShortage(remainingRequirement: number, allocatedQuantity: number): number {
    return roundAllocationQuantity(Math.max(
        0,
        roundAllocationQuantity(remainingRequirement) - roundAllocationQuantity(allocatedQuantity)
    ));
}
