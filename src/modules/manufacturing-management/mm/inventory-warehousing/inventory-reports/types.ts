export type StockStatus = "out_of_stock" | "low_stock" | "healthy" | "zero_threshold";

export interface BatchDetail {
    batchNo: string;
    lotId: number | null;
    lotName: string;
    branchId: number;
    branchName?: string;
    onhandQuantity: number;
    manufacturingDate: string | null;
    expirationDate: string | null;
    inventoryCondition: string;
    isNegativeDiscrepancy: boolean;
}

export interface ProductBranchStock {
    branchId: number;
    branchName: string;
    branchCode?: string;
    onhandQuantity: number;
    maintainingQuantity: number;
    deficitQuantity: number;
    isBelowMaintaining: boolean;
    isOutOfStock: boolean;
}

export interface InventoryReportProduct {
    productId: number;
    productName: string;
    productCode: string;
    productTypeId: number | null;
    productTypeName: string;
    categoryId: number | null;
    categoryName: string;
    uomId: number | null;
    uomName: string;
    uomShortcut: string;
    unitCost: number;
    maintainingQuantity: number;
    onHandQuantity: number;
    deficitQuantity: number;
    isBelowMaintaining: boolean;
    stockStatus: StockStatus;
    estimatedReplenishmentCost: number;
    batches: BatchDetail[];
    branchStock?: ProductBranchStock[];
}

export interface InventoryReportMetrics {
    totalProducts: number;
    belowMaintainingCount: number;
    outOfStockCount: number;
    lowStockCount: number;
    totalDeficitQuantity: number;
    totalReplenishmentCost: number;
}

export interface BranchLookup {
    id: number;
    name: string;
    code: string;
}

export interface CategoryLookup {
    id: number;
    name: string;
}

export interface ProductTypeLookup {
    id: number;
    name: string;
}

export interface InventoryReportApiResponse {
    success: boolean;
    summary: InventoryReportMetrics;
    filters: {
        branchId: number | null;
        categoryId: number | null;
        productTypeId: number | null;
        status: string;
        search: string;
    };
    categories: CategoryLookup[];
    branches: BranchLookup[];
    productTypes: ProductTypeLookup[];
    data: InventoryReportProduct[];
    error?: string;
}

export interface InventoryReportFilterState {
    branchId: number | null;
    categoryId: number | null;
    productTypeId: number | null;
    status: "below_maintaining" | "out_of_stock" | "low_stock" | "healthy" | "zero_threshold" | "all";
    search: string;
}
