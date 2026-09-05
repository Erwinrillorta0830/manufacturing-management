export type WarehouseReceiptType = "full" | "partial";

export type WarehouseReceivingStatus = "Approved" | "Warehouse Receiving" | "Receiving (QA)";

export interface WarehouseReceivingLine {
    lineId: number;
    productId: number;
    productName: string;
    productCode: string;
    orderedQuantity: number;
    previouslyReceivedQuantity: number;
    currentReceivedQuantity: number;
    remainingQuantity: number;
    allowableQuantity: number;
    unitPrice: number;
    totalAmount: number;
}

export interface WarehouseReceivingDraft {
    id: number;
    receiptNumber: string;
    receiptDate: string;
    receiptType: WarehouseReceiptType;
    quantityStatus: "FULL" | "PARTIAL";
    postingStatus: string;
}

export interface WarehouseReceivingOrder {
    id: number;
    poNumber: string;
    purchaseOrderNumber: string;
    supplierName: string;
    branch: { id: number; name: string; code: string };
    branchId: number;
    status: WarehouseReceivingStatus;
    inventoryStatus: number;
    workflowRevision: number;
    currencyCode: string;
    totalAmount: number;
    lines: WarehouseReceivingLine[];
    draft: WarehouseReceivingDraft | null;
}

export interface WarehouseReceivingQueueResponse {
    items: WarehouseReceivingOrder[];
    page: number;
    limit: number;
    total: number;
}

export interface WarehouseReceivingCommand {
    action: "start" | "save_draft" | "submit_to_qa";
    purchaseOrderId: number;
    workflowRevision: number;
    idempotencyKey?: string;
    receiptNumber?: string;
    receiptType?: WarehouseReceiptType;
    receiptDate?: string;
    branchId?: number;
    lines?: Array<{
        lineId: number;
        productId: number;
        receivedQuantity: number;
    }>;
}
