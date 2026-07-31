export interface LedgerItem {
    id: number;
    productId?: number;
    product_id?: number;
    branchId?: number;
    branch_id?: number;
    transaction_type?: string;
    quantity: number;
    balance_after?: number;
    created_date?: string;
    date_added?: string;
    documentDate?: string;
    documentNo?: string;
    documentType?: string;
    documentDescription?: string;
    reference_no?: string;
    remarks?: string;
    productName?: string;
    productCode?: string;
    unitName?: string;
    branchName?: string;
    is_finished_good?: boolean;
    product_brand?: { brand_name?: string };
    product_category?: { category_name?: string };
}

export interface BatchItem {
    line_id?: number;
    product_id: number;
    branch_id: number;
    lot_number: string;
    expiration_date: string | null;
    quantity_received?: number;
    available_quantity?: number;
    on_hand_quantity?: number;
    base_unit_cost_php?: number;
    final_landed_unit_cost?: number;
    branch_name?: string;
    expiryStatus?: "active" | "soon" | "expired";
    daysToExpiry?: number | null;
}

export interface ProductItem {
    product_id: number;
    product_name: string;
    product_code: string;
    is_finished_good?: boolean;
    cost_per_unit?: number;
    price_per_unit?: number;
    unit_of_measurement?: {
        unit_name?: string;
        unit_shortcut?: string;
    };
    product_brand?: {
        brand_name?: string;
    };
    product_category?: {
        category_name?: string;
    };
}

export interface BranchItem {
    id: number;
    branch_name: string;
    branch_code?: string;
}

export interface InventoryData {
    ledger: LedgerItem[];
    batches: BatchItem[];
    products: ProductItem[];
    branches: BranchItem[];
}

export interface StockLevelProduct extends ProductItem {
    currentStock: number;
    branchStocks: Record<number, number>;
}

export interface GroupedBatchProduct extends ProductItem {
    batches: BatchItem[];
    totalStock: number;
    totalValue: number;
    batchesCount: number;
    oldestExpiry: string | null;
}

export interface PickingItem {
    productId: number;
    lotNumber: string;
    quantity: number;
}

export interface PickingJO {
    jo_id: string;
    branch_id: number;
    product_name?: string;
    product_code?: string;
    planned_quantity?: number;
    status?: string;
    allocationResults?: Array<{
        component_product_id: number;
        component_name?: string;
        batches?: Array<{
            lot_number: string;
            quantity: number;
        }>;
    }>;
}

export interface ReceivingJO {
    jo_id: string;
    product_id: number;
    product_name?: string;
    product_code?: string;
    planned_quantity?: number;
    branch_id?: number;
    status?: string;
}

export interface ReceivingResult {
    success: boolean;
    joId: string;
    yieldQuantity: number;
    costVariance?: number;
    allocations?: any[];
    error?: string;
}

export type InventoryTab = "stock" | "batches" | "ledger" | "picking" | "receiving";
export type LedgerType = "raw" | "fg";
export type ExpiryFilter = "all" | "active" | "soon" | "expired";
