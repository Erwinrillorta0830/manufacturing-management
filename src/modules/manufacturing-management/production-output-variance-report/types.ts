export interface ProductionOutputVarianceRow {
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    productName: string;
    productCode: string;
    uom: string;
    branchId: number | null;
    branchName: string;
    status: string;
    plannedQuantity: number;
    actualGoodQuantity: number;
    rejectedQuantity: number;
    quantityVariance: number;
    quantityVariancePercent: number | null;
    plannedCompletionDate: string | null;
    actualCompletionDate: string | null;
    completionVarianceDays: number | null;
}

export interface ProductionOutputVariancePayload {
    rows: ProductionOutputVarianceRow[];
    totalCount: number;
    page: number;
    pageSize: number;
    summary: ProductionOutputVarianceSummary;
}

export interface ProductionOutputVarianceExportPayload {
    rows: ProductionOutputVarianceRow[];
    totalCount: number;
}

export interface ProductionOutputVarianceFilterOptions {
    branches: Array<{ id: number; label: string }>;
    products: Array<{ id: number; label: string }>;
    statuses: string[];
}

export interface ProductionOutputVarianceRequest {
    filters: ProductionOutputVarianceFilters;
    page: number;
    pageSize: number;
    sortKey: ProductionOutputVarianceSortKey;
    sortDirection: "asc" | "desc";
}

export interface ProductionOutputVarianceFilters {
    search: string;
    branchId: string;
    productId: string;
    status: string;
    dateFrom: string;
    dateTo: string;
}

export type ProductionOutputVarianceSortKey =
    | "jobOrderNo"
    | "productName"
    | "branchName"
    | "status"
    | "plannedQuantity"
    | "actualGoodQuantity"
    | "rejectedQuantity"
    | "quantityVariance"
    | "quantityVariancePercent"
    | "plannedCompletionDate"
    | "actualCompletionDate"
    | "completionVarianceDays";

export interface ProductionOutputVarianceSummary {
    jobCount: number;
    quantitiesByUom: Array<{
        uom: string;
        plannedQuantity: number;
        actualGoodQuantity: number;
        rejectedQuantity: number;
        quantityVariance: number;
    }>;
}
