export const PURCHASE_ORDER_PRINT_DOCUMENT_TYPES = [
    "PURCHASE_ORDER",
    "FINANCE_DECISION",
    "QA_GOODS_RECEIPT",
    "STORAGE_LOT_ALLOCATION",
    "LANDED_COST"
] as const;

export type PurchaseOrderPrintDocumentType = typeof PURCHASE_ORDER_PRINT_DOCUMENT_TYPES[number];

export interface CompanyHeaderSnapshot {
    name: string;
    address: string;
    contact: string;
    email: string;
    logoDataUrl: string | null;
}

export interface PurchaseOrderPrintTemplate {
    name: string;
    version: string;
}

export interface PurchaseOrderPrintLine {
    lineId: number;
    productId: number | null;
    productCode: string;
    productName: string;
    categoryType: string;
    unit: string;
    orderedQuantity: number;
    receivedQuantity: number;
    acceptedQuantity: number;
    rejectedQuantity: number;
    unitPrice: number;
    unitPriceForeign: number;
    allocatedExpense: number;
    finalLandedUnitCost: number;
    discountAmount: number;
    netAmount: number;
    purchaseIntent: string;
    jobOrder: string;
    batchNumber: string;
    expirationDate: string;
}

export interface PurchaseOrderPrintHeader {
    id: number;
    purchaseOrderNumber: string;
    reference: string;
    encodedAt: string;
    supplier: string;
    supplierAddress: string;
    branch: string;
    paymentTerms: string;
    paymentMode: string;
    paymentArrangement: string;
    priceType: string;
    currencyCode: string;
    exchangeRate: number;
    inventoryStatus: string;
    paymentStatus: string;
    workflowRevision: number;
    totalAmount: number;
    grossAmount: number;
    totalForeignCurrency: number;
    remark: string;
    isPosted: boolean;
    isPostedAmounts: boolean;
    isForceReceived: boolean;
    forceReceivedAt: string;
    forceReceivedReason: string;
}

export interface ApprovalPrintEntry {
    historyId: number;
    action: string;
    stage: string;
    actor: string;
    actorRole: string;
    remarks: string;
    fromStatus: string;
    toStatus: string;
    revisionBefore: number;
    revisionAfter: number;
    createdAt: string;
    snapshotAvailable: boolean;
}

export interface ReceivingPrintRecord {
    receivingRecordId: number;
    headerId: number | null;
    receiptNumber: string;
    product: string;
    productCode: string;
    branch: string;
    storageLot: string;
    batchNumber: string;
    manufacturingDate: string;
    expirationDate: string;
    receivedQuantity: number;
    acceptedQuantity: number;
    rejectedQuantity: number;
    overDeliveryQuantity: number;
    qaStatus: string;
    rejectionReason: string;
    unitCost: number;
    finalLandedUnitCost: number;
    isReplacement: boolean;
    receivedDate: string;
}

export interface StorageMovementPrintRecord {
    movementId: number;
    kind: string;
    product: string;
    productCode: string;
    storageLot: string;
    branch: string;
    quantity: number;
    transactionType: string;
    sourceDocument: string;
    batchNumber: string;
}

export interface StorageAllocationPrintRecord {
    allocationId: number;
    product: string;
    jobOrder: string;
    material: string;
    quantity: number;
    inventoryLots: string;
}

export interface LandedCostExpensePrintRecord {
    expenseId: number | null;
    expenseType: string;
    account: string;
    amount: number;
}

export interface LandedCostAllocationPrintRecord {
    allocationId: number | null;
    lineId: number | null;
    product: string;
    quantity: number;
    baseUnitCost: number;
    allocatedExpense: number;
    finalLandedUnitCost: number;
    allocationPercent: number | null;
}

export interface LandedCostPrintSnapshot {
    computationId: number;
    status: string;
    allocationRule: string;
    finalizedAt: string;
    totalLandedFee: number;
    roundingVariance: number;
    expenses: LandedCostExpensePrintRecord[];
    allocations: LandedCostAllocationPrintRecord[];
    attachments: string[];
}

export interface PurchaseOrderPrintableSnapshot {
    documentType: PurchaseOrderPrintDocumentType;
    generatedAt: string;
    generatedBy: string;
    company: CompanyHeaderSnapshot;
    template: PurchaseOrderPrintTemplate;
    purchaseOrder: PurchaseOrderPrintHeader;
    lines: PurchaseOrderPrintLine[];
    approvals: ApprovalPrintEntry[];
    selectedApproval: ApprovalPrintEntry | null;
    receivingRecords: ReceivingPrintRecord[];
    movements: StorageMovementPrintRecord[];
    allocations: StorageAllocationPrintRecord[];
    landedCost: LandedCostPrintSnapshot | null;
    sourceReceivingHeaderId: number | null;
}
