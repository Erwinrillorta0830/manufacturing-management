import type {
    DestinationBatchResolution,
    DestinationBatchResolutionAction
} from "./_destination-batch";

export const LOT_TRANSFER_STATUSES = ["Draft", "Submitted", "Approved", "Posted", "Rejected", "Cancelled", "Reversed"] as const;
export type LotTransferStatus = (typeof LOT_TRANSFER_STATUSES)[number];

export interface LotTransferInput {
    branchId: number;
    sourceLotId: number;
    targetLotId: number;
    reason: string;
    details: LotTransferDetailInput[];
}

export interface LotTransferDetailInput {
    detailId?: number;
    lineNo?: number;
    productId: number;
    sourceInventoryLotId: number;
    sourceBatchNo: string;
    targetInventoryLotId?: number;
    targetBatchNo?: string;
    quantity: number;
    lineRemarks?: string;
}

export interface LotTransferPatchInput {
    branchId?: number;
    sourceLotId?: number;
    targetLotId?: number;
    reason?: string;
    details?: LotTransferDetailInput[];
    // Flat fields remain accepted temporarily for clients that have not migrated.
    productId?: number;
    sourceInventoryLotId?: number;
    sourceBatchNo?: string;
    targetInventoryLotId?: number;
    targetBatchNo?: string;
    quantity?: number;
}

export interface LotTransferDetail {
    detailId: number | null;
    lineNo: number;
    productId: number;
    sourceInventoryLotId: number;
    sourceBatchNo: string;
    targetInventoryLotId: number | null;
    targetBatchNo: string;
    quantity: number;
    lineRemarks: string;
    sourceManufacturingDate: string | null;
    sourceExpiryDate: string | null;
    targetManufacturingDate: string | null;
    targetExpiryDate: string | null;
    sourceUnitCost: number | null;
    targetUnitCost: number | null;
    sourceBalanceBefore: number | null;
    sourceBalanceAfter: number | null;
    targetBalanceBefore: number | null;
    targetBalanceAfter: number | null;
    sourceMovementId: number | null;
    targetMovementId: number | null;
    validationStatus: string | null;
    validationError: string | null;
    postingError: string | null;
    reconciliationRequired: boolean;
    destinationBatchAction: DestinationBatchResolutionAction | null;
}

export interface LotTransferRecord {
    id: number;
    requestNo: string;
    status: LotTransferStatus;
    branchId: number;
    productId: number;
    unitId: number | null;
    sourceLotId: number;
    sourceInventoryLotId: number;
    sourceBatchNo: string;
    targetLotId: number;
    targetInventoryLotId: number | null;
    targetBatchNo: string;
    quantity: number;
    reason: string;
    requestedBy: number | null;
    requestedByName: string | null;
    requestedAt: string | null;
    transferDate: string | null;
    submittedBy: number | null;
    submittedAt: string | null;
    approvedBy: number | null;
    approvedByName: string | null;
    approvedAt: string | null;
    postedBy: number | null;
    postedByName: string | null;
    postedAt: string | null;
    rejectedBy: number | null;
    rejectedByName: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    cancelledBy: number | null;
    cancelledByName: string | null;
    cancelledAt: string | null;
    cancellationReason: string | null;
    qaEvidence: string | null;
    effectiveExpiryDate: string | null;
    sourceUnitCost: number | null;
    targetUnitCost: number | null;
    sourceMovementId: number | null;
    targetMovementId: number | null;
    sourceBalanceBefore: number | null;
    sourceBalanceAfter: number | null;
    targetBalanceBefore: number | null;
    targetBalanceAfter: number | null;
    idempotencyKey: string | null;
    reversalOfId: number | null;
    reversalReason: string | null;
    reversedBy: number | null;
    reversedByName: string | null;
    reversedAt: string | null;
    linkedReversalId: number | null;
    linkedReversalRequestNo: string | null;
    linkedReversalStatus: LotTransferStatus | null;
    linkedReversalReason: string | null;
    linkedReversalBy: number | null;
    linkedReversalByName: string | null;
    linkedReversalAt: string | null;
    postingStartedAt: string | null;
    reconciliationRequired: boolean;
    postingError: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    details: LotTransferDetail[];
    lineCount: number;
    totalQuantity: number;
}

export interface ValidationCheck {
    key: string;
    label: string;
    passed: boolean;
    message: string;
}

export type ProtectedAllocationSource =
    | "SALES_ORDER"
    | "SALES_INVOICE"
    | "JOB_ORDER_MATERIAL"
    | "STOCK_TRANSFER"
    | "LOT_TRANSFER";

export interface ProtectedAllocation {
    source: ProtectedAllocationSource;
    allocationId: number;
    quantity: number;
    status: string;
    reference: string | null;
}

export interface LotBalanceSnapshot {
    lotId: number;
    inventoryLotId: number | null;
    batchNo: string;
    onHandBefore: number;
    reservedQuantity: number;
    legacyReservedQuantity: number;
    protectedAllocationQuantity: number;
    protectedAllocations: ProtectedAllocation[];
    protectedAllocationResolutionComplete: boolean;
    availableQuantity: number;
    onHandAfter: number;
    unitCost: number | null;
    expiryDate: string | null;
    manufacturingDate: string | null;
}

export interface LotTransferPreview {
    transferId: number;
    requestNo: string;
    canApprove: boolean;
    canPost: boolean;
    checks: ValidationCheck[];
    source: LotBalanceSnapshot;
    target: LotBalanceSnapshot;
    sourceLotCapacity: number | null;
    sourceLotOccupiedBefore: number;
    targetLotCapacity: number | null;
    targetLotOccupiedBefore: number;
    targetLotCapacityRemaining: number | null;
    effectiveExpiryDate: string | null;
    destinationBatchResolution: DestinationBatchResolution;
    allergenProfiles: {
        source: string[] | null;
        target: string[] | null;
    };
    movementPreview: {
        sourceQuantity: number;
        targetQuantity: number;
        sourceLotId: number;
        sourceInventoryLotId: number;
        sourceBatchNo: string;
        targetLotId: number;
        targetInventoryLotId: number | null;
        targetBatchNo: string;
    };
    linePreviews: LotTransferLinePreview[];
    totalQuantity: number;
}

export interface LotTransferLinePreview {
    detailId: number | null;
    lineNo: number;
    productId: number;
    quantity: number;
    lineRemarks: string;
    checks: ValidationCheck[];
    source: LotBalanceSnapshot;
    target: LotBalanceSnapshot;
    sourceLotCapacity: number | null;
    sourceLotOccupiedBefore: number;
    targetLotCapacity: number | null;
    targetLotOccupiedBefore: number;
    targetLotCapacityRemaining: number | null;
    effectiveExpiryDate: string | null;
    destinationBatchResolution: DestinationBatchResolution;
    movementPreview: LotTransferPreview["movementPreview"];
}
