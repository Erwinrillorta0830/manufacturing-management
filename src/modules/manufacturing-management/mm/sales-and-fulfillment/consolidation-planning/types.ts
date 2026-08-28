export type ConsolidationStatus = "Pending" | "Picking" | "Picked" | "Audited";

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

export interface StatusSummary {
    Pending: number;
    Picking: number;
    Picked: number;
    Audited: number;
    All: number;
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

export interface PickingSavePayload {
    batchId: number;
    quantities: { detailId: number; pickedQuantity: number }[];
}

export interface Branch {
    id: number;
    branchName: string;
    branchCode: string;
}
