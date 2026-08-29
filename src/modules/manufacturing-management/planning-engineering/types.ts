export interface Branch {
    id: number;
    branch_name: string;
    branch_code?: string;
    isActive?: boolean | number;
}

export interface ProductIdInfo {
    product_id: number;
    product_name: string;
    product_code: string;
    uom?: string;
    uom_count?: number;
    brand?: string;
    category?: string;
    parent_id?: number | null;
}

export interface SalesOrderDetail {
    detail_id: number;
    order_id: number;
    product_id: ProductIdInfo;
    unit_price: number;
    ordered_quantity: number;
    net_amount: number;
    bom_version_id?: number | null;
    bom_version_name?: string | null;
    order_no?: string;       // joined client-side from sales order parent
    customer_name?: string;  // joined client-side from sales order parent
    allocated_quantity?: number;
    allocated_amount?: number;
    served_quantity?: number;
    parent_order_status?: string | null;
    is_scheduled?: boolean;
    is_read_only?: boolean;
    id?: number;
}

export interface SalesOrder {
    order_id: number;
    order_no: string;
    po_no?: string;
    customer_code: string;
    customer_name?: string;
    order_date: string;
    order_status: string;
    total_amount: number;
    net_amount: number;
    remarks: string;
    created_date: string;
    branch_id?: number | null;
}

export interface NetRequirementItem {
    product_id: number;
    product_name: string;
    product_code: string;
    uom_name?: string;
    uom_shortcut?: string;
    unit_of_measurement?: string;
    gross_demand: number;
    on_hand: number;
    safety_stock: number;
    net_shortfall: number;
    is_sub_assembly?: boolean;
}

// -------------------------------------------------------------
// DDL Clean Schema Entities
// -------------------------------------------------------------

export type JobOrderStatus = 
    | "Draft" 
    | "Planned" 
    | "Released" 
    | "In Progress" 
    | "Ongoing" 
    | "Proceed" 
    | "On Hold" 
    | "Completed" 
    | "Finished" 
    | "Cancelled" 
    | "Closed";

export type JobOrderAllocationStatus = "ACTIVE" | "RELEASED" | "CONSUMED" | "CANCELLED";
export type JobOrderReservationType = "SOFT" | "HARD";
export type JobOrderOperationStatus = "Pending" | "In Progress" | "Completed" | "Skipped" | "Paused";

/**
 * manufacturing_job_orders DDL
 */
export interface JobOrder {
    job_order_id: number;
    job_order_no: string;
    parent_job_order_id?: number | null;
    product_id: number;
    version_id: number;
    target_quantity: number;
    completed_quantity: number;
    rejected_quantity: number;
    status: JobOrderStatus | string;
    primary_work_center_id?: number | null;
    shift_option?: string | null;
    sub_assembly_version_map?: Record<string, number> | string | null;
    branch_id?: number | null;
    created_by?: number | null;
    created_at?: string | null;
    modified_by?: number | null;
    modified_at?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    due_date?: string | null;
    remarks?: string | null;
    actual_quantity_produced?: number;
    quantity?: number;

    // Joined / Virtual Fields for UI
    id?: number;
    jo_id?: string;
    product_name?: string;
    product_code?: string;
    uom?: string;
    unit_of_measurement?: string;
    version_name?: string;
    branch_name?: string;
    creator_name?: string;
    primary_work_center_name?: string;
    daily_breakdown?: JobOrderDailyBreakdown[] | null;
    operations?: JobOrderOperation[];
    routes?: JobOrderOperation[];
    materials?: JobOrderMaterial[];
    allocations?: JobOrderAllocation[];
    status_history?: JobOrderStatusHistory[];
    genealogy?: JobOrderGenealogy[];
    child_job_orders?: JobOrder[];
    parent_job_order?: JobOrder | null;
    sales_orders?: Record<string, unknown>[];
}

/**
 * manufacturing_job_order_operations (and manufacturing_job_order_routes) DDL
 */
