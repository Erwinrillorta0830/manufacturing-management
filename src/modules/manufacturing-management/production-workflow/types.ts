/* eslint-disable */
import type { CanonicalJobOrderStatus } from "../job-order-status";
export interface OperatorAssignment {
    id: number;
    task_id: number;
    user_id: number;
    hourly_rate: number;
    logged_hours: number;
    is_team_lead?: boolean;
    started_at?: string | null;
    stopped_at?: string | null;
    is_active?: boolean;
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
    work_center?: WorkCenter | null;
    completed_at: string | null;
    requires_qa: number; // 0 or 1
    qa_template_id?: number | null;
    qa_record_exists: boolean;
    shift_progress_exists: boolean;
    qa_status?: "Pending" | "Passed" | "QA Hold" | null;
    assignments: OperatorAssignment[];
    assigned_personnel?: number[];
    qa_logs: any[];
    good_quantity?: number;
    scrap_quantity?: number;
    bom_items?: {
        product_id: number;
        product_name: string;
        qty_per_unit: number;
        total_needed: number;
        quantity_basis?: "PER_FINISHED_UNIT" | string;
        demand_required?: number | null;
        planned_required?: number | null;
        unit_shortcut: string;
        lot_no?: string;
        available_stock?: number;
    }[];
}

export interface SalesOrderLink {
    jo_id?: string;
    order_id?: number;
    sales_order_detail_id?: number | null;
    order_no: string;
    customer_code?: string | null;
    customer_name?: string | null;
    quantity?: number;
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
    productionOutputQuantity?: number;
    due_date: string;
    status: CanonicalJobOrderStatus | string;
    branch_id: number;
    uom_id?: number | null;
    uom_shortcut?: string | null;
    uom_name?: string | null;
    priority?: number;
    start_date?: string | null;
    primary_work_center_id?: number | null;
    primary_work_center_name?: string | null;
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
    cancellation_image_id?: string | null;
    cancellation_image_url?: string | null;
    termination_image_id?: string | null;
    termination_image_url?: string | null;
    created_by?: number | null;
    created_at?: string | null;
    yield_logs?: any[];
    sales_orders?: SalesOrderLink[];
    salesOrders?: SalesOrderLink[];
    assigned_personnel?: Record<string, number[]> | null;
    assignedPersonnel?: Record<string, number[]> | null;
}

export interface JobOrderMaterialReturnLine {
    joMaterialId: number;
    productId: number;
    productName: string;
    uomId: number;
    uomShortcut: string;
    branchId: number;
    mmLotId: number;
    batchNo: string;
    sourceBin: string;
    targetBin: string;
    stagedQuantity: number;
    consumedQuantity: number;
    returnableQuantity: number;
    reservationIds: number[];
    releaseOnly: boolean;
}

export interface JobOrderCancellationPreview {
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    productName: string;
    branchId: number;
    status: string;
    cancellationImageId: string | null;
    cancellationImageUrl: string | null;
    cancellable: boolean;
    canReturnMaterials: boolean;
    blockedReason: string | null;
    lines: JobOrderMaterialReturnLine[];
    totals: {
        stagedQuantity: number;
        consumedQuantity: number;
        returnableQuantity: number;
    };
}

export interface JobOrderCancellationResponse {
    jobOrderId: number;
    jobOrderNo: string;
    status: string;
    cancellationImageId: string | null;
    cancellationImageUrl: string | null;
    lines: JobOrderMaterialReturnLine[];
    returnedQuantity: number;
    releasedReservationCount: number;
    movementCount: number;
    alreadyCancelled: boolean;
}

export interface JobOrderCancellationPayload {
    action: "cancel-and-return" | "return-materials";
    joId: string | number;
    reason?: string;
    actorUserId?: number | null;
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
    is_active?: boolean;
    is_placeholder?: boolean;
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
        barcode?: string | null;
        rfid_code?: string | null;
        serial?: string | null;
        item_name?: string | null;
        item_image?: string | { id?: string | number } | null;
        condition?: string | null;
        is_active?: boolean | number | string | null;
        item_id?: {
            id?: number;
            item_name?: string | null;
        } | null;
    } | null;
    department?: {
        department_id?: number;
        department_name?: string;
    } | null;
}

export type WorkCenterJobOrderAssignmentSource = "JO_ROUTE" | "VERSION_ROUTING" | "PRIMARY_WORK_CENTER";

export interface StationJobOrderSummary {
    jobOrderId: number;
    jobOrderNo: string;
    productId: number | null;
    productName: string;
    status: string;
    branchId: number | null;
    quantity: number;
    routeId: number;
    routeSequence: number;
    operationName: string;
    routeStatus: string;
    assignmentSource: WorkCenterJobOrderAssignmentSource;
}

export interface WorkCenterJobOrderAvailability {
    workCenterId: number;
    workCenterName: string;
    availableJobOrders: StationJobOrderSummary[];
    inProgressJobOrders: StationJobOrderSummary[];
}

