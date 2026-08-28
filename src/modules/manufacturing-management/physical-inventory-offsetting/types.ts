export type OffsettingStatus =
    | "PENDING_OFFSETTING"
    | "PARTIALLY_OFFSET"
    | "FULLY_RECONCILED"
    | "COMMITTED"
    | "CANCELLED";

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

export interface ProductType {
    id: number;
    name?: string;
    type_name?: string;
}

export interface Product {
    product_id: number;
    product_code: string;
    product_name: string;
    cost_per_unit?: number;
    product_type?: string | number | { id?: number; name?: string; type_name?: string } | null;
    product_category?: string | { category_name?: string } | null;
    unit_of_measurement?: number | Unit | { unit_id?: number; unit_shortcut?: string; unit_name?: string };
    unit_of_measurement_count?: number;
}

export interface MmLot {
    lot_id: number;
    lot_name: string;
    branch_id: number | Branch;
    unit_id: number | Unit;
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
}

export interface OffsettingLineDetail {
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
    physical_count: number;
    variance?: number;
    unit_cost: number;
    difference_cost?: number;
    remarks?: string | null;
    offset_qty?: number;
    net_adjusted_variance?: number;
}

export interface OffsettingPairing {
    id: string;
    group_link_id?: string;
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
    offset_pieces?: number;
    shortage_uom_count?: number;
    surplus_uom_count?: number;
    shortage_containers_deducted?: number;
    surplus_containers_deducted?: number;
    shortage_unit_cost: number;
    surplus_unit_cost: number;
    unit_cost_variance: number;
    net_financial_impact: number;
    reason_code:
        | "Lot Number Mix-up / Mislabeling"
        | "Production Batch Pick Swap"
        | "Wrong SKU Tagging"
        | "Barcoding Error"
        | "UOM Miscount"
        | "Packaging Variation"
        | string;
    notes?: string;
    created_at?: string;
}

export interface OffsettingSheetQueueItem {
    physical_inventory_id: number;
    pi_no: string;
    starting_date: string;
    cutoff_date: string;
    stock_type: string;
    branch_id: number | Branch;
    branch_name?: string;
    status: string;
    offsetting_status: OffsettingStatus;
    encoder_id?: string | number | null;
    total_system_quantity: number;
    total_physical_quantity: number;
    total_variance: number;
    total_difference_cost: number;
    total_shortage_qty: number;
    total_shortage_cost: number;
    total_surplus_qty: number;
    total_surplus_cost: number;
    total_offset_qty: number;
    net_financial_offset_impact: number;
    isCommitted: number | boolean;
    committed_at?: string | null;
    committed_by?: string | number | null;
    details?: OffsettingLineDetail[];
    offset_pairings?: OffsettingPairing[];
}

export interface OffsettingFilters {
    search?: string;
    branch_id?: string;
    offsetting_status?: string;
    stock_type?: string;
}
