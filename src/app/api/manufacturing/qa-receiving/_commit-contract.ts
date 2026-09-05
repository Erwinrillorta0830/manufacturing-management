import { z } from "zod";
import { deriveRejectedQuantity, validateReceivingQuantities } from "../qa/_receiving-evaluation";
import { receivingLotAllocationError, rejectedLotAllocationError } from "./_lot-allocation";
import { normalizeReceivingRemark } from "./_receiving-errors";

export const RECEIVING_COMMIT_CONTRACT_VERSION = "v1" as const;
export const RECEIVING_POSTING_ENABLED = true;

export function receiptNumberForLine(receiptNumber: string, lineId: number): string {
    const suffix = `-${lineId}`;
    return `${receiptNumber.slice(0, Math.max(1, 50 - suffix.length))}${suffix}`;
}

const quantity = z.number().finite().nonnegative();
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const acceptedLotAllocation = z.object({
    storageLotId: z.number().int().positive(),
    quantity,
    batchNumber: z.string().trim().min(1).max(50),
    manufacturingDate: optionalDate.optional(),
    expirationDate: optionalDate.optional()
});
const rejectedLotAllocation = z.object({
    storageLotId: z.number().int().positive(),
    quantity,
    batchNumber: z.string().trim().min(1).max(50),
    manufacturingDate: optionalDate.optional(),
    expirationDate: optionalDate.optional()
});

export const receivingCommitLineSchema = z.object({
    lineId: z.number().int().positive(),
    productId: z.number().int().positive(),
    receivedQuantity: quantity,
    acceptedQuantity: quantity,
    rejectedQuantity: quantity,
    acceptedLotAllocations: z.array(acceptedLotAllocation).default([]),
    rejectedLotAllocations: z.array(rejectedLotAllocation).default([]),
    remarks: z.string().trim().max(255).nullable().transform(normalizeReceivingRemark),
    isPackaging: z.boolean(),
    readings: z.array(z.object({
        specId: z.number().int().positive(),
        actualReading: z.string().trim().min(1).max(100)
    }))
}).superRefine((line, context) => {
    const message = validateReceivingQuantities(line);
    if (message) context.addIssue({ code: z.ZodIssueCode.custom, path: ["receivedQuantity"], message });
    const allocationMessage = receivingLotAllocationError(
        line.acceptedQuantity,
        line.acceptedLotAllocations
    );
    if (allocationMessage) context.addIssue({ code: z.ZodIssueCode.custom, path: ["acceptedLotAllocations"], message: allocationMessage });
    const rejectedAllocationMessage = rejectedLotAllocationError(
        line.rejectedQuantity,
        line.rejectedLotAllocations
    );
    if (rejectedAllocationMessage) context.addIssue({ code: z.ZodIssueCode.custom, path: ["rejectedLotAllocations"], message: rejectedAllocationMessage });
    for (const [field, allocations] of [
        ["acceptedLotAllocations", line.acceptedLotAllocations],
        ["rejectedLotAllocations", line.rejectedLotAllocations]
    ] as const) {
        for (const allocation of allocations) {
            if (!line.isPackaging && (!allocation.manufacturingDate || !allocation.expirationDate)) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [field],
                    message: "Manufacturing and expiry dates are required for raw materials and finished goods."
                });
            }
            if (allocation.manufacturingDate && allocation.expirationDate && allocation.manufacturingDate > allocation.expirationDate) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [field],
                    message: "Manufacturing Date cannot be later than Expiry Date."
                });
            }
        }
    }
}).transform(line => ({
    ...line,
    rejectedQuantity: deriveRejectedQuantity(line.receivedQuantity, line.acceptedQuantity)
}));

const serverOwnedNumber = z.string().trim().max(50).optional();
const receiptNumber = z.string().trim().min(1, "Receipt Number is required.").max(32, "Receipt Number cannot exceed 32 characters.");
const receiptDate = z.string()
    .trim()
    .min(1, "Date of Receipt is required.")
    .refine(value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [year, month, day] = value.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year
            && date.getUTCMonth() === month - 1
            && date.getUTCDate() === day;
    }, "Date of Receipt must be a valid date.");

