export type MarginStatus = "high" | "healthy" | "moderate" | "low" | "negative";

export interface ContributionMarginRow {
    product_id: number;
    product_name: string;
    product_code: string;
    category_id: number | null;
    category_name: string;
    brand_id: number | null;
    brand_name: string;
    uom_name: string;

    // Sales metrics
    invoiced_quantity: number;
    gross_revenue: number;
    discount_amount: number;
    returned_quantity: number;
    returned_amount: number;
    net_sales_revenue: number;
    average_selling_price: number; // net_sales_revenue / invoiced_quantity

    // Manufacturing Cost (TMC)
    total_manufacturing_cost: number; // Total Manufacturing Cost (TMC)
    unit_manufacturing_cost: number;  // Unit TMC (TMC / invoiced_quantity)

    // Margin metrics
    unit_contribution_margin: number; // average_selling_price - unit_manufacturing_cost
    contribution_margin_amount: number; // net_sales_revenue - total_manufacturing_cost
    contribution_margin_ratio: number; // (contribution_margin_amount / net_sales_revenue) * 100
    margin_status: MarginStatus;

    // Linkages
    invoices_count: number;
    job_orders_count: number;
    job_order_ids: number[];
}

export interface CategoryLineSummary {
    category_id: number | null;
    category_name: string;
    skus_count: number;
    total_quantity_sold: number;
    net_sales_revenue: number;
    total_manufacturing_cost: number; // TMC
    contribution_margin_amount: number;
    contribution_margin_ratio: number;
    margin_status: MarginStatus;
}

export interface BrandLineSummary {
    brand_id: number | null;
    brand_name: string;
    skus_count: number;
    total_quantity_sold: number;
    net_sales_revenue: number;
    total_manufacturing_cost: number; // TMC
    contribution_margin_amount: number;
    contribution_margin_ratio: number;
    margin_status: MarginStatus;
}

export interface ContributionMarginSummaryKPIs {
    total_skus: number;
    total_units_sold: number;
    total_net_sales: number;
    total_manufacturing_cost: number; // TMC
    total_contribution_margin: number;
    overall_contribution_margin_ratio: number;
    profitable_skus_count: number;
    loss_skus_count: number;
    top_performing_category: string;
    top_performing_brand: string;
}

export interface ContributionMarginFilters {
    searchQuery: string;
    startDate: string;
    endDate: string;
    categoryId: string; // 'ALL' or string id
    brandId: string;    // 'ALL' or string id
    marginStatus: string; // 'ALL' or MarginStatus
}

export interface ContributionMarginReportResponse {
    rows: ContributionMarginRow[];
    categorySummaries: CategoryLineSummary[];
    brandSummaries: BrandLineSummary[];
    summary: ContributionMarginSummaryKPIs;
    availableCategories: Array<{ id: number; name: string }>;
    availableBrands: Array<{ id: number; name: string }>;
}
