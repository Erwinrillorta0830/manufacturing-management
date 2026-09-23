export type CostVarianceCategory = "directMaterials" | "directLabor" | "manufacturingOverhead" | "total";

export interface CostComparison {
    standard: number | null;
    actual: number | null;
    variance: number | null;
    variancePercent: number | null;
    complete: boolean;
}

export interface MaterialConsumptionLine {
    productId: number;
    productName: string;
    lotNumber: string;
    consumedQuantity: number;
    currentUnitCost: number | null;
    actualCost: number | null;
}

export interface LaborCostLine {
    operatorName: string;
    operationName: string;
    hours: number;
    hourlyRate: number | null;
    actualCost: number | null;
}

export interface OverheadCostLine {
    operationName: string;
    workCenterName: string;
    hours: number;
    hourlyRate: number | null;
    actualCost: number | null;
}

export interface StandardVsActualCostRow {
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
    provisional: boolean;
    incompleteReasons: string[];
    costs: {
        directMaterials: CostComparison;
        directLabor: CostComparison;
        manufacturingOverhead: CostComparison;
        total: CostComparison;
    };
    detail: {
        materials: MaterialConsumptionLine[];
        labor: LaborCostLine[];
        overhead: OverheadCostLine[];
    };
}

export interface CostVarianceOption {
    id: number;
    label: string;
}

export interface StandardVsActualCostReportPayload {
    rows: StandardVsActualCostRow[];
    branches: CostVarianceOption[];
    products: CostVarianceOption[];
    page: number;
    pageSize: number;
    totalRows: number;
    pageCount: number;
    summary: {
        comparableCount: number;
        incompleteCount: number;
        standard: number;
        actual: number;
        variance: number;
    };
}

export interface StandardVsActualCostFilters {
    branchId: string;
    productId: string;
    status: string;
    dateFrom: string;
    dateTo: string;
    jobOrder: string;
}

export interface StandardVsActualCostReportRequest {
    filters: StandardVsActualCostFilters;
    page?: number;
    pageSize?: number;
    allRows?: boolean;
    includeOptions?: boolean;
}
