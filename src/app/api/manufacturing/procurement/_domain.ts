export const INVENTORY_STATUS = {
    REQUESTED: 1,
    APPROVED: 3,
    RECEIVED: 6,
    CANCELLED: 7,
    PARTIALLY_RECEIVED: 9,
    AWAITING_PAYMENT: 10,
    FOR_PICKUP: 11,
    REJECTED: 13
} as const;

// Status 12 was used by the retired dispatch stage. It remains recognizable
// only while legacy rows are normalized to the canonical QA Receiving state.
export const LEGACY_DISPATCH_STATUS_ID = 12;

export const RECEIVING_QUEUE_INVENTORY_STATUS_IDS = [
    INVENTORY_STATUS.APPROVED,
    INVENTORY_STATUS.FOR_PICKUP,
    INVENTORY_STATUS.PARTIALLY_RECEIVED
] as const;

export const PAYMENT_STATUS = {
    PENDING: 1,
    AWAITING_PAYMENT: 2,
    PARTIALLY_PAID: 3,
    PAID: 4,
    OVERDUE: 5,
    CANCELLED: 6,
    PROCESSING: 8
} as const;

export type PaymentStatusId = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatusId, string> = {
    [PAYMENT_STATUS.PENDING]: "Pending",
    [PAYMENT_STATUS.AWAITING_PAYMENT]: "Awaiting Payment",
    [PAYMENT_STATUS.PARTIALLY_PAID]: "Partially Paid",
    [PAYMENT_STATUS.PAID]: "Paid",
    [PAYMENT_STATUS.OVERDUE]: "Overdue",
    [PAYMENT_STATUS.CANCELLED]: "Cancelled",
    [PAYMENT_STATUS.PROCESSING]: "Processing"
};

const PAYMENT_STATUSES_ALLOWED_FOR_RECEIVING_HANDOFF = new Set<number>([
    PAYMENT_STATUS.PENDING,
    PAYMENT_STATUS.AWAITING_PAYMENT
]);

export function paymentStatusLabel(value: unknown): string {
    const status = Number(value);
    if (!Number.isFinite(status) || status <= 0) return "Pending";
    return PAYMENT_STATUS_LABELS[status as PaymentStatusId] || `Payment Status ${status}`;
}

export function paymentStatusAllowsReceivingHandoff(value: unknown): boolean {
    if (value == null || value === "") return true;
    const status = Number(value);
    if (!Number.isFinite(status)) return false;
    if (status === 0) return true;
    return PAYMENT_STATUSES_ALLOWED_FOR_RECEIVING_HANDOFF.has(status);
}

export type InventoryStatusId = typeof INVENTORY_STATUS[keyof typeof INVENTORY_STATUS];

export const INVENTORY_STATUS_LABELS: Record<InventoryStatusId, string> = {
    [INVENTORY_STATUS.REQUESTED]: "Requested",
    [INVENTORY_STATUS.APPROVED]: "Approved",
    [INVENTORY_STATUS.RECEIVED]: "Received",
    [INVENTORY_STATUS.CANCELLED]: "Cancelled",
    [INVENTORY_STATUS.PARTIALLY_RECEIVED]: "Partially Received",
    [INVENTORY_STATUS.AWAITING_PAYMENT]: "Awaiting Payment",
    [INVENTORY_STATUS.FOR_PICKUP]: "Receiving (QA)",
    [INVENTORY_STATUS.REJECTED]: "Rejected"
};

const ALLOWED_TRANSITIONS: Record<InventoryStatusId, readonly InventoryStatusId[]> = {
    [INVENTORY_STATUS.REQUESTED]: [INVENTORY_STATUS.APPROVED, INVENTORY_STATUS.CANCELLED],
    [INVENTORY_STATUS.APPROVED]: [INVENTORY_STATUS.FOR_PICKUP],
    [INVENTORY_STATUS.AWAITING_PAYMENT]: [],
    [INVENTORY_STATUS.FOR_PICKUP]: [INVENTORY_STATUS.PARTIALLY_RECEIVED, INVENTORY_STATUS.RECEIVED],
    [INVENTORY_STATUS.PARTIALLY_RECEIVED]: [INVENTORY_STATUS.RECEIVED],
    [INVENTORY_STATUS.RECEIVED]: [],
    [INVENTORY_STATUS.CANCELLED]: [],
    [INVENTORY_STATUS.REJECTED]: []
};

export function isInventoryStatusId(value: number): value is InventoryStatusId {
    return Object.prototype.hasOwnProperty.call(INVENTORY_STATUS_LABELS, value);
}

export function canTransitionInventoryStatus(current: number, target: number): boolean {
    return isInventoryStatusId(current)
        && isInventoryStatusId(target)
        && ALLOWED_TRANSITIONS[current].includes(target);
}

export type ShipmentStatusLabel = "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected";

export type PurchaseOrderStatusLabel = "For Approval" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected";

export function isPurchaseOrderApprovalStatus(status: string | null | undefined): boolean {
    return status === "For Approval" || status === "Requested";
}

