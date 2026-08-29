// src/modules/manufacturing-management/product-tracing/types.ts

export type MovementDirection = "IN" | "OUT";

export type InventoryCondition = "GOOD" | "EXPIRED" | "DAMAGED" | "QUARANTINED" | string;

export interface MMInventoryMovement {
    movementKey: string;
    transactionType: string;
    movementDirection: MovementDirection | string;
    sourceModule: string;
    referenceId: number;
    referenceDetailId?: number | null;
    referenceNo: string;
    transactionDate: string;
    postedAt: string;
    postedBy: number;
    branchId: number;
    inventoryLotId: number;
    lotId: number;
    productId: number;
    productCode?: string;
    productName?: string;
    productTypeId?: number;
    productTypeName?: string;
    unitId?: number;
    batchNo: string;
    manufacturingDate?: string | null;
    expirationDate?: string | null;
    inventoryCondition: InventoryCondition;
    quantityIn: number;
    quantityOut: number;
    unitCost: number;
    differenceCost: number;
    remarks?: string | null;
    stockType?: string | null;
    sourceStatus: string;

    // Optional computed / augmented fields for display & grouping
    branchName?: string;
    lotName?: string;
    unitName?: string;
    unitShortcut?: string;
    runningBalance?: number;
    runningValuation?: number;
}

// Backwards compatibility alias
export type ProductMovementRow = MMInventoryMovement;

export interface ProductTracingFiltersType {
    branch_id: number | null;
    product_type_id: number | null;
    product_id: number | null;
    lot_id: number | null;
    batch_no?: string;
    transaction_type?: string;
    movement_direction?: "ALL" | "IN" | "OUT";
    inventory_condition?: "ALL" | "GOOD" | "EXPIRED" | "DAMAGED" | "QUARANTINED";
    search_query?: string;
    startDate: string | null;
    endDate: string | null;
    branchName?: string | null;
    productName?: string | null;
    dateRangeMode?: "preset" | "manual";
    datePreset?: "all" | "today" | "7days" | "month" | "custom";
}

export interface BranchLookup {
    id: number;
    branchName: string;
    branchCode?: string;
    branch_name?: string;
}

export interface ProductTypeLookup {
    id: number | string;
    name: string;
    type_name?: string;
    description?: string;
}

export interface ProductLookup {
    productId: number;
    productName: string;
    description?: string;
    productCode?: string;
    skuCode?: string;
    productTypeId?: number;
    unitName?: string;
    costPerUnit?: number | null;
}

export interface LotLookup {
    lotId: number;
    lotName: string;
    branchId: number;
    description?: string | null;
    status: string;
}

export interface MovementSummaryStats {
    totalRecords: number;
    totalIn: number;
    totalOut: number;
    netMovement: number;
    totalInValuation: number;
    totalOutValuation: number;
    netValuation: number;
    goodBatchesCount: number;
    quarantinedBatchesCount: number;
    expiredBatchesCount: number;
    damagedBatchesCount: number;
    distinctProductsCount: number;
    distinctBatchesCount: number;
}

