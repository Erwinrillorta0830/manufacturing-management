// ─── Directus Response Types (snake_case matching mm_lots & mm_inventory_lots) ───────

export interface DirectusMmLot {
    lot_id: number;
    lot_name: string;
    branch_id: number | { id: number; name: string } | null;
    unit_id?: number | { unit_id: number; unit_name: string; unit_shortcut?: string } | null;
    uom_id?: number | { unit_id: number; unit_name: string; unit_shortcut?: string } | null;
    max_batch_capacity: number;
    description?: string | null;
    status: "ACTIVE" | "CLOSED" | "INACTIVE";
    created_at: string;
    updated_at: string;
    created_by: number | { user_id: number; user_fname?: string; user_lname?: string } | null;
    updated_by: number | { user_id: number; user_fname?: string; user_lname?: string } | null;
}

export interface DirectusMmInventoryLot {
    inventory_lot_id: number;
    lot_id: number | { lot_id: number; lot_name: string } | null;
    branch_id: number | { id: number; name: string } | null;
    product_id: number | { product_id: number; product_name?: string; sku_code?: string; product_code?: string } | null;
    batch_no: string;
    manufacturing_date?: string | null;
    expiry_date?: string | null;
    unit_cost: number;
    qa_status: "GOOD" | "DAMAGED" | "QUARANTINED" | "EXPIRED";
    status: "ACTIVE" | "CLOSED" | "INACTIVE";
    source_type?: string | null;
    source_reference?: string | null;
    remarks?: string | null;
    created_at: string;
    updated_at: string;
    created_by?: number | { user_id: number; user_fname?: string; user_lname?: string } | null;
    updated_by?: number | { user_id: number; user_fname?: string; user_lname?: string } | null;
}

export interface DirectusUnit {
    unit_id: number;
    unit_name: string;
    unit_shortcut?: string | null;
    order?: number | null;
    sku_code?: string | null;
}

// ─── Frontend Types (camelCase) ──────────────────────────────────────

export interface Lot {
    lotId: number;
    lotName: string;
    branchId: number;
    uomId: number | null;
    uomName: string;
    uomShortcut: string;
    maxBatchCapacity: number;
    description?: string;
    status: "ACTIVE" | "CLOSED" | "INACTIVE";
    createdAt: string;
    updatedAt: string;
    branchName?: string;
    branchCode?: string;
    isBadStock?: boolean;
    branchIsBadStock?: boolean;
    createdBy: string;
    updatedBy: string;
    displayNumber?: number;
}

export interface UnitOfMeasure {
    unitId: number;
    unitName: string;
    unitShortcut: string;
    order?: number | null;
    skuCode?: string | null;
}

export interface CreateLotPayload {
    lot_name: string;
    branch_id?: number;
    unit_id?: number | null;
    uom_id?: number | null;
    max_batch_capacity: number;
    description?: string;
    status?: "ACTIVE" | "CLOSED" | "INACTIVE";
}

export interface UpdateLotPayload {
    lot_name?: string;
    branch_id?: number;
    unit_id?: number | null;
    uom_id?: number | null;
    max_batch_capacity?: number;
    description?: string;
    status?: "ACTIVE" | "CLOSED" | "INACTIVE";
}

export interface InventoryType {
    inventoryTypeId: number;
    typeName: string;
}

// ─── Batch / Inventory Lot Types (mm_inventory_lots) ────────────────

export type BatchQaStatus = "GOOD" | "DAMAGED" | "QUARANTINED" | "EXPIRED";
export type BatchStatus = "ACTIVE" | "CLOSED" | "INACTIVE" | "GOOD" | "DAMAGED" | "QUARANTINED" | "EXPIRED" | "HOLD" | "RELEASED";

