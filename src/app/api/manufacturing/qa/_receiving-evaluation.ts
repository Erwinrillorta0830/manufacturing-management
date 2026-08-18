export type ReceivingDisposition = "Not Received" | "Passed" | "Partially Accepted" | "Rejected";

export interface ReceivingQuantities {
    receivedQuantity: number;
    acceptedQuantity: number;
    rejectedQuantity: number;
}

export class ReceivingQuantityError extends Error {}

export const OVER_DELIVERY_EPSILON = 1e-9;

export function deriveRejectedQuantity(receivedQuantity: number, acceptedQuantity: number): number {
    return receivedQuantity - acceptedQuantity;
}

export interface OverDeliveryEvaluation {
    remainingQuantity: number;
    overDeliveryQuantity: number;
    isOverReceived: boolean;
}

export function evaluateOverDelivery(receivedQuantity: number, remainingQuantity: number): OverDeliveryEvaluation {
    const received = Number(receivedQuantity);
    const remaining = Math.max(0, Number(remainingQuantity));
    const overDeliveryQuantity = Number.isFinite(received) && Number.isFinite(remaining)
        ? Math.max(0, received - remaining)
        : 0;
    return {
        remainingQuantity: remaining,
        overDeliveryQuantity,
        isOverReceived: overDeliveryQuantity > OVER_DELIVERY_EPSILON
    };
}

export function validateReceivingQuantities(quantities: ReceivingQuantities): string | null {
    const { receivedQuantity, acceptedQuantity, rejectedQuantity } = quantities;
    if (![receivedQuantity, acceptedQuantity, rejectedQuantity].every(Number.isFinite)) {
        return "Receiving quantities must be finite numbers.";
    }
    if (receivedQuantity < 0 || acceptedQuantity < 0 || rejectedQuantity < 0) {
        return "Receiving quantities cannot be negative.";
    }
    if (receivedQuantity === 0 && acceptedQuantity === 0 && rejectedQuantity === 0) return null;
    if (receivedQuantity <= 0) {
        return "Received quantity must be greater than zero for an included line.";
    }
    if (acceptedQuantity > receivedQuantity) {
        return "Accepted quantity cannot exceed received quantity.";
    }
    if (rejectedQuantity > receivedQuantity) {
        return "Rejected quantity cannot exceed received quantity.";
    }
    if (Math.abs(deriveRejectedQuantity(receivedQuantity, acceptedQuantity) - rejectedQuantity) > 1e-9) {
        return "Rejected quantity must equal received quantity minus accepted quantity.";
    }
    return null;
}

export function normalizeReceivingQuantities(quantities: ReceivingQuantities): ReceivingQuantities {
    const validationError = validateReceivingQuantities(quantities);
    if (validationError) throw new ReceivingQuantityError(validationError);
    return {
        receivedQuantity: quantities.receivedQuantity,
        acceptedQuantity: quantities.acceptedQuantity,
        rejectedQuantity: deriveRejectedQuantity(quantities.receivedQuantity, quantities.acceptedQuantity)
    };
}

export function deriveReceivingDisposition(quantities: ReceivingQuantities): ReceivingDisposition {
    const { receivedQuantity, acceptedQuantity, rejectedQuantity } = normalizeReceivingQuantities(quantities);
    if (receivedQuantity === 0 && acceptedQuantity === 0 && rejectedQuantity === 0) return "Not Received";
    if (acceptedQuantity === receivedQuantity) return "Passed";
    if (rejectedQuantity === receivedQuantity) return "Rejected";
    return "Partially Accepted";
}

export function applyQaDecision(quantities: ReceivingQuantities, decision: QaChecklistDecision) {
    const normalized = normalizeReceivingQuantities(quantities);
    const acceptedQuantity = decision.forceRejected ? 0 : normalized.acceptedQuantity;
    const rejectedQuantity = decision.forceRejected ? normalized.receivedQuantity : normalized.rejectedQuantity;
    return {
        disposition: deriveReceivingDisposition({
            receivedQuantity: normalized.receivedQuantity,
            acceptedQuantity,
            rejectedQuantity
        }),
        receivedQuantity: normalized.receivedQuantity,
        acceptedQuantity,
        rejectedQuantity,
        forceRejected: decision.forceRejected,
        rejectionReason: decision.rejectionReason
    };
}
import type { QaChecklistDecision } from "./_purchase-specification-domain";
