export type LotTransferStatus = "Draft" | "Submitted" | "Approved" | "Posted" | "Rejected" | "Cancelled";

export type LotTransferMode = "request" | "approval" | "posting" | "summary";

export interface LotTransferReportFilters {
    search: string;
    statuses: LotTransferStatus[];
    branchId: string;
    requestedFrom: string;
    requestedTo: string;
    transferDateFrom: string;
    transferDateTo: string;
    productId: string;
    sourceLotId: string;
    targetLotId: string;
    sourceBatchNo: string;
    targetBatchNo: string;
    requestedBy: string;
    approvedBy: string;
    postedBy: string;
}

export interface UserOption {
    id: number;
    name: string;
}

export const DEFAULT_LOT_TRANSFER_REPORT_FILTERS: LotTransferReportFilters = {
    search: "",
    statuses: ["Posted", "Rejected", "Cancelled"],
    branchId: "",
    requestedFrom: "",
    requestedTo: "",
    transferDateFrom: "",
    transferDateTo: "",
    productId: "",
    sourceLotId: "",
    targetLotId: "",
    sourceBatchNo: "",
    targetBatchNo: "",
    requestedBy: "",
    approvedBy: "",
    postedBy: ""
};

export interface LotTransfer {
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
    targetInventoryLotId: number;
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
    postingStartedAt: string | null;
    reconciliationRequired: boolean;
    postingError: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    details: LotTransferDetail[];
    lineCount: number;
    totalQuantity: number;
}

export interface LotTransferDetail {
    detailId: number | null;
    lineNo: number;
    productId: number;
    sourceInventoryLotId: number;
    sourceBatchNo: string;
    targetInventoryLotId: number;
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
}

export interface ProductOption {
    productId: number;
    productName: string;
    skuCode: string;
    unitCost: number;
}

export interface LotOption {
    lotId: number;
    lotName: string;
    branchId: number;
    uomId: number | null;
    uomName: string;
    maxBatchCapacity: number;
    status: string;
}

export interface BatchOption {
    batchId: number;
    batchNumber: string;
    lotId: number;
    lotName: string;
    branchId: number;
    productId: number;
    productName: string;
    quantity: number;
    unitCost: number;
    uomId: number | null;
    uomName: string;
    manufacturingDate: string;
    expirationDate: string;
    qaStatus: string;
    status: string;
}

export interface BranchOption {
    id: number;
    branchName: string;
    branchCode: string;
}

export interface ValidationCheck {
    key: string;
    label: string;
    passed: boolean;
    message: string;
}

export interface LotBalanceSnapshot {
    lotId: number;
    inventoryLotId: number;
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
        targetInventoryLotId: number;
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
    movementPreview: LotTransferPreview["movementPreview"];
}

export interface LotTransferForm {
    branchId: string;
    sourceLotId: string;
    targetLotId: string;
    reason: string;
    details: LotTransferFormDetail[];
}

export interface LotTransferFormDetail {
    detailId?: number;
    lineNo: number;
    productId: string;
    sourceInventoryLotId: string;
    sourceBatchNo: string;
    targetInventoryLotId: string;
    targetBatchNo: string;
    quantity: string;
    lineRemarks: string;
}

export const EMPTY_LOT_TRANSFER_FORM: LotTransferForm = {
    branchId: "",
    sourceLotId: "",
    targetLotId: "",
    reason: "",
    details: []
};
