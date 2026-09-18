export interface QARejectionReasonSummary {
    id: number;
    reason_code: string;
    reason_name: string;
    category?: string | null;
}

export interface DefectCategorySummary {
    category: string;
    defectCount: number;
    rejectedQuantity: number;
    percentage: number;
}

export interface ScrapReportRow {
    job_order_id: number;
    job_order_no: string;
    parent_job_order_id: number | null;
    is_rework_order: boolean;
    branch_id: number;
    branch_name: string;
    product_id: number;
    product_name: string;
    product_code: string;
    target_quantity: number;
    actual_quantity_produced: number;
    completed_quantity: number;
    inspected_quantity: number;
    passed_quantity: number;
    rejected_quantity: number;
    scrap_quantity: number;
    scrap_rate_percentage: number;
    material_loss_php: number;
    rework_quantity: number;
    rework_hours: number;
    rework_labor_cost_php: number;
    top_defect_category: string | null;
    top_rejection_reason: string | null;
    status: string;
    date: string | null;
    start_date: string | null;
    end_date: string | null;
    production_completed_at: string | null;
    closed_at: string | null;
}

export interface ScrapSummaryKPIs {
    total_jobs: number;
    total_produced_units: number;
    total_scrapped_units: number;
    overall_scrap_rate: number;
    total_material_loss_php: number;
    total_rework_hours: number;
    total_rework_labor_cost_php: number;
    top_defect_category: string;
    top_rejection_reason: string;
}

export interface ScrapFilters {
    search: string;
    branchId: string;
    productId: string;
    defectCategory: string;
    status: string;
    dateFrom: string;
    dateTo: string;
}

export interface MasterDataOption {
    id: number;
    label: string;
    code?: string;
    extra?: string;
}

export interface ScrapMasterData {
    branches: MasterDataOption[];
    products: MasterDataOption[];
    defectCategories: string[];
    rejectionReasons: QARejectionReasonSummary[];
    statuses: string[];
}

export interface MaterialLossDetailItem {
    jo_material_id?: number;
    consumage_id?: number;
    product_id: number;
    product_name: string;
    product_code: string;
    unit_of_measurement?: string;
    allocated_quantity: number;
    actual_consumed_quantity: number;
    scrap_quantity: number;
    unit_cost: number;
    total_material_loss_php: number;
    batch_no?: string | null;
}

export interface ReworkLaborDetailItem {
    jo_route_operator_id: number;
    jo_route_id: number;
    operator_id: number;
    operator_name: string;
    work_center_name?: string;
    operation_name?: string;
    logged_hours: number;
    hourly_rate: number;
    labor_cost_php: number;
    started_at?: string | null;
    stopped_at?: string | null;
}

export interface InspectionLogItem {
    id: number;
    job_order_id: number;
    inspected_quantity: number;
    passed_quantity: number;
    rejected_quantity: number;
    rejection_reason_id?: number | null;
    rejection_reason_name?: string | null;
    rejection_reason_code?: string | null;
    rejection_category?: string | null;
    rework_job_order_id?: number | null;
    rework_job_order_no?: string | null;
    inspected_by?: number | null;
    inspector_name?: string | null;
    inspected_at: string | null;
    status: string;
    remarks?: string | null;
}

export interface ScrapDetailBreakdown {
    job_order_id: number;
    job_order_no: string;
    product_name: string;
    product_code: string;
    branch_name: string;
    status: string;
    target_quantity: number;
    actual_quantity_produced: number;
    scrap_quantity: number;
    scrap_rate_percentage: number;
    total_material_loss_php: number;
    total_rework_hours: number;
    total_rework_labor_cost_php: number;
    material_losses: MaterialLossDetailItem[];
    rework_labor: ReworkLaborDetailItem[];
    inspection_logs: InspectionLogItem[];
}
