export type LotTransferStatus = "Draft" | "For Approval" | "Approved" | "Rejected";

export type LotTransferMode = "request" | "approval" | "summary";

export interface LotTransfer {
    id: number;
    requestNo: string;
    status: LotTransferStatus;
    branchId: number;
    productId: number;
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
    submittedAt: string | null;
    approvedBy: number | null;
    approvedByName: string | null;
    approvedAt: string | null;
    rejectedBy: number | null;
    rejectedByName: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
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
    postingStartedAt: string | null;
    reconciliationRequired: boolean;
    postingError: string | null;
    createdAt: string | null;
    updatedAt: string | null;
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
}

export interface LotTransferForm {
    branchId: string;
    productId: string;
    sourceLotId: string;
    sourceInventoryLotId: string;
    sourceBatchNo: string;
    targetLotId: string;
    targetInventoryLotId: string;
    targetBatchNo: string;
    quantity: string;
    reason: string;
}

export const EMPTY_LOT_TRANSFER_FORM: LotTransferForm = {
    branchId: "",
    productId: "",
    sourceLotId: "",
    sourceInventoryLotId: "",
    sourceBatchNo: "",
    targetLotId: "",
    targetInventoryLotId: "",
    targetBatchNo: "",
    quantity: "",
    reason: ""
};
