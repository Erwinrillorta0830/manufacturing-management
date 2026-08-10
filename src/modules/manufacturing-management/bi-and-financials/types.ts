export interface BOMItem {
    id: string;
    productId?: number;
    name: string;
    quantity: number;
    uom: string;
    wastagePercent: number;
    landedCost: number;
}

export interface Product {
    id: string;
    sku: string;
    title: string;
    baseUom: string;
    expectedYieldPercent: number;
    targetSellingPrice: number;
    bom: BOMItem[];
    routingCost: number;
    has_versions?: boolean;
    unitOfMeasurementCount?: number;
    bomId?: number;
    versionId?: number;
    versionName?: string;
    currentInventory: number;
    parent_id?: string | number | null;
    parentProduct?: boolean;
}

export interface InventoryData {
    ledger: {
        id: number;
        productId: string | number;
        quantity: number | string;
        branchId?: string | number;
    }[];
    products: {
        product_id: string | number;
        product_name: string;
        product_code: string;
    }[];
}

export interface SalesOrderDetail {
    product_id: string | number | { product_id: string | number; product_name: string };
    quantity: number | string;
    order_id: string | number;
}

export interface SalesOrder {
    order_id: string | number;
    created_date?: string;
    created_on?: string;
    date?: string;
}

export interface SalesOrdersData {
    data: SalesOrder[];
    detailsMap: Record<number, SalesOrderDetail[]>;
}

export interface ProductFamily {
    id: string;
    sku: string;
    title: string;
    baseUom: string;
    currentInventory: number;
    targetSellingPrice: number;
    expectedYieldPercent: number;
    bom: BOMItem[];
    routingCost: number;
    has_versions?: boolean;
    bomId?: number;
    versionId?: number;
    versionName?: string;
    displayUom: string;
    displayDivisor: number;
    children: Product[];
    parentProductObj: Product;
}

export interface IngredientRequirement {
    name: string;
    required: number;
    stock: number;
    safetyStock: number;
    isShortage: boolean;
    uom: string;
}

export interface ProductForecastingSummary {
    id: string;
    sku: string;
    title: string;
    baseUom: string;
    displayUom: string;
    displayDivisor: number;
    currentInventoryDisplay: number;
    forecastedDemand30d: number;
    netDeficit: number;
    ingredientsRequirements: IngredientRequirement[];
    hasMaterialShortage: boolean;
    children: Product[];
    parentProductObj: Product;
    selectedVariantId: string;
    selectedVariantTitle: string;
    selectedVariantUom: string;
    netDeficitInVariant: number;
    bom: BOMItem[];
    versionName: string;
}
