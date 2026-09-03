export type PiStatus = "DRAFT" | "PENDING_REVIEW" | "COMMITTED" | "CANCELLED";
export type StockType = "OPENING" | "REGULAR";

export interface Branch {
    id: number;
    branch_name?: string;
    branchName?: string;
    branch_code?: string;
    branchCode?: string;
    isActive?: boolean | number;
}

export interface Unit {
    unit_id: number;
    unit_name: string;
    unit_shortcut: string;
}

export interface PriceType {
    price_type_id: number;
    price_type_name: string;
    sort?: number | null;
}

export interface ProductType {
    id: number;
    name?: string;
    type_name?: string;
    default_purchase_price_type_id?: number | null;
}

export interface Product {
    product_id: number;
    product_code: string;
    product_name: string;
    product_type?: number | string | ProductType | { id?: number; name?: string; type_name?: string } | null;
    product_type_id?: number | null;
    product_shelf_life?: number;
    cost_per_unit?: number;
    unit_of_measurement?: number | Unit | { unit_id?: number; unit_shortcut?: string; unit_name?: string };
    unit_of_measurement_count?: number;
    isActive?: boolean | number;
}

export interface MmLot {
    lot_id: number;
    lot_name: string;
    branch_id: number | Branch;
    unit_id: number | Unit;
    max_batch_capacity: number;
    description?: string | null;
    created_by?: number | string | null;
    isActive?: boolean | number;
}

export interface MmInventoryLot {
    inventory_lot_id: number;
    lot_id: number | MmLot;
    branch_id: number | Branch;
    product_id: number | Product;
    batch_no: string;
    manufacturing_date?: string | null;
    expiry_date?: string | null;
    expiration_date?: string | null;
    unit_cost: number;
    qa_status?: string | null;
    status?: string | null;
    source_type?: string | null;
    source_reference?: string | null;
    created_by?: number | string | null;
}

export interface MmPhysicalInventoryDetail {
    physical_inventory_detail_id?: number;
    id?: number;
    physical_inventory_id: number;
    inventory_lot_id: number | MmInventoryLot;
    lot_id: number | MmLot;
    product_id: number | Product;
    unit_id: number | Unit;
    batch_no?: string | null;
    manufacturing_date?: string | null;
    expiration_date?: string | null;
    inventory_condition: string;
    system_count: number;
    physical_count: number | null;
    variance?: number;
    unit_cost: number;
    difference_cost?: number;
    remarks?: string | null;
    offset_qty?: number;
    net_adjusted_variance?: number;
}

export interface MmOffsetPairing {
    id: string;
    physical_inventory_id?: number;
    shortage_detail_id: number;
    shortage_product_id: number;
    shortage_product_name: string;
    shortage_product_code?: string;
    shortage_lot_id: number;
    shortage_lot_name?: string;
    shortage_batch_no?: string;
    surplus_detail_id: number;
    surplus_product_id: number;
    surplus_product_name: string;
    surplus_product_code?: string;
    surplus_lot_id: number;
    surplus_lot_name?: string;
    surplus_batch_no?: string;
    offset_qty: number;
    shortage_unit_cost: number;
    surplus_unit_cost: number;
    unit_cost_variance: number;
    net_financial_impact: number;
    reason_code: "Lot Number Mix-up / Mislabeling" | "Production Batch Pick Swap" | "Wrong SKU Tagging" | "Barcoding Error" | "UOM Miscount" | "Packaging Variation" | string;
    notes?: string;
    created_at?: string;
}

export interface MmPhysicalInventorySheet {
    physical_inventory_id: number;
    pi_no: string;
    starting_date: string;
    cutoff_date: string;
    stock_type: StockType;
    product_type_id?: number | ProductType | null;
    price_type_id?: number | PriceType | null;
    branch_id: number | Branch;
    remarks?: string | null;
    status: PiStatus;
    encoder_id?: number | string | { user_id?: number; user_fname?: string; user_lname?: string } | null;
    total_system_quantity: number;
    total_physical_quantity: number;
    total_variance: number;
    total_difference_cost: number;
    isCommitted: number | boolean;
    committed_at?: string | null;
    committed_by?: number | string | { user_id?: number; user_fname?: string; user_lname?: string } | null;
    isCancelled: number | boolean;
    cancelled_at?: string | null;
    cancelled_by?: number | string | { user_id?: number; user_fname?: string; user_lname?: string } | null;
    cancellation_reason?: string | null;
    created_at?: string | null;
    details?: MmPhysicalInventoryDetail[];
    offset_pairings?: MmOffsetPairing[];
    total_offset_qty?: number;
    net_financial_offset_impact?: number;
}

export interface PhysicalInventoryFilters {
    pi_no?: string;
    branch_id?: string;
    stock_type?: string;
    status?: string;
    search?: string;
}