const receivingRequestSchema = z.object({
    shipmentId: z.number().int().positive(),
    replacementDispositionId: z.number().int().positive().nullable().optional(),
    receiptNumber,
    receiptDate,
    supplierDocumentNumber: serverOwnedNumber,
    referenceNumber: serverOwnedNumber,
    grnNumber: serverOwnedNumber,
    supplierDocumentTypeId: z.number().int().positive().nullable().optional(),
    processOverDelivery: z.boolean().default(false),
    destinationBranchId: z.number().int().positive(),
    lines: z.array(receivingCommitLineSchema).min(1)
});

function rejectLegacyClientOwnedNumbers(value: z.infer<typeof receivingRequestSchema>, context: z.RefinementCtx) {
    for (const field of ["supplierDocumentNumber", "referenceNumber", "grnNumber"] as const) {
        if (value[field]?.trim()) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: [field],
                message: "This receiving flow accepts only the manual Receipt Number field."
            });
        }
    }
}

export const receivingPreviewRequestSchema = receivingRequestSchema.superRefine(rejectLegacyClientOwnedNumbers);
export const receivingCommitRequestSchema = receivingRequestSchema.extend({
    contractVersion: z.literal(RECEIVING_COMMIT_CONTRACT_VERSION),
    workflowRevision: z.number().int().nonnegative()
}).superRefine(rejectLegacyClientOwnedNumbers);

export interface FinalReceivingMovement {
    movementId: number;
    lineId: number;
    kind: "Passed" | "Rejected";
    receivingLineId: number;
    inventoryLotId: number;
    productId: number;
    storageLotId: number;
    mmLotId: number | null;
    legacyLotId: number | null;
    branchId: number;
    transactionTypeId: number;
    sourceDocumentNo: string;
    quantity: number;
    batchNumber: string;
    manufacturingDate: string | null;
    expirationDate: string | null;
    capacityOverride: boolean;
    capacityAvailableBeforeReceipt: number | null;
    capacityOverrideQuantity: number;
}

export interface FinalReceivingAllocation {
    allocationId: number;
    lineId: number;
    receivingLineId: number;
    purchaseOrderReceivingId: number;
    jobOrderId: number;
    jobOrderMaterialId: number;
    productId: number;
    quantity: number;
    inventoryLotIds: number[];
}

export interface FinalReceivingRecord {
    receivingRecordId: number;
    lineId: number;
    shipmentId: number;
    productId: number;
    receiptNumber: string;
    branchId: number;
    storageLotId: number;
    mmLotId: number | null;
    legacyLotId: number | null;
    batchNumber: string;
    receivedQuantity: number;
    rejectedQuantity: number;
    isOverReceived: boolean;
    overDeliveryQuantity: number;
    unitPrice: number;
    finalLandedUnitCost: number;
    qaStatus: string;
    expirationDate: string | null;
    receivedDate: string | null;
    inventoryLotIds: number[];
    qaResultIds: number[];
    allocationIds: number[];
}

export interface ReceivingCommitResult {
    contractVersion: typeof RECEIVING_COMMIT_CONTRACT_VERSION;
    mode: "compatibility";
    commitReference: string;
    receivingTicketNumber: string;
    receiptDate: string;
    idempotentReplay: boolean;
    shipmentId: number;
    status: "Partially Received" | "Received" | "Rejected";
    quantityStatus: "FULL" | "PARTIAL" | "REJECTED";
    supplierDocumentTypeId: number | null;
    paymentStatus: number | null;
    workflowRevision: number;
    receivingRecordIds: number[];
    inventoryLotIds: number[];
    allocationIds: number[];
    receiptNumbers: string[];
    receivingRecords: FinalReceivingRecord[];
    movements: FinalReceivingMovement[];
    allocations: FinalReceivingAllocation[];
}

export type ReceivingCommitRequest = z.infer<typeof receivingCommitRequestSchema>;
export type ReceivingPreviewRequest = z.infer<typeof receivingPreviewRequestSchema>;
