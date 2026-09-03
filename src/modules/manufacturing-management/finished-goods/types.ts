export interface BOMItem {
    id: string;
    productId?: number;
    name: string;
    type: "raw_material" | "packaging" | "sub_assembly" | "by_product" | "finished_good";
    quantity: number;
    uom: string;
    uomId?: number;
    wastagePercent: number;
    landedCost: number;
    densityFactor?: number;
    isForeign?: boolean;
    currency?: "PHP" | "USD";
    originalPrice?: number | null;
}

export interface ChildVariantForm {
    id: string;
    title: string;
    sku: string;
    baseUom: string;
    uomCount: string;
    targetSellingPrice: string;
    costPerUnit: string;
    barcode?: string;
}


export interface RoutingStep {
    id: string;
    sequence: number;
    name: string;
    operationId?: number;
    machineHourlyRate: number;
    durationHours: number;
    stepBatchSize?: number;
    requiresQA?: boolean;
}


export interface Product {
    id: string;
    sku: string;
    title: string;
    description: string;
    identityKey?: string | null;
    barcode: string;
    baseUom: string;
    expectedYieldPercent: number;
    yield_factor?: number;
    standard_scrap_rate?: number;
    cutting_unit_weight_grams?: number;
    pcs_per_bundle_case?: number;
    bundles_cases_per_pallet?: number;
    pcs_per_layer?: number;
    layers_per_cage?: number;
    targetSellingPrice: number;
    parentProduct?: boolean;
    parent_id?: number | null;
    status?: string;
    isActive?: boolean;
    bom: BOMItem[];
    routings: RoutingStep[];
    densityFactor?: number;
    product_brand?: number;
    product_category?: number;
    product_class?: number;
    product_segment?: number;
    product_section?: number;
    product_shelf_life?: number;
    cost_per_unit?: number;
    unit_of_measurement_count?: number;
    product_image?: string;
    customOverhead?: number;
    has_versions?: boolean;
    versions?: ProductVersion[];
    selectedVersion?: ProductVersion;
    created_at?: string | null;
    created_by?: number | string | null;
    updated_at?: string | null;
    updated_by?: number | string | null;
}


export interface Supplier {
    id: number;
    supplier_name: string;
    supplier_shortcut?: string | null;
}

export interface Supplier {
    id: number;
    supplier_name: string;
    supplier_shortcut?: string | null;
}

export interface Brand {
    brand_id: number;
    brand_name: string;
    sku_code?: string | null;
}

export interface Category {
    category_id: number;
    category_name: string;
    sku_code?: string | null;
}

export interface ProductClass {
    class_id: number;
    class_name: string;
}

export interface ProductSegment {
    segment_id: number;
    segment_name: string;
}

export interface ProductSection {
    section_id: number;
    section_name: string;
}

export interface Unit {
    unit_id: number;
    unit_name: string;
    unit_shortcut: string;
}

export interface AssetRecord {
    id: number;
    item_image?: string | null;
    item_id?: number | { id: number; item_name?: string | null } | null;
    quantity?: number | null;
    rfid_code?: string | null;
    barcode?: string | null;
    serial?: string | null;
    department?: number | { department_id: number; department_name?: string | null } | null;
    employee?: number | null;
    cost_per_item?: number | null;
    total?: number | null;
    condition?: 'Good' | 'Bad' | 'Under Maintenance' | 'Discontinued' | null;
    life_span?: number | null;
    is_active_warning?: boolean;
    is_active?: boolean;
    date_acquired?: string | null;
    created_by?: number | null;
    created_by_name?: string | null;
}

export interface DepartmentRecord {
    department_id: number;
    department_name: string;
}

export interface WorkCenter {
    work_center_id: number;
    work_center_name: string;
    asset_id?: number | null;
    department_id?: number | null;
    overhead_cost_per_hour?: number | null;
    capacity_per_hour?: number | null;
    is_active?: boolean;
    asset?: AssetRecord | null;
    department?: DepartmentRecord | null;
    created_by?: number | null;
    created_by_name?: string;
    created_at?: string;
}

export interface QATemplate {
    template_id: number;
    template_name: string;
    description?: string | null;
    is_active?: boolean;
    parameters?: QAParameter[];
}

export interface QAParameter {
    parameter_id: number;
    template_id: number;
    test_name: string;
    test_type: 'Numeric' | 'Pass/Fail' | 'Text';
    min_value?: number | null;
    max_value?: number | null;
    target_value?: string | number | null;
    uom_id?: number | null;
    is_critical?: boolean;
}

