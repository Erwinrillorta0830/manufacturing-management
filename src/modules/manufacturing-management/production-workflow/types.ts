/* eslint-disable */
export interface OperatorAssignment {
    id: number;
    task_id: number;
    user_id: number;
    hourly_rate: number;
    logged_hours: number;
    is_team_lead?: boolean;
    started_at?: string | null;
    stopped_at?: string | null;
    user_name?: string;
    user_position?: string;
}

export interface RoutingTask {
    id: number;
    jo_route_id?: number;
    jo_id: string;
    routing_id: number;
    name: string;
    sequence_order: number;
    status: "Pending" | "Ongoing" | "Completed" | "QA Hold" | "Skipped" | string;
    planned_setup_hours: number;
    planned_run_hours: number;
    duration_hours?: number;
    actual_setup_hours: number;
    actual_run_hours: number;
    step_batch_size?: number;
    run_time_hours_factor?: number;
    work_center_id?: number | null;
    work_center_name?: string | null;
    completed_at: string | null;
    requires_qa: number; // 0 or 1
    qa_template_id?: number | null;
    assignments: OperatorAssignment[];
    qa_logs: any[];
    good_quantity?: number;
    scrap_quantity?: number;
    bom_items?: {
        product_id: number;
        product_name: string;
        qty_per_unit: number;
        total_needed: number;
        unit_shortcut: string;
        lot_no?: string;
        available_stock?: number;
    }[];
}

export interface JobOrder {
    jo_id: string;
    order_id?: number;
    job_order_id?: number;
    order_no?: string;
    job_order_no?: string;
    product_id: number;
    product_name: string;
    quantity: number;
    target_quantity?: number;
    completed_quantity?: number;
    rejected_quantity?: number;
    producedQty?: number;
    produced_quantity?: number;
    due_date: string;
    status: "Draft" | "Planned" | "Proceed" | "Ongoing" | "In Progress" | "Finished" | "Completed" | "On Hold" | string;
    branch_id: number;
    primary_work_center_id?: number | null;
    work_center_name?: string | null;
    routing_tasks?: RoutingTask[];
    routingTasks?: RoutingTask[];
    parentJobOrderId?: number | null;
    parent_job_order_id?: number | null;
    version_id?: number | null;
    version_name?: string;
    recipe_version_name?: string;
    shiftOption?: string;
    shift_option?: string;
    sub_assembly_version_map?: any;
    remarks?: string | null;
    created_by?: number | null;
    created_at?: string | null;
    yield_logs?: any[];
    sales_orders?: any[];
}

export const PRODUCTION_WORKFLOW_STATUS_FILTERS = [
    { value: "Active", label: "Active" },
    { value: "All", label: "All" },
    { value: "Proceed", label: "Released" },
    { value: "Ongoing", label: "In Progress" },
    { value: "On Hold", label: "On Hold" },
    { value: "Finished", label: "Finished" }
] as const;

export function matchesProductionWorkflowStatus(status: string, filter: string): boolean {
    if (filter === "All") return true;
    if (filter === "Active") return status === "Proceed" || status === "Ongoing";
    if (filter === "Proceed" || filter === "Released") return status === "Proceed";
    if (filter === "Ongoing" || filter === "In Progress") return status === "Ongoing";
    return status === filter;
}

export interface User {
    user_id: number;
    id: number;
    first_name?: string;
    last_name?: string;
    user_fname?: string;
    user_lname?: string;
    user_position?: string;
    position?: string;
    hourly_rate?: number;
    rate?: number;
}

export interface RouteOperatorRecord {
    id: number;
    jo_id: string;
    routing_id: number;
    task_id: number;
    user_id: number;
    started_at: string | null;
    stopped_at: string | null;
    actual_hours: number;
    hourly_rate: number;
    labor_cost: number;
    user_name?: string;
    user_position?: string;
}

export interface WorkCenter {
    work_center_id: number;
    work_center_name: string;
    asset_id?: number | null;
    department_id?: number | null;
    is_active?: boolean;
    barcode?: string | null;
    rfid_code?: string | null;
    serial?: string | null;
    asset?: {
        id?: number;
        barcode?: string;
        rfid_code?: string;
        serial?: string;
        item_name?: string;
        condition?: string;
    } | null;
    department?: {
        department_id?: number;
        department_name?: string;
    } | null;
}

export interface JobOrderStatusHistoryRecord {
    history_id?: number;
    id?: number;
    job_order_id: number | string;
    job_order_no?: string;
    work_center_id?: number | null;
    work_center_name?: string | null;
    previous_status?: string | null;
    status: string;
    changed_by?: number | null;
    changed_by_name?: string | null;
    changed_at: string;
    remarks?: string | null;
}

export interface RejectionReason {
    id: number | string;
    reason_id?: number | string;
    code: string;
    reason_name: string;
    description?: string;
    category?: string;
    is_active: boolean;
}

export interface MaterialGenealogyRecord {
    genealogy_id?: number;
    id?: number;
    job_order_id: number | string;
    job_order_no: string;
    finished_batch_no: string;
    raw_product_id: number;
    raw_product_name: string;
    raw_lot_id?: number | null;
    raw_batch_no: string;
    quantity_consumed: number;
    unit_shortcut?: string;
    created_at: string;
    created_by?: number | null;
    created_by_name?: string;
}

export interface QATemplateParameter {
    parameter_id: number;
    template_id: number;
    parameter_name?: string;
    test_name?: string;
    test_type: "Numeric" | "Boolean" | "Yes/No" | "Text" | string;
    min_value: number | null;
    max_value: number | null;
    target_value: string | null;
    is_critical: boolean | number;
}

export interface QATemplate {
    template_id: number;
    template_name: string;
    description: string | null;
    is_active: boolean;
}

export interface StationScanPayload {
    workCenterBarcode?: string;
    jobOrderBarcode?: string;
    workCenterId?: number;
    jobOrderId?: number | string;
    operatorId?: number;
    action?: "scan" | "start-station" | "lookup";
}

export interface StationScanResponse {
    success: boolean;
    message: string;
    workCenter?: WorkCenter | null;
    jobOrder?: JobOrder | null;
    activeOperation?: RoutingTask | null;
    statusTransitioned?: boolean;
    stationHistoryRecorded?: boolean;
    statusHistoryRecord?: JobOrderStatusHistoryRecord | null;
    error?: string;
}

export interface ShiftRunLogPayload {
    taskId: number;
    joId: string | number;
    shiftName: string;
    yieldQty: number;
    scrapQty?: number;
    rejectionReasonId?: number | string | null;
    rejectionRemarks?: string | null;
    inspectorId: number | null;
    qaStatus: "Passed" | "QA Hold" | "Pending";
    qaParameters?: Array<{
        parameter_id: number;
        test_name: string;
        value: string | number | boolean;
        is_failed: boolean;
        remarks?: string;
    }>;
    materialsConsumed?: Array<{
        product_id: number;
        actual_qty: number;
        lot_id?: number;
        batch_no?: string;
    }>;
    batchNo?: string;
    expiryDate?: string;
    manufacturingDate?: string;
    targetLotId?: number;
}