export interface Batch {
    batchId: number;
    batchNumber: string;
    lotId: number;
    lotName: string;
    branchId: number;
    productId: number;
    productName?: string;
    itemCode: string;
    quantity: number;
    unitCost: number;
    uomId: number | null;
    uomName: string;
    uomShortcut: string;
    manufacturingDate: string;
    expirationDate: string;
    qaStatus: BatchQaStatus;
    status: BatchStatus;
    sourceType?: string;
    sourceReference?: string;
    remarks: string;
    productType?: unknown;
    productCategory?: unknown;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy: string;
    displayNumber?: number;
}

export interface CreateBatchPayload {
    lot_id: number;
    branch_id?: number;
    product_id: number;
    batch_no: string;
    manufacturing_date?: string | null;
    expiry_date?: string | null;
    unit_cost?: number;
    qa_status?: BatchQaStatus;
    status?: BatchStatus;
    source_type?: string | null;
    source_reference?: string | null;
    remarks?: string | null;
    // Helper backwards-compatibility fields
    item_code?: string;
    quantity?: number;
}

export interface UpdateBatchPayload {
    lot_id?: number;
    branch_id?: number;
    product_id?: number;
    batch_no?: string;
    manufacturing_date?: string | null;
    expiry_date?: string | null;
    unit_cost?: number;
    qa_status?: BatchQaStatus;
    status?: BatchStatus;
    source_type?: string | null;
    source_reference?: string | null;
    remarks?: string | null;
    quantity?: number;
}

export interface LotKpiMetrics {
    totalLots: number;
    totalBatches: number;
    totalQuantity: number;
    quarantinedOrExpiring: number;
    fefoNextCount: number;
    activeQuantity: number;
    fefoNextBatches?: Batch[];
    fefoNextBatchNumbers?: string[];
    selectedProductName?: string;
}

export interface Branch {
    id: number;
    branchName: string;
    branchCode: string;
}

export interface ProductItem {
    productId: number;
    productName: string;
    skuCode: string;
    unitCost?: number;
    cost_per_unit?: number;
    price_per_unit?: number;
    estimated_unit_cost?: number;
}

export interface FefoPriorityInfo {
    priority: number | null;
    isFefoNext: boolean;
    isEligible: boolean;
    exclusionReason?: string;
    productGroupId?: number;
    productName?: string;
}

export interface FefoAllocationItem {
    batchId: number;
    batchNumber: string;
    lotId: number;
    lotName: string;
    allocatedQty: number;
    expiryDate: string;
    priority: number;
    batch: Batch;
}

export interface FefoAllocationResult {
    productId: number;
    requestedQuantity: number;
    allocatedQuantity: number;
    remainingQuantity: number;
    fullyAllocated: boolean;
    allocations: FefoAllocationItem[];
}

// ─── Inventory Movement Types (/api/mm-inventory-movements/all) ─────

export interface InventoryMovement {
    movementKey?: string;
    transactionType: string;
    movementDirection: "IN" | "OUT" | string;
    sourceModule: string;
    referenceId?: number;
    referenceDetailId?: number;
    referenceNo: string;
    transactionDate: string;
    postedAt?: string;
    postedBy?: number;
    branchId?: number;
    inventoryLotId?: number;
    batchId?: number;
    lotId?: number;
    lotName?: string;
    productId: number;
    productCode: string;
    productName: string;
    productTypeId?: number;
    productTypeName?: string;
    unitId?: number;
    unitName?: string;
    batchNo: string;
    manufacturingDate?: string | null;
    expirationDate?: string | null;
    inventoryCondition: string;
    quantityIn: number;
    quantityOut: number;
    unitCost: number;
    differenceCost: number;
    remarks?: string | null;
    stockType?: string | null;
    sourceStatus?: string;
    displayNumber?: number;
}

export interface InventoryMovementFilters {
    searchQuery: string;
    direction: "ALL" | "IN" | "OUT";
    transactionType: string;
    lotId: number | "ALL";
    productId: number | "ALL";
    branchId?: number | "ALL";
}

