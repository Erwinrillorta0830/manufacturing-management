/* eslint-disable @typescript-eslint/no-explicit-any */
export interface QARejectionReason {
    id: number;
    reason_code: string;
    reason_name: string;
    category?: string | null;
    description?: string | null;
    is_active: boolean;
    created_at?: string;
}

export interface QAJOInspectionLog {
    id: number;
    job_order_id: number;
    job_order_no?: string;
    product_id?: number;
    product_name?: string;
    inspected_quantity: number;
    passed_quantity: number;
    rejected_quantity: number;
    rejection_reason_id?: number | null;
    rejection_reason?: QARejectionReason | null;
    rejection_reason_name?: string | null;
    rejection_reason_code?: string | null;
    rework_job_order_id?: number | null;
    rework_job_order_no?: string | null;
    inspected_by?: number | null;
    inspector_name?: string | null;
    inspected_at: string;
    status: "PASSED" | "REWORK_TRIGGERED" | "COMPLETED" | string;
    remarks?: string | null;
}

export interface JobOrderStatusHistory {
    history_id: number;
    job_order_id: number;
    job_order_no?: string;
    old_status?: string | null;
    new_status: string;
    changed_by?: number | null;
    changed_by_name?: string | null;
    changed_at: string;
    remarks?: string | null;
}

export interface JobOrder {
    id?: number | string;
    job_order_id?: number;
    job_order_no?: string;
    jo_id: string;
    order_id?: number | null;
    parent_job_order_id?: number | null;
    parent_job_order_no?: string | null;
    product_id: number;
    product_name: string;
    product_code?: string;
    version_id?: number | null;
    version_name?: string;
    recipe_version_name?: string;
    target_quantity?: number;
    quantity: number;
    completed_quantity?: number;
    actual_quantity_produced?: number;
    rejected_quantity?: number;
    due_date?: string | null;
    start_date?: string | null;
    status: string;
    branch_id?: number | null;
    branch_name?: string;
    primary_work_center_id?: number | null;
    shift_option?: string;
    sub_assembly_version_map?: Record<string, number> | null;
    created_by?: number | null;
    created_at?: string;
    modified_at?: string;
    remarks?: string | null;
    bom?: { version_id: number } | null;
    inspection_logs?: QAJOInspectionLog[];
    status_history?: JobOrderStatusHistory[];
    rework_job_orders?: JobOrder[];
    [key: string]: any;
}

export interface TwoPointQAInspectionPayload {
    job_order_id: number;
    job_order_no: string;
    product_id: number;
    branch_id: number;
    inspected_quantity: number;
    passed_quantity: number;
    rejected_quantity: number;
    rejection_reason_id?: number | null;
    lot_number?: string;
    manufacturing_date?: string;
    expiry_date?: string;
    unit_cost?: number;
    remarks?: string;
    user_id?: number;
}

export interface TwoPointQAInspectionResult {
    success: boolean;
    message: string;
    inspectionLog: QAJOInspectionLog;
    jobOrderStatus: string;
    reworkJobOrder?: {
        job_order_id: number;
        job_order_no: string;
        target_quantity: number;
        status: string;
    } | null;
    inventoryMovement?: {
        movement_id: number;
        quantity: number;
        batch_no: string;
    } | null;
}

export interface YieldJobOrderMaterial {
    materialId: number;
    jobOrderId: number;
    productId: number;
    productName: string;
    productCode: string;
    unitOfMeasure: string;
    allocatedQuantity: number;
    actualConsumedQuantity: number;
    scrapQuantity: number;
    reservedQuantity: number;
    remainingQuantity: number;
    // Directus aliases are kept for existing receipt/reprint consumers.
    jo_material_id: number;
    job_order_id: number;
    product_id: number;
    allocated_quantity: number;
    actual_consumed_quantity: number;
    scrap_quantity: number;
    reserved_quantity: number;
    product_name: string;
    product_code: string;
    unit_shortcut: string;
}

export interface QALog {
    id: number;
    task_id: {
        jo_route_id: number;
        jo_id: string;
        operation_name?: string;
        name?: string;
        sequence_order: number;
        status: string;
        [key: string]: any;
    } | number | null;
    expected_quantity: number;
    actual_quantity: number;
    deviation_quantity: number;
    qa_status: "Passed" | "Failed";
    recorded_at: string;
    comments?: string;
    photos?: string | null;
}

export interface DispositionRecord {
    id: string;
    jo_id: string;
    job_order_id?: number | null;
    task_id: string | number;
    task_name: string;
    station_id?: number | null;
    station_name?: string;
    product_id?: number | null;
    product_name: string;
    expected_quantity: number;
    actual_quantity: number;
    failed_parameters: Array<{
        parameter_id: number;
        test_name: string;
        min_value?: number | null;
        max_value?: number | null;
        value?: any;
        is_failed: boolean;
        is_critical: boolean;
    }>;
    disposition_status: "Pending" | "Resolved";
    decision: "Release with Deviation" | "Rework" | "Scrap" | null;
    supervisor_comments: string;
    inspection_remarks?: string;
    recorded_at: string;
    resolved_at: string | null;
    resolved_by: number | null;
}

export interface Branch {
    id?: number;
    branch_id?: number;
    name?: string;
    branch_name?: string;
}

export interface PageMeta {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    meta: PageMeta;
}

export interface QASummary {
    jobOrderCount: number;
    activeJobOrderCount: number;
    closedJobOrderCount: number;
    inspectionLogCount: number;
    pendingHoldCount: number;
}
