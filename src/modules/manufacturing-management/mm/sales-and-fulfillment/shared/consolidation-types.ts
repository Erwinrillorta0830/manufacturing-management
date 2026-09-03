// Exact DB enum values from consolidator.status
export type ConsolidationStatus =
    | "Pending"
    | "For Picking"
    | "Picking"
    | "Picked"
    | "Audited"
    | "For Fulfillment"
    | "Dispatched"
    | "Delivered";

// Human-readable display labels mapped from DB status
export const CONSOLIDATION_STATUS_LABEL: Record<ConsolidationStatus, string> = {
    Pending:           "Draft",
    "For Picking":     "Ready for Picking",
    Picking:           "Picking",
    Picked:            "For Approval",
    Audited:           "Approved",
    "For Fulfillment": "For Fulfillment",
    Dispatched:        "Dispatched",
    Delivered:         "Delivered",
};

export interface StatusSummary {
    Pending: number;
    "For Picking": number;
    Picking: number;
    Picked: number;
    Audited: number;
    "For Fulfillment": number;
    Dispatched: number;
    Delivered: number;
    All: number;
}

export interface ConsolidatorInvoiceProduct {
    productId: number;
    productName: string;
    productCode: string;
    quantity: number;
    versionId: number | null;
    versionName: string | null;
}

export interface ConsolidatorInvoice {
    id: number;
    consolidatorId: number;
    invoiceId: number;
    invoiceNo: string;
    branchId: number;
    customerName: string;
    createdAt: string;
    products?: ConsolidatorInvoiceProduct[];
}

export interface ConsolidatorDetail {
    id: number;
    consolidatorId: number;
    productId: number;
    productName: string;
    productCode: string;
    brand: string;
    category: string;
    unit: string;
    orderedQuantity: number;
    pickedQuantity: number;
    appliedQuantity: number;
    pickedById: number | null;
    pickedAt: string | null;
}

export interface InvoiceConsolidation {
    id: number;
    consolidatorNo: string;
    status: ConsolidationStatus;
    createdBy: number;
    checkedBy: number | null;
    branchId: number;
    branchName: string;
    totalSalesOrderAmount: number;
    createdAt: string;
    updatedAt: string;
    details: ConsolidatorDetail[];
    dispatches: unknown[];
    invoices: ConsolidatorInvoice[];
}

export interface CandidateProductLine {
    productId: number;
    productName: string;
    productCode: string;
    quantity: number;
    versionId: number | null;
    versionName: string | null;
}

export interface CandidateInvoice {
    invoiceId: number;
    invoiceNo: string;
    invoiceDate: string;
    grossAmount: number;
    netAmount: number;
    branchId: number;
    customerCode: string;
    customerName: string;
    businessName?: string;
    products: CandidateProductLine[];
}

export interface CreateConsolidationPayload {
    branchId: number;
    invoiceIds: number[];
}

export interface AllocationPreview {
    allocations: {
        productId: number;
        productName: string;
        productCode: string;
        inventoryLotId: number;
        lotId: number;
        lotName: string;
        batchNo: string;
        expiryDate: string | null;
        quantity: number;
    }[];
    shortages: {
        productId: number;
        productName: string;
        quantity: number;
    }[];
}

export interface AuditPayload {
    batchId: number;
}

export interface LotPickedItem {
    productId: number;
    lotId?: number;
    batchNo: string;
    expiryDate?: string | null;
    pickedQuantity: number;
    capacity: number;
    reservationIds?: number[];
    inventoryLotId?: number;
}

export interface PickingSavePayload {
    batchId: number;
    quantities: { detailId: number; pickedQuantity: number }[];
    pickedReservationIds?: number[];
    pickedLotIds?: number[];
    lotPickedItems?: LotPickedItem[];
}

export interface OrderDistributionItem {
    orderId: number;
    invoiceId?: number;
    productId: number;
    pickedQuantity: number;
}

export interface CompletePickingPayload {
    batchId: number;
    orderDistributions?: OrderDistributionItem[];
}

export interface Branch {
    id: number;
    branchName: string;
    branchCode: string;
}