export interface JobOrderOperation {
    jo_operation_id?: number;
    jo_route_id?: number;
    id?: number;
    job_order_id: number;
    sequence_order: number;
    work_center_id: number;
    work_center_name?: string;
    work_center_code?: string;
    operation_id: number;
    operation_name?: string;
    operation_code?: string;
    planned_setup_hours: number;
    planned_run_hours: number;
    actual_setup_hours?: number;
    actual_run_hours?: number;
    step_batch_size?: number;
    run_time_hours_factor?: number;
    estimated_labor_cost?: number;
    actual_labor_cost?: number;
    status: JobOrderOperationStatus | string;
    completed_at?: string | null;
    assigned_operators?: JobOrderRouteOperator[];
    operators?: JobOrderRouteOperator[];
    qa_records?: JobOrderQARecord[];
}

/**
 * Operator logging on routing operation
 */
export interface JobOrderRouteOperator {
    jo_route_operator_id?: number;
    id?: number;
    jo_route_id?: number;
    jo_operation_id?: number;
    operator_id: number;
    operator_name?: string;
    logged_hours: number;
    hourly_rate?: number;
    logged_at?: string;
}

/**
 * manufacturing_job_order_materials DDL
 */
export interface JobOrderMaterial {
    jo_material_id?: number;
    id?: number;
    job_order_id: number;
    product_id: number;
    product_name?: string;
    product_code?: string;
    uom_id?: number;
    uom_name?: string;
    unit_shortcut?: string;
    unit_of_measurement?: string;
    allocated_quantity: number;
    reserved_quantity?: number;
    actual_consumed_quantity: number;
    scrap_quantity: number;
    unit_cost?: number;
    is_sub_assembly?: boolean;
    allocations?: JobOrderAllocation[];
    lot_allocations?: JobOrderAllocation[];
    staged_quantity?: number;
    required_quantity?: number;
    available_stock?: number;
    shortfall?: number;
    batch_no?: string;
    staging_bin?: string;
    location_bin?: string;
    quantity?: number;
}

/**
 * manufacturing_job_order_allocations DDL
 */
export interface JobOrderAllocation {
    allocation_id?: number;
    id?: number;
    job_order_id: number;
    job_order_material_id?: number | null;
    sales_order_detail_id?: number | null;
    lot_id?: number | null;
    batch_no?: string | null;
    location_bin?: string | null;
    allocated_quantity: number;
    reservation_type: JobOrderReservationType | string;
    status: JobOrderAllocationStatus | string;
    created_at?: string;
    created_by?: number | null;
    expiry_date?: string | null;
    product_id?: number;
    product_name?: string;
    purchase_order_receiving_id?: number | null;
}

/**
 * manufacturing_job_order_status_history DDL
 */
export interface JobOrderStatusHistory {
    history_id?: number;
    id?: number;
    job_order_id: number;
    previous_status: string;
    new_status: string;
    remarks?: string | null;
    changed_by?: number | null;
    changed_by_name?: string;
    changed_at?: string;
}

/**
 * jo_material_genealogy DDL
 */
export interface JobOrderGenealogy {
    genealogy_id?: number;
    id?: number;
    parent_job_order_id: number;
    child_job_order_id?: number | null;
    material_lot_id?: number | null;
    material_batch_no?: string | null;
    component_product_id: number;
    component_product_name?: string;
    quantity_used: number;
    consumed_at?: string;
    recorded_by?: number | null;
}

/**
 * Quality Inspection & QA records
 */
export interface JobOrderQARecord {
    qa_record_id?: number;
    id?: number;
    job_order_id: number;
    jo_route_id?: number;
    jo_operation_id?: number;
    parameter_id: number;
    parameter_name?: string;
    value_text?: string | null;
    value_numeric?: number | null;
    value_boolean?: boolean | null;
    is_passed: boolean;
    inspected_by?: number | null;
    inspected_by_name?: string;
    inspected_at?: string;
    remarks?: string | null;
}

export interface JobOrderDailyBreakdown {
    day: number;
    date: string;
    status: string;
    quantity: number;
}
