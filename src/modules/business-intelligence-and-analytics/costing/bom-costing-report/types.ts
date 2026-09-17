export type MaterialClassification = "finished_good" | "sub_assembly" | "raw_material" | "packaging";
export type InventoryRule = "FEFO" | "FIFO" | "N/A";

export interface ProductOption {
    product_id: number;
    product_name: string;
    description: string | null;
    product_code: string | null;
    product_type: number | null;
    parent_id: number | null;
    is_parent: boolean;
    has_versions: boolean;
    material_type: MaterialClassification;
    uom_name?: string;
}

export interface VersionOption {
    version_id: number;
    product_id: number;
    version_name: string;
    base_quantity: number;
    uom_id: number;
    uom_name: string;
    status: string;
    is_primary: boolean;
    expected_yield_percentage: number;
    custom_overhead: number;
}

export interface BOMCostNode {
    id: string;
    level: number;
    parentId: string | null;
    productId: number;
    productName: string;
    description?: string | null;
    productCode: string;
    productType: number | null;
    materialClassification: MaterialClassification;
    inventoryRule: InventoryRule;
    routeSequence: number | null;
    operationName: string | null;
    baseRequiredQty: number;
    scaledRequiredQty: number;
    wastagePercent: number;
    effectiveQty: number;
    wastageQty: number;
    uomName: string;
    unitCost: number;
    netLineCost: number;
    totalLineCost: number;
    wastageCost: number;
    isSubAssembly: boolean;
    subAssemblyVersionName?: string | null;
    children: BOMCostNode[];
}

export interface TargetProductSummary {
    product_id: number;
    product_name: string;
    description?: string | null;
    product_code: string | null;
    version_id: number;
    version_name: string;
    base_quantity: number;
    target_quantity: number;
    uom_name: string;
    expected_yield_percentage: number;
}

export interface BOMCostingSummary {
    totalNetMaterialCost: number;
    totalMaterialCost: number;
    costPerUnit: number;
    totalWastageCost: number;
    effectiveWastageIncreasePct: number;
    totalComponentsCount: number;
    rawMaterialsCost: number;
    packagingCost: number;
    subAssembliesCost: number;
    maxDepth: number;
}

export interface BOMCostingReportData {
    targetProduct: TargetProductSummary;
    tree: BOMCostNode[];
    summary: BOMCostingSummary;
}