export interface VersionPosition {
    id?: number | string;
    version_id?: number;
    position_id?: number | null;
    position_name: string;
    category?: 'direct_labor' | 'maintenance';
    manpower_count: number | string;
    hourly_rate: number | string;
    hours_required?: number | string;
    daily_rate?: number | string;
    ot_hours?: number | string;
    include_mandates?: boolean;
    sss_amount?: number | string;
    phic_amount?: number | string;
    hdmf_amount?: number | string;
}

export type VersionLaborPosition = VersionPosition;

export interface VersionOverheadItem {
    id: string;
    overhead_type_id?: number;
    overhead_name: string;
    cost_per_unit: number;
    is_active: boolean;
    remarks?: string;
}

export interface ProductVersion {
    version_id: number;
    id?: number; // legacy/compatibility
    product_id: number;
    version_name: string;
    base_quantity: number;
    uom_id?: number | null;
    expected_yield_percentage: number;
    yield_factor?: number;
    standard_scrap_rate?: number;
    cutting_unit_weight_grams?: number;
    pcs_per_bundle_case?: number;
    bundles_cases_per_pallet?: number;
    pcs_per_layer?: number;
    layers_per_cage?: number;
    custom_overhead?: number | null;
    status: string;
    valid_from?: string | null;
    valid_to?: string | null;
    is_active?: boolean; // legacy/compatibility
    is_primary?: boolean; // Primary Default for Master Standard Cost Rollup & JO Defaults
    is_draft?: boolean;
    rejection_reason?: string | null;
    approval_remarks?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    routes?: RouteStep[];
    overheads?: ProductOverhead[];
    overhead_items?: VersionOverheadItem[];
    labor_positions?: VersionPosition[];
}

export interface RoutePosition {
    id?: number | string;
    route_id?: number;
    position_id?: number | null;
    position_name: string;
    manpower_count: number | string;
    hourly_rate: number | string;
    daily_rate?: number | string;
    daily_wage?: number | string;
}

export interface RouteStep {
    route_id: number;
    version_id: number;
    work_center_id?: number | null;
    operation_id?: number | null;
    sequence_order: number;
    setup_time_hours: number;
    run_time_hours: number;
    step_batch_size?: number;
    default_manpower?: number;
    expected_labor_cost?: number;
    qa_template_id?: number | null;
    bom_items?: RouteBOMItem[];
    positions?: RoutePosition[];
    // Expandable relations for easy UI rendering
    work_center?: WorkCenter | null;
    qa_template?: QATemplate | null;
}

export interface RouteBOMItem {
    id: number;
    route_id: number;
    product_id: number;
    product_type?: number | null;
    has_versions?: boolean;
    quantity_required: number;
    unit_of_measurement?: number | string | null;
    wastage_factor_percentage: number;
    // Optional details populated by BFF for convenience
    product_name?: string;
    product_code?: string;
    cost_per_unit?: number;
    is_foreign?: boolean;
    material_type?: import("./material-types").MaterialType | null;
}


export interface ProductOverhead {
    id: string;
    overheadId: number;
    overheadName: string;
    amount: number;
}

export interface BFFCatalogProduct {
    product_id: number;
    product_name: string;
    product_code?: string | null;
    description?: string | null;
    short_description?: string | null;
    barcode?: string | null;
    unit_of_measurement?: {
        unit_id: number;
        unit_shortcut?: string | null;
        unit_name?: string | null;
    } | null;
    density_factor?: number | string | null;
    price_per_unit?: number | string | null;
    cost_per_unit?: number | string | null;
    parent_id?: number | { product_id: number | string } | null;
    product_brand?: number | null;
    product_category?: number | null;
    product_class?: number | null;
    product_segment?: number | null;
    product_section?: number | null;
    product_shelf_life?: number | null;
    unit_of_measurement_count?: number | null;
    product_image?: string | null;
    product_type?: number;
    status?: string | null;
    isActive?: boolean | number | string | null;
    has_versions?: boolean;
    created_at?: string | null;
    created_by?: number | string | null;
    updated_at?: string | null;
    updated_by?: number | string | null;
}

export interface OperationType {
    id: number;
    operation_name: string;
}

export interface ChartOfAccount {
    coa_id: number;
    gl_code?: string;
    account_title?: string;
    description?: string;
    status?: string;
}

export interface OverheadType {
    id: number;
    overhead_name: string;
    coa_id?: number | ChartOfAccount | null;
    description?: string | null;
}

// ─── Directus API-layer types (used by API route helpers) ───────────────────

export interface DirectusProductCurrencyProfile {
    id: number;
    product_id: number;
    is_foreign_sourced: boolean;
    purchase_currency: "PHP" | "USD";
    purchase_price: number | null;
}

