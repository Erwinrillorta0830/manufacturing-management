export type WarehouseReceiptType = "full" | "partial";

export type WarehouseReceivingStatus = "Approved" | "Partially Received" | "Warehouse Receiving" | "Receiving (QA)";

export interface WarehouseReceivingSupplierOption {
    id: number;
    name: string;
}

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
    referenceNumber: string | null;
    supplierName: string;
    branch: { id: number; name: string; code: string };
    branchId: number;
    supplierId: number | null;
    status: WarehouseReceivingStatus;
    inventoryStatus: number;
    workflowRevision: number;
    currencyCode: string;
    totalAmount: number;
    totalPhpAmount: number;
    totalForeignAmount: number | null;
    dateApproved: string | null;
    warehouseReceivingAt: string | null;
    warehouseReceivedBy: number | null;
    remarks: string;
    lines: WarehouseReceivingLine[];
    draft: WarehouseReceivingDraft | null;
}

export interface WarehouseReceivingQueueResponse {
    items: WarehouseReceivingOrder[];
    page: number;
    limit: number;
    total: number;
    supplierOptions: WarehouseReceivingSupplierOption[];
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
