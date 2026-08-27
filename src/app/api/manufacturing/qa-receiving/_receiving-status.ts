export const RECEIVING_STATUS_EPSILON = 1e-9;

export type ReceivingCompletionStatus = "Partially Received" | "Received" | "Rejected";
export type ReceivingQuantityStatus = "FULL" | "PARTIAL" | "REJECTED";

export interface ReceivingStatusLineInput {
    orderedQuantity: number;
    receivedQuantity: number;
    rejectedQuantity: number;
}

export interface ReceivingStatusEvaluation {
    status: ReceivingCompletionStatus;
    allLinesAccepted: boolean;
    allLinesPhysicallyAccounted: boolean;
    totalAcceptedQuantity: number;
}

export function quantityStatusFromReceivingStatus(status: ReceivingCompletionStatus): ReceivingQuantityStatus {
    if (status === "Received") return "FULL";
    if (status === "Rejected") return "REJECTED";
    return "PARTIAL";
}

function nonNegative(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function acceptedQuantity(receivedQuantity: number, rejectedQuantity: number): number {
    return Math.max(0, nonNegative(receivedQuantity) - nonNegative(rejectedQuantity));
}

export function evaluateReceivingStatus(
    lines: readonly ReceivingStatusLineInput[]
): ReceivingStatusEvaluation {
    const allLinesAccepted = lines.length > 0 && lines.every(line =>
        acceptedQuantity(line.receivedQuantity, line.rejectedQuantity)
            >= nonNegative(line.orderedQuantity) - RECEIVING_STATUS_EPSILON
    );
    const allLinesPhysicallyAccounted = lines.length > 0 && lines.every(line =>
        nonNegative(line.receivedQuantity)
            >= nonNegative(line.orderedQuantity) - RECEIVING_STATUS_EPSILON
    );
    const totalAcceptedQuantity = lines.reduce(
        (total, line) => total + acceptedQuantity(line.receivedQuantity, line.rejectedQuantity),
        0
    );

    if (allLinesAccepted) {
        return {
            status: "Received",
            allLinesAccepted,
            allLinesPhysicallyAccounted,
            totalAcceptedQuantity
        };
    }

    if (allLinesPhysicallyAccounted && totalAcceptedQuantity <= RECEIVING_STATUS_EPSILON) {
        return {
            status: "Rejected",
            allLinesAccepted,
            allLinesPhysicallyAccounted,
            totalAcceptedQuantity
        };
    }

    return {
        status: "Partially Received",
        allLinesAccepted,
        allLinesPhysicallyAccounted,
        totalAcceptedQuantity
    };
}