export function isReceivingQueueShipmentStatus(status: string | number | null | undefined): boolean {
    if (Number(status) === INVENTORY_STATUS.APPROVED
        || Number(status) === INVENTORY_STATUS.FOR_PICKUP
        || Number(status) === INVENTORY_STATUS.PARTIALLY_RECEIVED
        || Number(status) === LEGACY_DISPATCH_STATUS_ID) return true;
    return status === "For Pickup"
        || status === "Approved"
        || status === "Receiving (QA)"
        || status === "Partially Received";
}

export function shipmentStatusMatchesFilter(status: string, filter: string): boolean {
    if (filter === "Partially Received" || filter === "Receiving (QA)") {
        return status === "Partially Received" || status === "Receiving (QA)";
    }
    return status === filter;
}

export function inventoryStatusToShipmentStatus(statusId?: number | null, paymentStatus?: number | null): ShipmentStatusLabel {
    if (statusId === LEGACY_DISPATCH_STATUS_ID) return "Receiving (QA)";
    if ((statusId === INVENTORY_STATUS.REQUESTED || statusId === INVENTORY_STATUS.APPROVED)
        && Number(paymentStatus) === PAYMENT_STATUS.AWAITING_PAYMENT) {
        return "Awaiting Payment";
    }
    switch (statusId) {
        case INVENTORY_STATUS.APPROVED: return "Approved";
        case INVENTORY_STATUS.AWAITING_PAYMENT: return "Awaiting Payment";
        case INVENTORY_STATUS.CANCELLED: return "Cancelled";
        case INVENTORY_STATUS.FOR_PICKUP: return "Receiving (QA)";
        case INVENTORY_STATUS.PARTIALLY_RECEIVED: return "Partially Received";
        case INVENTORY_STATUS.RECEIVED: return "Received";
        case INVENTORY_STATUS.REJECTED: return "Rejected";
        default: return "Ordered";
    }
}

export function inventoryStatusToPurchaseOrderStatus(statusId?: number | null, paymentStatus?: number | null): PurchaseOrderStatusLabel {
    if (statusId === INVENTORY_STATUS.REQUESTED) {
        return Number(paymentStatus) === PAYMENT_STATUS.AWAITING_PAYMENT
            ? "Awaiting Payment" as const
            : "For Approval" as const;
    }
    const status = inventoryStatusToShipmentStatus(statusId, paymentStatus);
    return status === "Ordered" ? "For Approval" : status;
}

export function shipmentStatusToInventoryStatus(status: string): InventoryStatusId {
    switch (status) {
        case "For Approval":
        case "Requested": return INVENTORY_STATUS.REQUESTED;
        case "Approved": return INVENTORY_STATUS.APPROVED;
        case "Awaiting Payment": return INVENTORY_STATUS.AWAITING_PAYMENT;
        case "Cancelled": return INVENTORY_STATUS.CANCELLED;
        case "For Pickup": return INVENTORY_STATUS.FOR_PICKUP;
        case "Receiving (QA)":
            return INVENTORY_STATUS.FOR_PICKUP;
        case "Partially Received": return INVENTORY_STATUS.PARTIALLY_RECEIVED;
        case "Received": return INVENTORY_STATUS.RECEIVED;
        case "Rejected": return INVENTORY_STATUS.REJECTED;
        default: return INVENTORY_STATUS.REQUESTED;
    }
}

export function canonicalBatchNumber(batchNo?: unknown, legacyLotNumber?: unknown): string | null {
    const canonical = typeof batchNo === "string" ? batchNo.trim() : "";
    if (canonical) return canonical;
    const legacy = typeof legacyLotNumber === "string" ? legacyLotNumber.trim() : "";
    return legacy || null;
}

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculatePurchaseLineAmounts(quantity: number, unitPrice: number, discountPercent = 0) {
    if (![quantity, unitPrice, discountPercent].every(Number.isFinite)) {
        throw new Error("Quantity, unit price, and discount percent must be finite numbers.");
    }
    if (quantity < 0 || unitPrice < 0 || discountPercent < 0 || discountPercent > 100) {
        throw new Error("Quantity and unit price cannot be negative, and discount percent must be between 0 and 100.");
    }

    const grossAmount = roundMoney(quantity * unitPrice);
    const discountedAmount = roundMoney(grossAmount * discountPercent / 100);
    const netAmount = roundMoney(grossAmount - discountedAmount);
    const discountedPrice = quantity > 0 ? roundMoney(netAmount / quantity) : roundMoney(unitPrice);
    return { grossAmount, discountedAmount, netAmount, discountedPrice };
}

function parseDateOnly(value: string): number {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new Error("Dates must use YYYY-MM-DD format.");
    const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const date = new Date(timestamp);
    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
        throw new Error("Invalid calendar date.");
    }
    return timestamp;
}

export function evaluateShelfLife(receiptDate: string, expiryDate: string, shelfLifeDays?: number | null) {
    const receipt = parseDateOnly(receiptDate);
    const expiry = parseDateOnly(expiryDate);
    const remainingDays = Math.floor((expiry - receipt) / 86_400_000);
    if (remainingDays <= 0) {
        return { valid: false, warning: false, remainingDays, remainingRatio: 0 };
    }
    if (!shelfLifeDays || shelfLifeDays <= 0) {
        return { valid: true, warning: false, remainingDays, remainingRatio: null };
    }
    const remainingRatio = remainingDays / shelfLifeDays;
    return { valid: true, warning: remainingRatio < 0.25, remainingDays, remainingRatio };
}

export function todayInManila(now = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}
