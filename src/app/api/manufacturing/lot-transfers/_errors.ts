export const MM_LOT_CANONICAL_REFERENCE_CODE = "MM_LOT_CANONICAL_REFERENCE_REQUIRED";

export class LotTransferError extends Error {
    constructor(
        readonly statusCode: number,
        message: string,
        readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "LotTransferError";
    }
}
