import { z } from "zod";
import { LotTransferError } from "./_errors";
import type {
    LotTransferInput,
    LotTransferPatchInput
} from "./_types";

const positiveInteger = z.coerce.number().int().positive();
const positiveQuantity = z.coerce.number().refine(
    (value) => Number.isFinite(value) && value > 0,
    "Quantity must be greater than zero."
);
const optionalPositiveInteger = z.preprocess(
    (value) => value === "" || value === null ? undefined : value,
    positiveInteger.optional()
);
const optionalBatchNumber = z.preprocess(
    (value) => value === "" || value === null ? undefined : value,
    z.string().trim().min(1).max(150).optional()
);

const detailInputSchema = z.object({
    detailId: positiveInteger.optional(),
    lineNo: positiveInteger.optional(),
    productId: positiveInteger,
    sourceInventoryLotId: positiveInteger,
    sourceBatchNo: z.string().trim().min(1).max(150),
    targetInventoryLotId: optionalPositiveInteger,
    targetBatchNo: optionalBatchNumber,
    quantity: positiveQuantity,
    lineRemarks: z.string().trim().max(2000).optional()
}).strict();

const canonicalLotTransferInputSchema = z.object({
    branchId: positiveInteger,
    sourceLotId: positiveInteger,
    targetLotId: positiveInteger,
    reason: z.string().trim().min(1, "A transfer reason is required.").max(2000),
    details: z.array(detailInputSchema).min(1, "At least one transfer detail line is required.")
}).strict();

const legacyLotTransferInputSchema = z.object({
    branchId: positiveInteger,
    productId: positiveInteger,
    sourceLotId: positiveInteger,
    sourceInventoryLotId: positiveInteger,
    sourceBatchNo: z.string().trim().min(1).max(150),
    targetLotId: positiveInteger,
    targetInventoryLotId: optionalPositiveInteger,
    targetBatchNo: optionalBatchNumber,
    quantity: positiveQuantity,
    reason: z.string().trim().min(1, "A transfer reason is required.").max(2000)
}).strict();

const lotTransferInputSchema = z.union([canonicalLotTransferInputSchema, legacyLotTransferInputSchema]).transform((value) => {
    if ("details" in value) return value;
    return {
        branchId: value.branchId,
        sourceLotId: value.sourceLotId,
        targetLotId: value.targetLotId,
        reason: value.reason,
        details: [{
            productId: value.productId,
            sourceInventoryLotId: value.sourceInventoryLotId,
            sourceBatchNo: value.sourceBatchNo,
            targetInventoryLotId: value.targetInventoryLotId,
            targetBatchNo: value.targetBatchNo,
            quantity: value.quantity,
            lineRemarks: ""
        }]
    } satisfies LotTransferInput;
});

const lotTransferPatchSchema = z.object({
    branchId: positiveInteger.optional(),
    sourceLotId: positiveInteger.optional(),
    targetLotId: positiveInteger.optional(),
    reason: z.string().trim().min(1).max(2000).optional(),
    details: z.array(detailInputSchema).min(1).optional(),
    productId: positiveInteger.optional(),
    sourceInventoryLotId: positiveInteger.optional(),
    sourceBatchNo: z.string().trim().min(1).max(150).optional(),
    targetInventoryLotId: optionalPositiveInteger,
    targetBatchNo: optionalBatchNumber,
    quantity: positiveQuantity.optional()
}).strict();

const rejectionSchema = z.object({
    rejectionReason: z.string().trim().min(1, "A rejection reason is required.").max(2000),
    qaEvidence: z.string().trim().max(5000).optional()
}).strict();

const cancellationSchema = z.object({
    cancellationReason: z.string().trim().min(1, "A cancellation reason is required.").max(5000)
}).strict();

const postingSchema = z.object({
    idempotencyKey: z.string().trim().min(8).max(150)
}).strict();

const reversalSchema = z.object({
    reversalReason: z.string().trim().min(1, "A reversal reason is required.").max(5000),
    idempotencyKey: z.string().trim().min(8, "A unique reversal operation key is required.").max(150)
}).strict();

export function parseLotTransferInput(body: unknown): LotTransferInput {
    const result = lotTransferInputSchema.safeParse(body);
    if (!result.success) {
        throw new LotTransferError(400, "Invalid lot-transfer request.", result.error.flatten().fieldErrors);
    }
    return result.data;
}

export function parseLotTransferPatch(body: unknown): LotTransferPatchInput {
    const result = lotTransferPatchSchema.safeParse(body);
    if (!result.success) {
        throw new LotTransferError(400, "Invalid lot-transfer update.", result.error.flatten().fieldErrors);
    }
    return result.data;
}

export function parseRejection(body: unknown): { rejectionReason: string; qaEvidence?: string } {
    const result = rejectionSchema.safeParse(body);
    if (!result.success) {
        throw new LotTransferError(400, "A rejection reason is required.", result.error.flatten().fieldErrors);
    }
    return result.data;
}

export function parseCancellation(body: unknown): { cancellationReason: string } {
    const result = cancellationSchema.safeParse(body);
    if (!result.success) {
        throw new LotTransferError(400, "A cancellation reason is required.", result.error.flatten().fieldErrors);
    }
    return result.data;
}

export function parsePosting(body: unknown): { idempotencyKey: string } {
    const result = postingSchema.safeParse(body);
    if (!result.success) {
        throw new LotTransferError(400, "A unique posting operation key is required.", result.error.flatten().fieldErrors);
    }
    return result.data;
}

export function parseReversal(body: unknown): { reversalReason: string; idempotencyKey: string } {
    const result = reversalSchema.safeParse(body);
    if (!result.success) {
        throw new LotTransferError(400, "A reversal reason and unique operation key are required.", result.error.flatten().fieldErrors);
    }
    return result.data;
}
