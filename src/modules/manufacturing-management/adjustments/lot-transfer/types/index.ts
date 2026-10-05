export type LotTransferStatus =
  | "Draft"
  | "Submitted"
  | "Approved"
  | "Posted"
  | "Rejected"
  | "Cancelled"
  | "Reversed";

export type LotTransferMode =
  | "request"
  | "approval"
  | "posting"
  | "summary"
  | "create"
  | "edit"
  | "detail";

export type DestinationBatchResolutionAction = "MERGE" | "CREATE";

export interface BranchOption {
  id: number;
  branchName: string;
  branchCode?: string;
  isActive: boolean;
}

export interface ProductTypeOption {
  id: number;
  name: string;
  typeName?: string;
  description?: string;
}


export interface LotTransferDetail {
  detailId?: number;
  lotTransferId?: number;
  lineNo: number;
  productId: number;
  productName?: string;
  productCode?: string;
  productDescription?: string;
  sourceInventoryLotId: number;
  sourceBatchNo: string;
  targetInventoryLotId?: number | null;
  targetBatchNo: string;
  quantity: number;
  lineRemarks?: string;
  sourceManufacturingDate?: string | null;
  sourceExpiryDate?: string | null;
  targetManufacturingDate?: string | null;
  targetExpiryDate?: string | null;
  sourceUnitCost?: number | null;
  targetUnitCost?: number | null;
  sourceBalanceBefore?: number | null;
  sourceBalanceAfter?: number | null;
  targetBalanceBefore?: number | null;
  targetBalanceAfter?: number | null;
  sourceMovementId?: number | null;
  targetMovementId?: number | null;
  destinationBatchAction?: DestinationBatchResolutionAction | null;
  validationStatus?: string | null;
  validationError?: string | null;
  postingError?: string | null;
  reconciliationRequired?: boolean;
}

export interface LotTransfer {
  id: number;
  requestNo: string;
  status: LotTransferStatus;
  branchId: number;
  branchName?: string;
  branchCode?: string;
  transferDate: string;
  unitId: number;
  unitName?: string;
  sourceLotId: number;
  sourceLotName?: string;
  targetLotId: number;
  targetLotName?: string;
  quantity: number;
  reason: string;
  requestedBy?: number | null;
  requestedByName?: string | null;
  requestedAt?: string | null;
  submittedBy?: number | null;
  submittedByName?: string | null;
  submittedAt?: string | null;
  approvedBy?: number | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  rejectedBy?: number | null;
  rejectedByName?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  qaEvidence?: string | null;
  postedBy?: number | null;
  postedByName?: string | null;
  postedAt?: string | null;
  cancelledBy?: number | null;
  cancelledByName?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  reversedBy?: number | null;
  reversedByName?: string | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
  reversalOfId?: number | null;
  idempotencyKey?: string | null;
  postingStartedAt?: string | null;
  postingError?: string | null;
  reconciliationRequired?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  lineCount?: number;
  details: LotTransferDetail[];
}

export interface LotTransferStatusHistory {
  id: number;
  lotTransferId: number;
  oldStatus: LotTransferStatus | null;
  newStatus: LotTransferStatus;
  changedBy: number | null;
  changedByName: string | null;
  changedAt: string;
  remarks: string;
}

export interface LotTransferMovementHistory {
  movementId: number;
  lotTransferId: number;
  detailId: number | null;
  transactionTypeId: number | null;
  transactionType: string;
  movementDirection: "IN" | "OUT" | "UNKNOWN";
  sourceDocumentNo: string | null;
  productId: number;
  productName?: string;
  branchId: number;
  mmLotId: number | null;
  lotName?: string;
  batchNo: string;
  quantity: number;
  manufacturingDate: string | null;
  expirationDate: string | null;
  createdBy: number | null;
  createdByName?: string | null;
  createdAt: string | null;
  remarks: string | null;
}

export interface LotTransferFormLine {
  lineNo: number;
  productId: number;
  productName: string;
  productCode?: string;
  productDescription?: string;
  uomName?: string;
  productTypeId?: number | null;
  productTypeName?: string;
  productClassification?: "RM" | "PKG" | "FG" | "OTHER";
  sourceInventoryLotId: number;
  sourceBatchNo: string;
  sourceOnHand: number;
  sourceExpiryDate?: string | null;
  sourceManufacturingDate?: string | null;
  sourceUnitCost?: number | null;
  targetInventoryLotId?: number | null;
  targetBatchNo: string;
  quantity: number;
  lineRemarks?: string;
}

export interface LotTransferFormValues {
  branchId: number;
  productTypeId?: number | null;
  productTypeName?: string;
  transferDate: string;
  sourceLotId: number;
  targetLotId: number;
  reason: string;
  lines: LotTransferFormLine[];
}

export interface LotTransferFilter {
  search?: string;
  status?: LotTransferStatus | LotTransferStatus[];
  branchId?: number;
  dateFrom?: string;
  dateTo?: string;
  productId?: number;
  sourceLotId?: number;
  targetLotId?: number;
  batchNo?: string;
  limit?: number;
  offset?: number;
}

export interface LotTransferLookupDictionaries {
  lots: Array<{
    lotId: number;
    lotName: string;
    branchId: number;
    unitId: number | null;
    maxBatchCapacity: number;
    status: string;
  }>;
  branches: BranchOption[];
  units: Array<{
    unitId: number;
    unitName: string;
    unitShortcut?: string;
  }>;
  users: Array<{
    userId: number;
    fullName: string;
    fname?: string;
    lname?: string;
  }>;
  products: Array<{
    productId: number;
    productName: string;
    productCode?: string;
    description?: string;
    unitCost?: number;
  }>;
  maps: {
    lotNames: Record<string, string>;
    branchNames: Record<string, string>;
    unitNames: Record<string, string>;
    userNames: Record<string, string>;
    productNames: Record<string, string>;
    productDescriptions?: Record<string, string>;
  };
}
