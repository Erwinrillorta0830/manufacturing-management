export type CountSheetStatus =
    | "Draft"
    | "In Progress"
    | "Pending Reconciliation"
    | "Ready for Commitment"
    | "Committed"
    | "Cancelled";

export type InventoryCategoryType = "Raw Materials" | "Packaging" | "Finished Goods";
export type StockConditionType = "Good Stock" | "Bad Stock";

export interface ProductDetails {
    id?: string | number;
    product_id?: string | number;
    product_code?: string;
    code?: string;
    product_name?: string;
    name?: string;
    barcode?: string;
    inventory_type?: string;
    category?: { category_name?: string; name?: string } | string;
    unit_of_measurement?: {
        unit_shortcut?: string;
        unit_name?: string;
    } | null;
}

export interface RecipeVersionDetails {
    id?: string | number;
    version_id?: string | number;
    version_name?: string;
    version_code?: string;
    name?: string;
    product_id?: string | number | ProductDetails | null;
    status?: string;
}

export interface StorageLotDetails {
    id?: string | number;
    lot_id?: string | number;
    lot_name?: string;
    name?: string;
}

export interface OffsetPairing {
    id: string; // e.g. OFF-001
    shortage_item_id: string;
    shortage_product_name: string;
    shortage_product_code?: string;
    shortage_category?: string;
    surplus_item_id: string;
    surplus_product_name: string;
    surplus_product_code?: string;
    surplus_category?: string;
    offset_qty: number;
    shortage_unit_price: number;
    surplus_unit_price: number;
    unit_price_variance: number;
    net_financial_impact: number;
    reason_code: "Wrong Item Picked" | "Barcoding/Tagging Error" | "UOM Miscount" | "Packaging Variation" | string;
    notes?: string;
}

export interface PhysicalInventoryLineItem {
    id: string;
    ph_id?: string | number;
    date_encoded?: string;
    product_id?: string | number | ProductDetails | null;
    product_code?: string;
    product_name?: string;
    barcode?: string;
    sku_code?: string;
    sku_name?: string;
    version_id?: string | number | RecipeVersionDetails | null;
    lot_id?: string | number | StorageLotDetails | null; // Bin/Rack Location
    batch_no?: string;
    uom?: string;
    unit_of_measure?: string;
    uom_count?: number | null;
    uom_factor?: number;
    unit_price: number;
    system_count: number;
    physical_count: number | null;
    variance?: number; // Physical Count - System Count
    variance_base?: number; // Variance * uom_factor
    difference_cost?: number;
    amount?: number;
    offset_match?: number | null;
    offset_qty?: number;
    net_adjusted_variance?: number;
    category_name?: string;
    inventory_type?: string;
    vendor_name?: string;
    last_counted_by?: string;
    remarks?: string;
    is_no_count_product?: boolean;
}

export interface PhysicalCountSheet {
    id: string;
    ph_no?: string;
    sheet_no?: string;
    date_encoded?: string;
    starting_date?: string;
    cutOff_date?: string;
    cutoff_date?: string;
    inventory_type?: string;
    product_type_id?: number | string;
    stock_type?: string;
    price_type?: string;
    branch_id: number | string;
    branch_name: string;
    category?: string;
    category_id?: number;
    vendor?: string;
    supplier_id?: number;
    supplier_name?: string;
    status?: CountSheetStatus;
    isComitted?: boolean;
    is_committed?: boolean;
    committed_at?: string | null;
    committed_by?: string | null;
    isCancelled?: boolean;
    is_cancelled?: boolean;
    cancelled_at?: string | null;
    total_amount: number;
    created_by?: string;
    created_at?: string;
    encoder_id?: number;
    encoder_name?: string;
    remarks?: string;
    notes?: string;
    line_items: PhysicalInventoryLineItem[];
    offset_pairings?: OffsetPairing[];
}

export interface CountSheetSummary {
    totalItems: number;
    totalItemsCount: number;
    countedItemsCount: number;
    totalSystemQty: number;
    totalPhysicalQty: number;
    netVarianceQty: number;
    netVarianceBaseQty: number;
    surplusItemsCount: number;
    deficitItemsCount: number;
    matchedItemsCount: number;
    uncountedItemsCount: number;
    totalSurplusCost: number;
    surplusVarianceCost: number;
    totalDeficitCost: number;
    deficitVarianceCost: number;
    netVarianceCost: number;
    totalOffsetQty: number;
    totalOffsetImpact: number;
}

export interface Branch {
    id?: number | string;
    branch_id?: number | string;
    branchName?: string;
    branch_name?: string;
    name?: string;
    title?: string;
    branchCode?: string;
    branch_code?: string;
}

export interface Supplier {
    id?: number | string;
    supplier_id?: number | string;
    supplier_name?: string;
    name?: string;
}

export interface ProductType {
    id?: string | number;
    inventoryTypeId?: string | number;
    typeName?: string;
    type_name?: string;
    name?: string;
}
