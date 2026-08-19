export interface SupplierRepresentative {
    id?: number;
    supplier_id?: number;
    last_name: string;
    first_name: string;
    middle_name?: string | null;
    suffix?: string | null;
    email?: string | null;
    contact_number?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface Supplier {
    id: number;
    supplier_name: string;
    supplier_shortcut?: string;
    tin_number?: string;
    phone_number?: string;
    email_address?: string;
    address?: string;
    city?: string;
    brgy?: string;
    state_province?: string;
    country?: string;
    postal_code?: string;
    contact_person?: string;
    payment_terms?: string;
    delivery_terms?: string;
    notes_or_comments?: string;
    isActive?: number;
    nonBuy?: boolean | number;
    is_foreign?: number;
    currency?: string;
    default_currency?: string;
    representatives?: SupplierRepresentative[];
}

export interface SupplierFormState {
    supplier_name: string;
    supplier_shortcut: string;
    tin_number: string;
    phone_number: string;
    email_address: string;
    address: string;
    city: string;
    brgy: string;
    state_province: string;
    country: string;
    postal_code: string;
    payment_terms: string;
    delivery_terms: string;
    currency: string;
    default_currency: string;
    notes_or_comments: string;
    isActive: boolean;
    nonBuy: boolean | number;
    is_foreign: number | boolean;
    representatives: SupplierRepresentative[];
}

export interface PurchaseOrderPaymentMode {
    id: number;
    mode_name: string;
    code: string;
    is_active?: boolean | number | null;
    sort_order?: number | null;
}

export interface IncomingShipment {
    shipment_id: number;
    reference_number: string;
    purchase_order_no?: string;
    supplier_id: number | Supplier | null;
    date_received: string | null;
    lead_time_receiving?: string | null;
    total_foreign_currency: number | string;
    exchange_rate: number | string;
    total_php_value: number | string;
    status: "For Approval" | "Requested" | "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected";
    inventory_status?: number | null;
    payment_status?: number | null;
    is_posted?: number | boolean | null;
    is_posted_amounts?: number | boolean | null;
    rejection_stage?: "Plant" | "Finance" | null;
    remark?: string;
    created_at?: string;
    payment_mode?: number | null;
    payment_mode_name?: string | null;
    branch_id?: number | null;
    payment_type?: number | null;
    payment_terms?: number | null;
    price_type?: string | null;
    currency_code?: "PHP" | "USD";
    workflow_revision?: number;
    approver_id?: number | null;
    finance_id?: number | null;
    date_approved?: string | null;
    date_financed?: string | null;
    approval_rule_id?: number | null;
    approval_requires_finance?: boolean | null;
    approval_allow_self_approval?: boolean | null;
}

export interface ShipmentLineItem {
    line_id?: number;
    shipment_id: number;
    product_id: number | {
        product_id: number;
        product_name: string;
        product_code?: string;
        weight?: number | string | null;
        net_weight?: number | string | null;
        outer_carton_weight?: number | string | null;
        pallet_weight?: number | string | null;
        weight_unit_id?: unknown;
        unit_of_measurement?: {
            unit_id: number;
            unit_shortcut: string;
            unit_name: string;
        };
    };
    category_type?: "RAW_MATERIAL" | "PACKAGING";
    quantity_ordered?: number;
    quantity_received?: number | null;
    base_unit_cost_php: number | string;
    unit_price_foreign?: number | null;
    allocated_expense_php: number | string;
    final_landed_unit_cost: number | string;
    purchase_intent?: "MRP_Demand" | "Buffer_Stock";
    job_order_id?: number | null;
    discount_type?: { id: number; discount_type: string; total_percent: number | string } | number | null;
    discount_mode?: "Percentage" | "Fixed Amount";
    discount_amount_foreign?: number | string | null;
    discount_percent?: number;
    vat_percent?: number;
    withholding_percent?: number;
}

export interface ShipmentExpense {
    expense_id?: number;
    shipment_id: number;
    expense_type?: string;
    overhead_id?: number;
    amount_php: number | string;
    allocation_method: "By Value" | "By Weight" | "By Volume" | "Manual" | "Value" | "Weight" | "Volume" | "Hybrid";
}

export interface RawMaterial {
    product_id: number;
    parent_id?: number | null;
    parent_name?: string | null;
    product_code?: string;
    product_name: string;
    description?: string;
    barcode?: string;
    product_image?: string | null;
    maintaining_quantity?: number | null;
    unit_of_measurement?: {
        unit_id: number;
        unit_shortcut: string;
        unit_name: string;
    };
    unit_of_measurement_count?: number | null;
    cost_per_unit: number;
    estimated_unit_cost: number;
    density_factor: number;
    weight?: number | null;
    net_weight?: number | null;
    outer_carton_weight?: number | null;
    pallet_weight?: number | null;
    weight_unit_id?: number | { id?: number; unit_id?: number; code?: string; unit_shortcut?: string; name?: string; unit_name?: string } | null;
    product_category?: number | null;
    product_brand?: number | null;
    product_type?: number | null;
    isActive?: number;
    date_added?: string;
    last_updated?: string;
}

export interface LinkedProduct {
    id: number;
    supplier_id: number;
    product_id?: {
        product_id: number;
        product_code?: string;
        product_name?: string;
        description?: string;
        unit_of_measurement?: {
            unit_id: number;
            unit_name?: string;
            unit_shortcut?: string;
        };
    };
}

export interface PSGCItem {
    code: string;
    name: string;
}
export interface RegisterRawMaterialPayload {
    product_name: string;
    product_code: string;
    description?: string;
    barcode?: string;
    cost_per_unit?: number;
    density_factor?: number;
    weight?: number | null;
    net_weight?: number | null;
    outer_carton_weight?: number | null;
    pallet_weight?: number | null;
    weight_unit_id?: number | null;
    unit_of_measurement?: number;
    price_per_unit?: number;
    product_brand?: number | null;
    product_category?: number | null;
    product_type?: number | null;
    parent_id?: number | null;
    unit_of_measurement_count?: number | null;
    maintaining_quantity?: number;
    product_image?: string | null;
    purchaseQa?: import("./raw-materials/types/raw-materials.types").PurchaseQaConfig;
    isActive?: number;
}

// ─── Directus API-layer types (used by API route helpers) ───────────────────

export interface DirectusSupplier {
    id: number;
    supplier_name: string;
    supplier_shortcut?: string | null;
    isActive?: boolean;
    nonBuy?: boolean | number;
    is_foreign?: number;
    default_currency?: string;
}

export interface DirectusShipment {
    shipment_id?: number;
    reference_number: string;
    supplier_id: number | Record<string, unknown>;
    date_received: string | null;
    lead_time_receiving?: string | null;
    total_foreign_currency: number | string;
    exchange_rate: number | string;
    total_php_value: number | string;
    status: "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected";
    inventory_status?: number | null;
    payment_status?: number | null;
    payment_type?: number | null;
    payment_mode?: number | null;
    created_at?: string;
}

export interface DirectusShipmentLineItem {
    line_id?: number;
    shipment_id: number;
    product_id: number | Record<string, unknown>;
    quantity_received: number;
    base_unit_cost_php: number | string;
    allocated_expense_php: number | string;
    final_landed_unit_cost: number | string;
    discount_mode?: "Percentage" | "Fixed Amount" | null;
    discount_amount_foreign?: number | string | null;
}

export interface DirectusShipmentExpense {
    expense_id?: number;
    shipment_id: number;
    expense_type: string;
    amount_php: number | string;
    allocation_method: "Value" | "Weight" | "Volume" | "Hybrid";
}

export interface DirectusProductPerSupplier {
    id: number;
    supplier_id: number;
    discount_type?: {
        id: number;
        discount_type: string;
        total_percent: number;
    } | null;
    product_id: {
        product_id: number;
        product_name: string;
        product_code: string;
        description: string;
        unit_of_measurement?: {
            unit_id: number;
            unit_name: string;
            unit_shortcut: string;
            sku_code?: string | null;
        } | null;
        cost_per_unit: number;
        price_per_unit: number;
        barcode?: string | null;
        parent_id?: number | null;
        density_factor?: number | null;
        has_versions?: boolean;
    };
}

export interface PackagingVariant {
    product_name?: string;
    product_code?: string;
    unit_of_measurement?: number;
    unit_of_measurement_count?: number;
    density_factor?: number;
    weight?: number | null;
    net_weight?: number | null;
    outer_carton_weight?: number | null;
    pallet_weight?: number | null;
    weight_unit_id?: number | null;
    product_brand?: number | null;
    product_category?: number | null;
    product_type?: number | null;
    parent_id?: number | null;
    barcode?: string | null;
    maintaining_quantity?: number;
    product_image?: string | null;
    purchaseQa?: import("./raw-materials/types/raw-materials.types").PurchaseQaConfig;
    isActive?: number;
    uomId?: number | "";
    count?: string | number;
    codeSuffix?: string;
}

export interface ShipmentData {
    reference_number: string;
    supplier_id: string;
    exchange_rate: string;
    total_foreign_currency: string;
    total_php_value: string;
    status: "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected";
    inventory_status?: number | null;
    payment_status?: number | null;
    date_received: string;
    branch_id: number | null;
    payment_type: number | null;
    payment_mode: number | null;
    payment_terms?: number | null;
    price_type: string | null;
}

export interface LineItem {
    product_id: string;
    quantity_ordered: string;
    base_unit_cost_php: string;
    parent_product_id: string;
    discount_type_id?: string | number | null;
    discount_mode?: "Percentage" | "Fixed Amount";
    discount_amount?: string | number | null;
    discount_percent?: string | number | null;
    product_name?: string;
    product_code?: string;
    selected_uom?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    uom_options?: any[];
}

export interface BFFCatalogProduct {
    product_id: number;
    parent_id?: number | string | { product_id?: number | string; id?: number | string } | null;
    product_code?: string;
    product_name: string;
    description?: string;
    barcode?: string;
    product_image?: string | null;
    maintaining_quantity?: number | string | null;
    unit_of_measurement?: {
        unit_id: number;
        unit_shortcut: string;
        unit_name?: string;
    } | null;
    unit_of_measurement_count?: number | string | null;
    cost_per_unit?: number | string;
    estimated_unit_cost?: number | string;
    density_factor?: number | string;
    weight?: number | string | null;
    net_weight?: number | string | null;
    outer_carton_weight?: number | string | null;
    pallet_weight?: number | string | null;
    weight_unit_id?: number | { id?: number; unit_id?: number; code?: string; unit_shortcut?: string; name?: string; unit_name?: string } | null;
    product_category?: number | { category_id?: number; id?: number } | null;
    product_brand?: number | { brand_id?: number; id?: number } | null;
    product_type?: number | string | null;
    isActive?: boolean | number | string | null;
    date_added?: string;
    last_updated?: string;
}

export interface PurchaseOrderPriceTypeRule {
    productTypeId: number;
    productTypeName: string;
    priceTypeId: number | null;
    priceTypeName: string | null;
}
