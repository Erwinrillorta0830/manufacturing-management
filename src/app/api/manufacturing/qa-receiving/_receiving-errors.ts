export const RECEIVING_ERROR_CODES = {
    VALIDATION: "RECEIVING_VALIDATION_ERROR",
    CONFLICT: "RECEIVING_CONFLICT",
    RETRY_REQUIRED: "RECEIVING_RETRY_REQUIRED",
    DEPENDENCY: "RECEIVING_DEPENDENCY_ERROR",
    PERSISTENCE: "RECEIVING_PERSISTENCE_ERROR"
} as const;

export type ReceivingErrorCode = typeof RECEIVING_ERROR_CODES[keyof typeof RECEIVING_ERROR_CODES];

export interface ReceivingValidationDetails {
    field: "remarks";
    lineId: number;
    productId: number;
}

export interface ReceivingDependencyDetails {
    dependency: string;
    upstreamStatus: number | null;
    method: string;
}

export type ReceivingErrorDetails = ReceivingValidationDetails | ReceivingDependencyDetails;

export interface ReceivingDiscrepancyInput {
    lineId: number;
    productId: number;
    receivedQuantity: number;
    remainingQuantity: number;
    rejectedQuantity: number;
    remarks: string | null | undefined;
}

const RECEIVING_QUANTITY_EPSILON = 1e-9;

export function normalizeReceivingRemark(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized || null;
}

export function discrepancyRemarkError(input: ReceivingDiscrepancyInput): {
    message: string;
    details: ReceivingValidationDetails;
} | null {
    const receivedQuantity = Number(input.receivedQuantity);
    const remainingQuantity = Math.max(0, Number(input.remainingQuantity));
    const rejectedQuantity = Number(input.rejectedQuantity);
    const hasReceivedQuantity = Number.isFinite(receivedQuantity) && receivedQuantity > RECEIVING_QUANTITY_EPSILON;
    const hasQuantityDiscrepancy = hasReceivedQuantity && (
        Math.abs(receivedQuantity - remainingQuantity) > RECEIVING_QUANTITY_EPSILON
        || (Number.isFinite(rejectedQuantity) && rejectedQuantity > RECEIVING_QUANTITY_EPSILON)
    );

    if (!hasQuantityDiscrepancy || normalizeReceivingRemark(input.remarks)) return null;

    return {
        message: `Remarks are required for the quantity discrepancy on product ${input.productId}.`,
        details: {
            field: "remarks",
            lineId: input.lineId,
            productId: input.productId
        }
    };
}

export function receivingErrorCodeForStatus(status: number): ReceivingErrorCode {
    if (status === 400 || status === 422) return RECEIVING_ERROR_CODES.VALIDATION;
    if (status === 409) return RECEIVING_ERROR_CODES.RETRY_REQUIRED;
    if (status >= 500) return RECEIVING_ERROR_CODES.DEPENDENCY;
    return RECEIVING_ERROR_CODES.CONFLICT;
}

export function isReceivingErrorCode(value: unknown): value is ReceivingErrorCode {
    return typeof value === "string"
        && Object.values(RECEIVING_ERROR_CODES).includes(value as ReceivingErrorCode);
}
