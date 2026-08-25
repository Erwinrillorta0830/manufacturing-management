export interface ReceivingLotAllocationDraft {
    storageLotId: number;
    quantity: number;
    batchNumber?: unknown;
    manufacturingDate?: unknown;
    expirationDate?: unknown;
    batch_no?: unknown;
    manufacturing_date?: unknown;
    expiration_date?: unknown;
}

export interface ReceivingLotAllocation {
    storageLotId: number;
    batchNumber: string;
    manufacturingDate: string | null;
    expirationDate: string | null;
    quantity: number;
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function dateValue(value: unknown): string | null {
    const valueText = text(value);
    return valueText || null;
}

function normalizeAllocation(allocation: ReceivingLotAllocationDraft): ReceivingLotAllocation {
    return {
        storageLotId: Number(allocation.storageLotId),
        batchNumber: text(allocation.batchNumber ?? allocation.batch_no),
        manufacturingDate: dateValue(allocation.manufacturingDate ?? allocation.manufacturing_date),
        expirationDate: dateValue(allocation.expirationDate ?? allocation.expiration_date),
        quantity: Number(allocation.quantity)
    };
}

export function normalizeReceivingLotAllocations(
    acceptedQuantity: number,
    allocations: readonly ReceivingLotAllocationDraft[] | undefined
): ReceivingLotAllocation[] {
    if (acceptedQuantity <= 0) return [];
    return (allocations || []).map(normalizeAllocation);
}

function allocationError(
    quantity: number,
    allocations: readonly ReceivingLotAllocationDraft[] | undefined,
    disposition: "accepted" | "rejected"
): string | null {
    if (quantity <= 0) {
        return allocations && allocations.length > 0
            ? `${disposition[0].toUpperCase()}${disposition.slice(1)}-lot allocations are not allowed when ${disposition} quantity is zero.`
            : null;
    }

    const normalized = (allocations || []).map(normalizeAllocation);
    if (normalized.length === 0) return `Select at least one storage lot for ${disposition} inventory.`;

    const seen = new Set<string>();
    let total = 0;
    for (const allocation of normalized) {
        if (!Number.isSafeInteger(allocation.storageLotId) || allocation.storageLotId <= 0) {
            return `Every ${disposition}-lot allocation must reference a valid storage lot.`;
        }
        if (!allocation.batchNumber) {
            return `Every ${disposition}-lot allocation must include a batch number.`;
        }
        if (!Number.isFinite(allocation.quantity) || allocation.quantity <= 0) {
            return `Every ${disposition}-lot allocation must have a positive quantity.`;
        }
        const key = allocationKey(allocation);
        if (seen.has(key)) {
            return `A storage lot and batch can only appear once in the ${disposition} allocation.`;
        }
        seen.add(key);
        total += allocation.quantity;
    }

    if (Math.abs(total - quantity) > 1e-9) {
        return `${disposition[0].toUpperCase()}${disposition.slice(1)}-lot allocations (${total}) must equal ${disposition} quantity (${quantity}).`;
    }
    return null;
}

export function receivingLotAllocationError(
    acceptedQuantity: number,
    allocations: readonly ReceivingLotAllocationDraft[]
): string | null {
    return allocationError(acceptedQuantity, allocations, "accepted");
}

export function normalizeRejectedLotAllocations(
    rejectedQuantity: number,
    allocations: readonly ReceivingLotAllocationDraft[] | undefined
): ReceivingLotAllocation[] {
    if (rejectedQuantity <= 0) return [];
    return (allocations || []).map(normalizeAllocation);
}

export function rejectedLotAllocationError(
    rejectedQuantity: number,
    allocations: readonly ReceivingLotAllocationDraft[]
): string | null {
    return allocationError(rejectedQuantity, allocations, "rejected");
}

export function allocationKey(allocation: ReceivingLotAllocation): string {
    return `${allocation.storageLotId}:${allocation.batchNumber.trim().toLowerCase()}`;
}
