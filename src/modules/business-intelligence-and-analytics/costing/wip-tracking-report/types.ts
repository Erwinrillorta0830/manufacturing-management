import type { CanonicalJobOrderStatus } from "./job-order-status";

export interface WipOperatorAssignment {
    id: number;
    operator_id: number;
    operator_name: string;
    operator_position?: string;
    logged_hours: number;
    hourly_rate?: number;
    started_at?: string | null;
    stopped_at?: string | null;
}

export interface WipRouteStage {
    jo_route_id: number;
    job_order_id: number;
    sequence_order: number;
    operation_id: number;
    operation_name: string;
    work_center_id: number;
    work_center_name: string;
    planned_setup_hours: number;
    planned_run_hours: number;
    actual_setup_hours: number;
    actual_run_hours: number;
    total_planned_hours: number;
    total_actual_hours: number;
    status: "Pending" | "In Progress" | "Completed" | "QA Hold" | "Skipped" | string;
    started_at?: string | null;
    completed_at: string | null;
    requires_qa: boolean;
    operators: WipOperatorAssignment[];
}

export interface WipMaterialReservation {
    jo_materials_reservation_id: number;
    jo_material_id: number;
    product_id: number;
    product_name: string;
    product_code?: string;
    uom_name: string;
    batch_no?: string | null;
    mm_lot_id?: number | null;
    lot_name?: string | null;
    staging_bin?: string | null;
    reserved_quantity: number;
    staged_quantity: number;
    issued_to_wip_quantity: number;
    actual_used_quantity: number;
    returned_quantity: number;
    remaining_wip_quantity: number;
    reservation_status: string;
    expiry_date?: string | null;
    wip_started_at?: string | null;
    wip_started_by_name?: string | null;
    share_percent?: number;
    unit_cost?: number;
    total_value?: number;
}

export interface WipJobOrder {
    job_order_id: number;
    job_order_no: string;
    product_id: number;
    product_name: string;
    product_code?: string;
    product_category?: string | null;
    lot_number?: string | null;
    batch_number?: string | null;
    uom_name: string;
    target_quantity: number;
    actual_quantity_produced: number;
    completed_quantity: number;
    rejected_quantity: number;
    status: CanonicalJobOrderStatus | string;
    priority: number;
    branch_id: number;
    branch_name: string;
    primary_work_center_id?: number | null;
    primary_work_center_name?: string | null;
    shift_option?: string;
    start_date: string | null;
    end_date: string | null;
    production_started_at: string | null;
    production_completed_at: string | null;
    created_at?: string | null;
    remarks?: string | null;
    
    // Calculated Progress Metrics
    stages: WipRouteStage[];
    total_stages: number;
    completed_stages_count: number;
    in_progress_stages_count: number;
    current_stage: WipRouteStage | null;
    stage_progress_percent: number;
    quantity_progress_percent: number;
    
    // Duration & Timeliness
    total_planned_hours: number;
    total_actual_hours: number;
    elapsed_hours: number;
    is_delayed: boolean;
    
    // Material WIP
    materials: WipMaterialReservation[];
    total_wip_materials_count: number;
    total_wip_remaining_quantity: number;
    total_material_input: number;

    // Continuous Process Metrics (Image 1 Alignment)
    wip_value: number;
    material_wip_value?: number;
    labor_wip_value?: number;
    overhead_wip_value?: number;
    parent_job_order_id?: number | null;
    material_yield_percent: number;
    actual_throughput_rate: number;
    rated_capacity_per_hour: number;
    rate_attainment_percent: number;
    residence_hours: number | null;
    wip_level_status: "in_range" | "below_target" | "above_target";
    current_wip_quantity: number;
    remaining_output: number;
    hours_to_finish: number | null;
    transactions?: WipTransaction[];
}

export type WipDetailTab = "overview" | "stages" | "materials" | "transactions";

export interface WipTransaction {
    id: string | number;
    timestamp: string;
    type: string;
    material_name?: string;
    material_code?: string;
    batch_no?: string | null;
    quantity: number;
    uom: string;
    notes?: string;
    operator_name?: string;
    action?: string;
    event_key?: string | null;
}

export interface WipSummaryMetrics {
    total_active_jobs: number;
    jobs_in_production: number;
    jobs_on_hold: number;
    jobs_picked_ready: number;
    jobs_in_qa: number;
    average_stage_progress_percent: number;
    average_quantity_progress_percent?: number;
    total_wip_materials_volume: number;
    delayed_jobs_count: number;

    // Continuous Process Summary
    total_floor_wip_value: number;
    average_rate_attainment_percent: number;
    average_material_yield_percent: number;
}

export interface WorkCenterQueueSummary {
    work_center_id: number;
    work_center_name: string;
    capacity_per_hour: number;
    active_jobs_count: number;
    running_stages_count: number;
    pending_stages_count: number;
    jobs: WipJobOrder[];
}

export interface WipFilterState {
    search: string;
    status: string; // 'ALL_ACTIVE' | specific status
    workCenterId: number | null;
    productId: number | null;
    branchId: number | null;
    delayedOnly: boolean;
}

export interface WipMasterData {
    workCenters: Array<{ work_center_id: number; work_center_name: string }>;
    products: Array<{ product_id: number; product_name: string; product_code?: string }>;
    branches: Array<{ id: number; branch_name: string; branch_code?: string }>;
}

export interface WipApiResponse {
    success: boolean;
    data: {
        jobs: WipJobOrder[];
        summary: WipSummaryMetrics;
        workCenterQueues: WorkCenterQueueSummary[];
        masterData: WipMasterData;
        serverTimestamp: string;
    };
    message?: string;
}
