export interface QARejectionReasonSummary {
    id: number;
    reason_code: string;
    reason_name: string;
    category?: string | null;
}

export interface FPYReportRow {
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
    rework_quantity: number;
    scrap_quantity: number;
    fpy_percentage: number;
    rework_rate_percentage: number;
    scrap_rate_percentage: number;
    rework_count: number;
    linked_rework_nos: string[];
    top_rejection_reason: string | null;
    rejection_category: string | null;
    quality_tier: "Excellent" | "Acceptable" | "Needs Attention";
    status: string;
    date: string | null;
    start_date: string | null;
    end_date: string | null;
    production_completed_at: string | null;
    qa_started_at: string | null;
    closed_at: string | null;
}

export interface FPYSummaryKPIs {
    total_jobs: number;
    total_inspected_units: number;
    total_passed_first_time: number;
    total_reworked_units: number;
    total_scrapped_units: number;
    overall_fpy_percentage: number;
    overall_rework_rate: number;
    overall_scrap_rate: number;
    excellent_jobs_count: number;
    acceptable_jobs_count: number;
    needs_attention_jobs_count: number;
    top_defect_reason: string;
}

export interface FPYFilters {
    search: string;
    branchId: string;
    productId: string;
    qualityTier: "all" | "excellent" | "acceptable" | "needs_attention";
    dateFrom: string;
    dateTo: string;
    status: string;
}

export interface MasterDataOption {
    id: number;
    label: string;
    code?: string;
    extra?: string;
}

export interface FPYMasterData {
    branches: MasterDataOption[];
    products: MasterDataOption[];
    rejectionReasons: QARejectionReasonSummary[];
    statuses: string[];
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

export interface RouteStepItem {
    jo_route_id: number;
    sequence_order: number;
    work_center_name: string;
    operation_name: string;
    planned_run_hours: number;
    actual_run_hours: number;
    status: string;
    completed_at: string | null;
    requires_qa: boolean;
}

export interface ParameterQARecord {
    qa_record_id: number;
    jo_route_id: number | null;
    parameter_id: number;
    parameter_name?: string;
    value_text?: string | null;
    value_numeric?: number | null;
    value_boolean?: boolean | null;
    is_passed: boolean;
    inspected_at: string | null;
    remarks?: string | null;
}

export interface ShiftYieldLedgerItem {
    ledger_id: number;
    shift_name: string;
    yield_quantity: number;
    rejected_quantity: number;
    scrap_quantity: number;
    qa_status: string;
    lot_number: string | null;
    logged_at: string | null;
    production_date: string | null;
    remarks?: string | null;
}

export interface LinkedReworkOrderItem {
    job_order_id: number;
    job_order_no: string;
    target_quantity: number;
    actual_quantity_produced: number;
    status: string;
    created_at: string | null;
}

export interface FPYDetailBreakdown {
    jobOrder: {
        job_order_id: number;
        job_order_no: string;
        parent_job_order_id: number | null;
        product_name: string;
        product_code: string;
        branch_name: string;
        target_quantity: number;
        actual_quantity_produced: number;
        completed_quantity: number;
        fpy_percentage: number;
        quality_tier: "Excellent" | "Acceptable" | "Needs Attention";
        status: string;
        initialized_at: string | null;
        production_started_at: string | null;
        production_completed_at: string | null;
        qa_started_at: string | null;
        closed_at: string | null;
        remarks: string | null;
    };
    inspectionLogs: InspectionLogItem[];
    routeSteps: RouteStepItem[];
    qaRecords: ParameterQARecord[];
    yieldLedgers: ShiftYieldLedgerItem[];
    reworkOrders: LinkedReworkOrderItem[];
}
