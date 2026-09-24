export type MarginStatus = "high" | "healthy" | "moderate" | "low" | "negative";

export interface JobOrderProfitabilityRow {
    job_order_id: number;
    job_order_no: string;
    product_id: number;
    product_name: string;
    product_code: string;
    version_id: number;
    branch_id: number;
    status: string;
    target_quantity: number;
    actual_quantity_produced: number;
    total_quantity_consumed: number;
    yield_efficiency_percent: number;
    start_date: string | null;
    end_date: string | null;
    customer_code: string | null;
    sales_order_no: string | null;
    sales_order_id: number | null;
    sales_unit_price: number;
    total_revenue: number;
    direct_materials_cost: number;
    direct_labor_cost: number;
    overhead_cost: number;
    total_cogs: number;
    unit_cogs: number;
    gross_profit: number;
    gross_margin_percent: number;
    margin_status: MarginStatus;
    materials_count: number;
    operators_count: number;
    routes_count: number;
}

export interface MaterialCostItem {
    consumage_id: number;
    product_id: number;
    product_name: string;
    product_code: string;
    quantity_consumed: number;
    unit_cost: number;
    total_cost: number;
    batch_no?: string | null;
}

export interface LaborCostItem {
    jo_route_operator_id: number;
    jo_route_id: number;
    operator_id: number;
    operator_name?: string;
    logged_hours: number;
    hourly_rate: number;
    labor_cost: number;
    started_at: string | null;
    stopped_at: string | null;
}

export interface OverheadCostItem {
    jo_route_id: number;
    work_center_id: number;
    work_center_name: string;
    planned_run_hours: number;
    actual_run_hours: number;
    overhead_cost_per_hour: number;
    total_overhead_cost: number;
    status: string;
}

export interface JobOrderCostBreakdown {
    job_order_id: number;
    job_order_no: string;
    product_name: string;
    materials: MaterialCostItem[];
    labor: LaborCostItem[];
    overheads: OverheadCostItem[];
    totalMaterialsCost: number;
    totalLaborCost: number;
    totalOverheadCost: number;
    totalCogs: number;
    actualQuantity: number;
    unitCogs: number;
    sellingPrice: number;
    grossProfit: number;
    grossMarginPercent: number;
}

export interface ProfitabilitySummaryKPIs {
    total_jobs: number;
    total_revenue: number;
    total_cogs: number;
    total_materials_cost: number;
    total_labor_cost: number;
    total_overhead_cost: number;
    total_gross_profit: number;
    average_gross_margin_percent: number;
    profitable_jobs_count: number;
    loss_jobs_count: number;
}

export interface ProfitabilityFilters {
    search: string;
    status: string;
    marginStatus: string; // 'all' | 'high' | 'healthy' | 'moderate' | 'low' | 'negative'
    startDate: string;
    endDate: string;
    branchId?: number | string;
}

export interface MasterLookupData {
    statuses: string[];
    branches: Array<{ id: number; name: string }>;
}
