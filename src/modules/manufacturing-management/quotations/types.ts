export interface Customer {
    id: number | string;
    customer_name: string;
    customer_code: string;
    isActive?: boolean;
    default_price_type_id?: number;
    price_type_id?: number;
}

export interface Project {
    id: number;
    project_name: string;
    customer_code: string;
    created_by?: number;
    created_at?: string;
}

export interface QuotationHeader {
    id: number;
    quote_number: string;
    customer_id: number | Customer | null;
    total_selling_price: number;
    total_simulated_cost: number;
    forex_rate_used: number;
    remarks?: string;
    quote_date?: string;
    status?: string;
    project_id?: number | Project | null;
    created_by_name?: string;
}

export interface QuotationSnapshotNode {
    id: number;
    product_id: number;
    parent_id?: number | null;
    parent_product_name?: string | null;
    product_type_id?: number | null;
    product_type_name?: string | null;
    version_id: number;
    version_name?: string;
    node_name: string;
    node_type: string;
    quantity: number;
    uom: string;
    frozen_unit_cost_php: number;
    frozen_total_cost_php: number;
}

export interface CatalogProduct {
    product_id: number;
    product_name: string;
    product_code: string;
    price_per_unit: number;
    cost_per_unit: number;
    unit_of_measurement?: {
        unit_shortcut: string;
    };
    product_category?: unknown;
    parent_id?: {
        product_name: string;
    } | null;
    parent_product_id?: number;
    has_cogs?: boolean;
    product_type?: number | string;
}

export interface SelectedQuoteProduct {
    line_id?: number;
    product_type_id?: number;
    parent_product_id?: number;
    product?: CatalogProduct | null;
    priceTypePrice: number; // Preloaded price from price type
    agreedPrice: number; // User edited override price
    versionId?: number | null;
    versionName?: string | null;
}
