export interface ComponentRequirement {
    product_id: number;
    component_name: string;
    component_code: string;
    unit: string;
    required_per_unit: number;
    available: number;
    max_producible_with_this: number;
}

export interface ProducibleGood {
    product_id: number;
    product_name: string;
    uom_name?: string;
    product_code: string;
    category: string;
    bom_name: string;
    base_quantity: number;
    max_producible: number;
    producible_if_fulfilled?: number | null;
    estimated_time_hours?: number;
    estimated_time_hours_if_fulfilled?: number | null;
    components: ComponentRequirement[];
}

export interface ProductionRun {
    jo_id: string;
    status: string;
    product_name: string;
    quantity: number;
    percentage: number;
    progress_text: string;
    due_date: string | null;
}

export interface InventoryProductItem {
    product_id: number;
    product_name: string;
    product_code: string;
    category: string;
    unit: string;
    unit_shortcut: string;
    cost: number;
    price: number;
    stock: number;
    value: number;
}

export interface DashboardData {
    wastage: {
        totalQuantity: number;
        totalValue: number;
        items: Array<{ name: string; code: string; qty: number; value: number; reason: string }>;
    };
    production: {
        totalQuantity: number;
        totalValue: number;
        items: Array<{ name: string; code: string; qty: number; value: number }>;
    };
    inventory: {
        rawMaterials: {
            totalSKUs: number;
            totalStock: number;
            totalValue: number;
            items: InventoryProductItem[];
        };
        packagingMaterials?: {
            totalSKUs: number;
            totalStock: number;
            totalValue: number;
            items: InventoryProductItem[];
        };
        finishedGoods: {
            totalSKUs: number;
            totalStock: number;
            totalValue: number;
            items: InventoryProductItem[];
        };
    };
    sellout: {
        totalQuantity: number;
        totalRevenue: number;
        items: Array<{ name: string; code: string; qty: number; revenue: number }>;
    };
    producibleGoods?: ProducibleGood[];
    branches: Array<{ id: number; branch_name: string }>;
    ongoingProduction?: {
        overallPercentage: number;
        runs: ProductionRun[];
    };
}

export type PresetType = "7d" | "30d" | "month" | "last_month" | "all";
export type DashboardTab = "production" | "raw" | "finished" | "sellout" | "producible";