export interface JobOrderStatusHistoryRecord {
    history_id?: number;
    id?: number;
    job_order_id: number | string;
    jo_route_id?: number | null;
    reported_yield_quantity?: number | null;
    evidence_image_id?: string | null;
    job_order_no?: string;
    work_center_id?: number | null;
    work_center_name?: string | null;
    previous_status?: string | null;
    status: string;
    changed_by?: number | null;
    changed_by_name?: string | null;
    changed_at: string;
    workflow_action?: string | null;
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
    joRouteId?: number;
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

export interface MaterialCandidateLot {
    receipt_id: number | null;
    receipt_no?: string | null;
    source_type?: "RAW_MATERIAL" | "MANUFACTURING" | "INVENTORY" | string | null;
    storage_lot_name?: string | null;
    mm_lot_id?: number | null;
    inventory_lot_id?: number | null;
    lot_no: string;
    received_quantity?: number;
    physical_quantity?: number;
    available: number;
    expiry_date?: string | null;
    manufacturing_date?: string | null;
    reservation_id?: number | string | null;
    reserved_qty_for_this_lot?: number;
}

export interface ProductionMaterialReservation {
    reservation_id: number | null;
    jo_material_id: number;
    product_id: number;
    product_name: string;
    product_code?: string;
    uom_id: number | null;
    unit_shortcut: string;
    mm_lot_id: number | null;
    mm_lot_name?: string | null;
    inventory_lot_id: number | null;
    inventory_lot_batch_no?: string | null;
    batch_no: string | null;
    reservation_status: string | null;
    allocated_quantity?: number;
    required_quantity?: number;
    reserved_quantity: number;
    staged_quantity: number;
    issued_to_wip_quantity: number;
    actual_used_quantity: number;
    returned_quantity: number;
    remaining_wip_quantity: number;
    available_stock: number;
    actual_qty: string;
    theoretical_quantity?: number;
    material_consumption_variance_tolerance_pct?: number | string | null;
    variance_quantity?: number | null;
    variance_reason?: string | null;
    variance_approved_by?: number | null;
    variance_approved_at?: string | null;
    is_sub_assembly?: boolean;
    candidate_lots?: MaterialCandidateLot[];
}

export interface JobOrderMaterialBatch {
    reservation_id?: number | null;
    batch_no?: string | null;
    reservation_status?: string | null;
    reserved_quantity?: number;
    staged_quantity?: number;
    issued_to_wip_quantity?: number;
    remaining_wip_quantity?: number;
}

export interface JobOrderMaterialLine {
    jo_material_id?: number;
    product_id: number;
    product_name: string;
    reservations: JobOrderMaterialBatch[];
}

export interface WipTopUpPayload {
    jobOrderId: number;
    joMaterialId: number;
    productId: number;
    sourceType: "RAW_MATERIAL" | "MANUFACTURING";
    receiptId?: number | null;
    mmLotId?: number | null;
    inventoryLotId?: number | null;
    batchNo?: string;
    uomId?: number | null;
    quantity: number;
    idempotencyKey: string;
    remarks?: string;
}

export interface WipTopUpResponse {
    success: boolean;
    idempotent?: boolean;
    message?: string;
    error?: string;
    code?: string;
    reservation?: {
        reservationId: number | null;
        mmLotId: number;
        inventoryLotId: number;
        batchNo: string;
        uomId?: number | null;
        addedQuantity: number;
        reservedQuantity: number;
        stagedQuantity: number;
        issuedToWipQuantity: number;
        remainingWipQuantity: number;
    } | null;
}

export interface ShiftRunMaterialConsumption {
    joMaterialId: number;
    reservationId: number;
    productId: number;
    mmLotId: number;
    inventoryLotId: number;
    batchNo: string;
    uomId: number;
    actualQty: number;
}

export interface ShiftRunLogPayload {
    sessionScope: "ROUTE" | "JOB_ORDER";
    sessionKey: string;
    taskId: number | null;
    joId: string | number;
    workCenterId: number | null;
    shiftName: string;
    productionDate: string;
    yieldQty: number;
    rejectedQty: number;
    scrapQty: number;
    remarks?: string | null;
    rejectionReasonId?: number | string | null;
    rejectionRemarks?: string | null;
    /** @deprecated The API resolves the operator from the authenticated session. */
    inspectorId?: number | null;
    /** @deprecated Production sessions always start Pending QA. */
    qaStatus?: "Passed" | "QA Hold" | "Pending";
    qaParameters?: Array<{
        parameter_id: number;
        test_name: string;
        value: string | number | boolean;
        is_failed: boolean;
        remarks?: string;
    }>;
    materialsConsumed: ShiftRunMaterialConsumption[];
    varianceReason?: string | null;
    approveVariance?: boolean;
    /** Required photo captured at the end of the production shift. */
    evidenceImage: File;
}
