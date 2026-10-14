export const ALLOCATION_QUANTITY_EPSILON = 0.000001;

export function roundAllocationQuantity(value: number): number {
    return Number(Math.max(0, value).toFixed(6));
}

interface MaterialRequirementQuantitySource {
    allocated_quantity?: unknown;
    required_quantity?: unknown;
    quantity_required?: unknown;
    quantity?: unknown;
}

export function getMaterialRequiredQuantity(material: MaterialRequirementQuantitySource): number {
    const values = [
        material.allocated_quantity,
        material.required_quantity,
        material.quantity_required,
        material.quantity
    ].map(value => Number(value));
    const quantity = values.find(value => Number.isFinite(value) && value > 0)
        ?? values.find(value => Number.isFinite(value) && value >= 0)
        ?? 0;
    return roundAllocationQuantity(quantity);
}

export function getRemainingAllocationQuantity(requiredQuantity: number, stagedQuantity: number): number {
    return roundAllocationQuantity(requiredQuantity - stagedQuantity);
}

export function allocateFefoQuantities(
    requiredQuantity: number,
    stagedQuantity: number,
    candidateAvailableQuantities: readonly number[]
): number[] {
    let remaining = getRemainingAllocationQuantity(requiredQuantity, stagedQuantity);
    return candidateAvailableQuantities.map(availableQuantity => {
        const allocated = roundAllocationQuantity(Math.min(
            remaining,
            Number.isFinite(availableQuantity) ? availableQuantity : 0
        ));
        remaining = getRemainingAllocationQuantity(remaining, allocated);
        return allocated;
    });
}

export function getManualAllocationLimit(availableQuantity: number, alreadyAllocatedElsewhere = 0): number {
    return roundAllocationQuantity(Math.max(0, availableQuantity - alreadyAllocatedElsewhere));
}

export function getManualAllocationTargetLimit(
    availableQuantity: number,
    alreadyAllocatedElsewhere: number,
    remainingTarget: number,
    alreadyAllocatedTowardTarget: number
): number {
    const lotRemaining = getManualAllocationLimit(availableQuantity, alreadyAllocatedElsewhere);
    const targetRemaining = getRemainingAllocationQuantity(remainingTarget, alreadyAllocatedTowardTarget);
    return Math.min(lotRemaining, targetRemaining);
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
