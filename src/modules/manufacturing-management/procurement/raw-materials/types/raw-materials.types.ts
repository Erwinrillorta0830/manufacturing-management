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
    disabled?: boolean;
}

export interface TaxRateOption {
    value: string;
    label: string;
    vatRate: number;
    withholdingRate: number;
}

export interface PriceControlValue {
    priceTypeId: number;
    priceTypeName: string;
}

export type PurchaseQaParameterDataType = "Numeric" | "Boolean" | "Text";

export interface PurchaseQaParameter {
    parameterId: number;
    parameterName: string;
    dataType: PurchaseQaParameterDataType;
    unitOfMeasure: string | null;
    description: string | null;
}

export interface PurchaseQaSpecificationInput {
    specId?: number;
    parameterId: number;
    targetMin: number | null;
    targetMax: number | null;
    expectedText: string | null;
    isCritical: boolean;
}

export interface PurchaseQaConfig {
    inspectionRequired: boolean;
    specifications: PurchaseQaSpecificationInput[];
}

export interface PackagingVariantFormState {
    productId?: number;
    uomId: number | "";
    count: string;
    density: string;
    weight: string;
    netWeight: string;
    outerCartonWeight: string;
    palletWeight: string;
    weightUnitId: number | "";
    codeSuffix: string;
    isExisting?: boolean;
    isActive: boolean;
    barcode: string;
    maintainingQuantity: string;
    productImage: string | null;
    purchaseQa: PurchaseQaConfig;
}

export interface PackagingVariantPayload {
    product_id?: number;
    product_name?: string;
    product_code: string;
    unit_of_measurement: number;
    unit_of_measurement_count: number;
    density_factor: number;
    weight?: number | null;
    net_weight?: number | null;
    outer_carton_weight?: number | null;
    pallet_weight?: number | null;
    weight_unit_id: number | null;
    product_brand?: number;
    product_category?: number;
    product_type?: number;
    product_class?: number | null;
    product_segment?: number | null;
    product_section?: number | null;
    item_group_id?: number | null;
    tax_rate_id?: number | null;
    regulatory_code?: string | null;
    regulatory_notes?: string | null;
    barcode?: string | null;
    maintaining_quantity?: number;
    product_image?: string | null;
    purchaseQa?: PurchaseQaConfig;
    isActive?: number;
    codeSuffix?: string;
}

export interface RegisterRawMaterialPayload {
    product_name: string;
    product_code: string;
    description?: string;
    barcode?: string;
    unit_of_measurement: number;
    unit_of_measurement_count: number;
    density_factor: number;
    weight?: number | null;
    net_weight?: number | null;
    outer_carton_weight?: number | null;
    pallet_weight?: number | null;
    weight_unit_id?: number | null;
    product_brand?: number;
    product_category?: number;
    product_type?: number;
    product_class?: number | null;
    product_segment?: number | null;
    product_section?: number | null;
    item_group_id?: number | null;
    tax_rate_id?: number | null;
    regulatory_code?: string | null;
    regulatory_notes?: string | null;
    parent_id?: number | null;
    maintaining_quantity?: number;
    product_image?: string | null;
    purchaseQa?: PurchaseQaConfig;
    cascadeToChildren?: boolean;
    isActive?: number;
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
    net_weight?: number | null;
    outer_carton_weight?: number | null;
    pallet_weight?: number | null;
    weight_unit_id?: number | { id?: number; unit_id?: number; code?: string; unit_shortcut?: string; name?: string; unit_name?: string } | null;
    product_category?: number | string | { category_id?: number; category_name?: string } | null;
    category_name?: string;
    product_brand?: number | string | { brand_id?: number; brand_name?: string } | null;
    brand_name?: string;
    product_type?: number | null;
    product_type_name?: string | null;
    product_class?: number | null;
    product_segment?: number | null;
    product_section?: number | null;
    item_group_id?: number | null;
    item_group_name?: string | null;
    tax_rate_id?: number | null;
    tax_rate?: {
        vatRate: number;
        withholdingRate: number;
    } | null;
    regulatory_code?: string | null;
    regulatory_notes?: string | null;
    price_control?: PriceControlValue | null;
    maintaining_quantity?: number | null;
    product_image?: string | null;
    purchaseQa?: PurchaseQaConfig;
    isActive?: number;
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
    product_id?: number | null;
    lot_number?: string;
    expiration_date?: string | null;
    quantity_received?: number | string;
    branch_name?: string | null;
    branch_code?: string | null;
    created_on?: string | null;
    source_reference?: string | null;
    shipment_id?: {
        date_received?: string;
        reference_number?: string;
    } | null;
    branch_id?: number | {
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
