export interface LaborEfficiencyOption {
    id: number;
    label: string;
}

export interface LaborEfficiencyFilters {
    branchId: string;
    productId: string;
    status: string;
    dateFrom: string;
    dateTo: string;
    jobOrder: string;
}

export type LaborEfficiencySortKey =
    | "jobOrderNo"
    | "productName"
    | "branchName"
    | "status"
    | "goodOutputQuantity"
    | "standardHours"
    | "actualHours"
    | "varianceHours"
    | "efficiencyPercent"
    | "productivity";

export type LaborEfficiencyExportFormat = "xlsx" | "pdf";

export interface LaborStandardLine {
    positionName: string;
    routeName: string;
    manpowerCount: number;
    hoursRequired: number | null;
    standardHoursPerBatch: number | null;
    earnedStandardHours: number | null;
}

export interface ActualLaborLine {
    operatorName: string;
    operationName: string;
    loggedHours: number;
    runningHours: number;
    totalHours: number;
    timerRunning: boolean;
}

export interface LaborEfficiencyRow {
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    productName: string;
    productCode: string;
    branchId: number | null;
    branchName: string;
    status: string;
    createdAt: string | null;
    versionId: number | null;
    targetQuantity: number;
    goodOutputQuantity: number;
    uom: string;
    standardHours: number | null;
    actualHours: number;
    varianceHours: number | null;
    efficiencyPercent: number | null;
    productivity: number | null;
    provisional: boolean;
    incompleteReasons: string[];
    standardLines: LaborStandardLine[];
    actualLines: ActualLaborLine[];
}

export interface LaborEfficiencySummary {
    comparableCount: number;
    incompleteCount: number;
    standardHours: number;
    actualHours: number;
    varianceHours: number;
    efficiencyPercent: number | null;
    productivityByUom: Array<{ uom: string; goodOutputQuantity: number; actualHours: number; productivity: number | null }>;
}

export interface LaborEfficiencyReportPayload {
    rows: LaborEfficiencyRow[];
    branches: LaborEfficiencyOption[];
    products: LaborEfficiencyOption[];
    page: number;
    pageSize: number;
    totalRows: number;
    pageCount: number;
    summary: LaborEfficiencySummary;
}

export interface LaborEfficiencyReportRequest {
    filters: LaborEfficiencyFilters;
    page?: number;
    pageSize?: number;
    sortKey?: LaborEfficiencySortKey;
    sortDirection?: "asc" | "desc";
}