export interface DirectusProduct {
    product_id: number;
    product_name: string;
    product_code: string;
    description: string;
    short_description?: string | null;
    unit_of_measurement: { unit_id: number; unit_name: string; unit_shortcut: string } | null;
    cost_per_unit: number;
    price_per_unit: number;
    barcode?: string | null;
    parent_id?: number | null;
    isActive?: boolean | number | string | null;
    density_factor?: number | null;
    has_versions?: boolean;
    currency_profile?: DirectusProductCurrencyProfile | null;
    product_type?: number | string | { id?: number | string; name?: string; default_purchase_price_type_id?: unknown } | null;
    product_brand?: number | { brand_id?: number; id?: number } | null;
    product_category?: number | { category_id?: number; id?: number; category_name?: string } | null;
    product_class?: number | { class_id?: number; id?: number } | null;
    product_segment?: number | { segment_id?: number; id?: number } | null;
    product_section?: number | { section_id?: number; id?: number } | null;
    item_group_id?: number | { item_group_id?: number; id?: number; group_code?: string; group_name?: string } | null;
    tax_rate_id?: number | { TaxID?: number; tax_id?: number; id?: number; VATRate?: number | string; WithholdingRate?: number | string } | null;
    regulatory_code?: string | null;
    regulatory_notes?: string | null;
    price_control?: { priceTypeId: number; priceTypeName: string } | null;
}

export interface DirectusBOM {
    bom_id: number;
    product_id: number;
    bom_name: string;
    base_quantity: number;
    expected_yield_percentage: number;
    is_active: boolean;
    version: { id: number; version_name: string; created_at?: string } | number | null;
    valid_from?: string;
    valid_to?: string;
}

export interface DirectusUnit {
    unit_id: number;
    unit_name: string;
    unit_shortcut: string;
    density_required?: boolean | null;
}

export interface DirectusBOMComponent {
    component_id: number;
    bom_id: number;
    component_product_id: number;
    quantity_required: number;
    unit_of_measurement: { unit_id: number; unit_name: string; unit_shortcut: string } | null;
    wastage_factor_percentage: number;
    component_type: "raw_material" | "sub_assembly" | "by_product";
    landed_cost?: number | null;
}

export interface DirectusOperation {
    id: number;
    operation_name: string;
}

export interface DirectusRouting {
    routing_id: number;
    bom_id: number;
    operation_name: string;
    operation_id?: number | null;
    estimated_overhead_cost: number;
    duration_hours: number;
    sequence_order: number;
    step_batch_size?: number;
    requires_qa?: boolean;
}

export interface DirectusBOMComponentInput {
    id?: string | number;
    productId: number;
    quantity: number;
    uom?: string | null;
    uomId?: number | null;
    wastagePercent: number;
    type?: "raw_material" | "sub_assembly" | "by_product" | null;
    landedCost?: number | null;
}

export interface DirectusRoutingStepInput {
    id?: string | number;
    sequence: number;
    name: string;
    operationId?: number | null;
    machineHourlyRate: number;
    durationHours: number;
    stepBatchSize?: number;
    requiresQA?: boolean;
}

export interface CostRollupResult {
    productId: number;
    productName: string;
    sku: string;
    bomId: number | null;
    bomVersion: string | number;
    materialsCost: number;
    machineOverheadCost: number;
    customOverheadCost: number;
    additionalOperatingOverhead: number;
    totalOverheadExpenses: number;
    includedInCogs: number;
    excludedFromCogs: number;
    baseQuantity: number;
    /** Yield-adjusted cost for one finished unit. */
    unitCost: number;
    /** Yield-adjusted cost for the configured base batch. */
    batchCost: number;
    preYieldDirectCost: number;
    yieldAdjustedUnitCost: number;
    machineHours: number;
    totalMachineCost: number;
    routingsCost: number;
    yieldPercentage: number;
    yieldFactor: number;
    totalBaseCost: number;
    targetSellingPrice: number;
    grossProfit: number;
    grossMarginPercent: number;
    netProfit: number;
    netMarginPercent: number;
    marginBasis: "sales";
    costTree: CostNode[];
}

export interface CostNode {
    id: string;
    name: string;
    type: "ingredient" | "by_product" | "routing" | "sub_assembly";
    quantity: number;
    uom: string;
    unitCost: number;
    wastagePercent: number;
    totalCost: number;
    machineRate?: number;
    machineHours?: number;
    machineCostPerUnit?: number;
    stepBatchSize?: number;
    children?: CostNode[];
}

export interface DirectusProductVersion {
    id: number;
    product_id: number;
    version_name: string;
}
