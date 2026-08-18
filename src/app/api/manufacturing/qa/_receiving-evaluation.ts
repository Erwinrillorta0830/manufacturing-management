export type ReceivingDisposition = "Not Received" | "Passed" | "Partially Accepted" | "Rejected";

export interface ReceivingQuantities {
    receivedQuantity: number;
    acceptedQuantity: number;
    rejectedQuantity: number;
}

export class ReceivingQuantityError extends Error {}

export const OVER_DELIVERY_EPSILON = 1e-9;

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
    if (acceptedQuantity > receivedQuantity || rejectedQuantity > receivedQuantity) {
        return "Accepted and rejected quantities cannot exceed received quantity.";
    }
    if (Math.abs(receivedQuantity - acceptedQuantity - rejectedQuantity) > 1e-9) {
        return "Accepted quantity plus rejected quantity must equal received quantity.";
    }
    return null;
}

export function deriveReceivingDisposition(quantities: ReceivingQuantities): ReceivingDisposition {
    const { receivedQuantity, acceptedQuantity, rejectedQuantity } = quantities;
    const validationError = validateReceivingQuantities(quantities);
    if (validationError) throw new ReceivingQuantityError(validationError);
    if (receivedQuantity === 0 && acceptedQuantity === 0 && rejectedQuantity === 0) return "Not Received";
    if (acceptedQuantity === receivedQuantity) return "Passed";
    if (rejectedQuantity === receivedQuantity) return "Rejected";
    return "Partially Accepted";
}

export function applyQaDecision(quantities: ReceivingQuantities, decision: QaChecklistDecision) {
    const acceptedQuantity = decision.forceRejected ? 0 : quantities.receivedQuantity - quantities.rejectedQuantity;
    const rejectedQuantity = decision.forceRejected ? quantities.receivedQuantity : quantities.rejectedQuantity;
    return {
        disposition: deriveReceivingDisposition({
            receivedQuantity: quantities.receivedQuantity,
            acceptedQuantity,
            rejectedQuantity
        }),
        receivedQuantity: quantities.receivedQuantity,
        acceptedQuantity,
        rejectedQuantity,
        forceRejected: decision.forceRejected,
        rejectionReason: decision.rejectionReason
    };
}
import type { QaChecklistDecision } from "./_purchase-specification-domain";
