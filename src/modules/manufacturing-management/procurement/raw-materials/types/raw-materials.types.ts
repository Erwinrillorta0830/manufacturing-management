export interface UnitOption {
    unit_id: number;
    unit_name: string;
    unit_shortcut: string;
}

export interface WeightUnitOption {
    id: number;
    code: string;
    name: string;
}

export interface SelectOption {
    value: string;
    label: string;
}

export interface PackagingVariantPayload {
    product_name: string;
    product_code: string;
    unit_of_measurement: number;
    unit_of_measurement_count: number;
    density_factor: number;
    weight: number;
    weight_unit_id: number;
    product_brand?: number;
    product_category?: number;
    product_type?: number;
}

export interface RegisterRawMaterialPayload {
    product_name: string;
    product_code: string;
    description?: string;
    barcode?: string;
    unit_of_measurement: number;
    unit_of_measurement_count?: number;
    density_factor?: number;
    weight?: number;
    weight_unit_id?: number;
    product_brand?: number;
    product_category?: number;
    product_type?: number;
    parent_id?: number | null;
}

export interface RawMaterialItem {
    product_id: number;
    parent_id?: number | null;
    parent_name?: string | null;
    product_code?: string;
    product_name: string;
    description?: string;
    barcode?: string;
    unit_of_measurement?: {
        unit_id: number;
        unit_shortcut: string;
        unit_name: string;
    };
    unit_of_measurement_count?: number | null;
    cost_per_unit: number;
    estimated_unit_cost?: number;
    density_factor?: number;
    weight?: number | null;
    weight_unit_id?: number | { id?: number; unit_id?: number; code?: string; unit_shortcut?: string; name?: string; unit_name?: string } | null;
    product_category?: number | string | { category_id?: number; category_name?: string } | null;
    category_name?: string;
    product_brand?: number | string | { brand_id?: number; brand_name?: string } | null;
    brand_name?: string;
    product_type?: number | null;
    date_added?: string;
    last_updated?: string;
}

export interface SupplierItem {
    id: number;
    supplier_name: string;
    supplier_shortcut?: string;
    phone_number?: string;
    email_address?: string;
    isActive?: number;
}

export interface BatchItem {
    lot_number?: string;
    expiration_date?: string | null;
    quantity_received?: number | string;
    shipment_id?: {
        date_received?: string;
        reference_number?: string;
    } | null;
    branch_id?: {
        branch_name?: string;
        branch_code?: string;
    } | null;
}

export interface BranchGroupedBatches {
    branchName: string;
    branchCode: string;
    batches: Array<{
        lot_number: string;
        expiration_date?: string | null;
        qty: number;
        reception_date: string;
        shipment_ref: string;
    }>;
    totalQty: number;
}

export type TypeFilter = "all" | "raw" | "pkg";
