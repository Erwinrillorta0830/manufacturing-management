export interface ProfitabilityOption {
    id: number;
    label: string;
}

export interface ProfitabilityMaterialLine {
    productName: string;
    productCode: string;
    lotNumber: string;
    batchNumber: string;
    quantity: number;
    unitCost: number | null;
    totalCost: number | null;
}

export interface ProfitabilityLaborLine {
    operatorName: string;
    operationName: string;
    hours: number;
    hourlyRate: number | null;
    batchCost: number | null;
}

export interface ProfitabilityOverheadLine {
    operationName: string;
    workCenterName: string;
    hours: number;
    hourlyRate: number | null;
    batchCost: number | null;
}

export interface ProfitabilityBatchDetails {
    materials: ProfitabilityMaterialLine[];
    labor: ProfitabilityLaborLine[];
    overhead: ProfitabilityOverheadLine[];
}

export interface ProfitabilityBatchDetailsState {
    status: "loading" | "loaded" | "error";
    detail?: ProfitabilityBatchDetails;
    error?: string;
}

export interface JobOrderProfitabilityRow {
    key: string;
    yieldLedgerId: number;
    jobOrderId: number;
    jobOrderNo: string;
    salesOrderNumbers: string[];
    productId: number;
    productName: string;
    productCode: string;
    branchId: number | null;
    branchName: string;
    status: string;
    manufacturingDate: string | null;
    batchNumber: string;
    lotNumber: string;
    uom: string;
    goodQuantity: number;
    rejectedQuantity: number;
    allocatedQuantity: number;
    unallocatedQuantity: number;
    directMaterialsCost: number | null;
    directLaborCost: number | null;
    manufacturingOverheadCost: number | null;
    totalBatchCogs: number | null;
    allocatedCogs: number | null;
    unallocatedCogs: number | null;
    revenue: number | null;
    grossProfit: number | null;
    grossMarginPercent: number | null;
    complete: boolean;
    incompleteReasons: string[];
}

export interface JobOrderProfitabilityExportRow extends JobOrderProfitabilityRow {
    detail: ProfitabilityBatchDetails;
}

export interface JobOrderProfitabilityFilters {
    search: string;
    branchId: string;
    productId: string;
    status: string;
    dateFrom: string;
    dateTo: string;
}

export interface JobOrderProfitabilityPayload {
    rows: JobOrderProfitabilityRow[];
    branches: ProfitabilityOption[];
    products: ProfitabilityOption[];
    statuses: string[];
    page: number;
    pageSize: number;
    totalRows: number;
    pageCount: number;
    summary: {
        batchCount: number;
        completeBatchCount: number;
        incompleteBatchCount: number;
        revenue: number;
        cogs: number;
        grossProfit: number;
        grossMarginPercent: number | null;
        unallocatedOutput: number;
    };
}

export interface JobOrderProfitabilityExportPayload extends Omit<JobOrderProfitabilityPayload, "rows"> {
    rows: JobOrderProfitabilityExportRow[];
}

export interface JobOrderProfitabilityRequest {
    filters: JobOrderProfitabilityFilters;
    page?: number;
    pageSize?: number;
    allRows?: boolean;
    includeOptions?: boolean;
}
