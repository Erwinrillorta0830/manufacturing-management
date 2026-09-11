import type { CanonicalJobOrderStatus } from "../job-order-status";

/**
 * src/modules/manufacturing-management/material-staging/types.ts
 * Type definitions for Material Staging & Floor Holds Module
 */

export type JobOrderStatus = CanonicalJobOrderStatus;

export type ReservationStatus = "SOFT" | "HARD" | "PARTIAL";

export type AllocationMode = "auto" | "manual";

export interface Branch {
    id: number;
    branchName: string;
    branchCode?: string;
}

export interface WorkCenter {
    work_center_id: number;
    work_center_name: string;
    is_active?: boolean;
    department_id?: number | null;
    asset_id?: number | null;
}

export interface AllocatedLot {
    allocation_id?: number;
    mm_lot_id?: number;
    inventory_lot_id?: number;
    lot_id: number;
    batch_no: string;
    allocated_quantity: number;
    staged_quantity: number;
    expiry_date?: string | null;
    manufacturing_date?: string | null;
    qa_status?: string | null;
    reservation_status: ReservationStatus;
    staging_bin: string; // e.g. "MAIN-STORE" vs "FLOOR-STAGING-[WorkCenterID]"
    source_bin: string;
    on_hand_lot_quantity: number;
    override_negative?: boolean;
    created_at?: string | null;
}

export interface AllocationCandidate {
    allocation_line_id: string;
    product_id: number;
    product_name: string;
    product_code: string;
    mm_lot_id: number;
    inventory_lot_id: number;
    lot_name: string;
    batch_no: string;
    manufacturing_date: string | null;
    expiry_date: string | null;
    qa_status: string;
    on_hand_quantity: number;
    available_quantity: number;
}

export interface AllocationLine {
    allocation_line_id: string;
    jo_material_id: number;
    product_id: number;
    mm_lot_id: number;
    inventory_lot_id: number;
    lot_name: string;
    batch_no: string;
    quantity: number;
    available_quantity?: number;
    override_negative?: boolean;
}

export interface MaterialAllocationPreview {
    jo_material_id: number;
    product_id: number;
    product_name: string;
    product_code: string;
    uom: string;
    required_quantity: number;
    staged_quantity: number;
    remaining_quantity: number;
    candidates: AllocationCandidate[];
    proposed_allocations: AllocationLine[];
    shortage_quantity: number;
    message?: string;
}

export interface AllocationPreview {
    success: boolean;
    job_order_id: number;
    job_order_no: string;
    work_center_id: number;
    target_bin: string;
    mode: AllocationMode;
    preview_token: string;
    materials: MaterialAllocationPreview[];
    proposed_allocations: AllocationLine[];
    shortages: Array<{
        jo_material_id: number;
        product_id: number;
        product_name: string;
        required_quantity: number;
        remaining_quantity: number;
        available_quantity: number;
        shortage_quantity: number;
    }>;
}

export interface AllocationPreviewPayload {
    job_order_id: number;
    job_order_no?: string;
    work_center_id: number;
    mode: AllocationMode;
    material_ids?: number[];
    lines?: AllocationLine[];
    source_bin?: string;
    override_negative?: boolean;
    override_remarks?: string;
}

export interface StagingCommitPayload extends AllocationPreviewPayload {
    operation_id: string;
    preview_token: string;
    remarks?: string;
}

export interface StagingCommitResponse {
    success: boolean;
    idempotent?: boolean;
    message: string;
    data: {
        job_order_id: number;
        job_order_no: string;
        target_bin: string;
        operation_id: string;
        lines: AllocationLine[];
        movement_ids: number[];
        reservation_ids: number[];
        material_results: BatchStageMaterialResult[];
    };
}

export type BatchStageMaterialStatus = "STAGED" | "PARTIAL" | "SKIPPED" | "FAILED";

export type BatchStageLotStatus = "STAGED" | "SKIPPED" | "FAILED";

export interface BatchStageLotResult {
    allocation_id?: number;
    lot_id: number;
    batch_no: string;
    requested_quantity: number;
    staged_quantity: number;
    available_quantity?: number;
    shortage_quantity?: number;
    status: BatchStageLotStatus;
    message: string;
}

export interface BatchStageMaterialResult {
    jo_material_id: number;
    product_id: number;
    product_name: string;
    uom: string;
    requested_quantity: number;
    staged_quantity: number;
    remaining_quantity: number;
    status: BatchStageMaterialStatus;
    message: string;
    lot_results: BatchStageLotResult[];
}

export interface BatchStageResult {
    job_order_id: number;
    job_order_no: string;
    attempted_material_count: number;
    fully_staged_material_count: number;
    exception_material_count: number;
    full_success: boolean;
    material_results: BatchStageMaterialResult[];
}

export interface MaterialStagingItem {
    jo_material_id: number;
    job_order_id: number;
    product_id: number;
    product_name: string;
    product_code: string;
    uom: string;
    required_quantity: number;
    allocated_quantity: number;
    staged_quantity: number;
    on_hand_quantity: number;
    shortage_quantity: number;
    reservation_status: ReservationStatus;
    staging_bin: string;
    is_staged: boolean;
    has_shortage: boolean;
    allocations: AllocatedLot[];
}

export interface StagingJobOrder {
    job_order_id: number;
    job_order_no: string;
    parent_job_order_id: number | null;
    parent_job_order_no?: string | null;
    product_id: number;
    product_name: string;
    product_code: string;
    version_id: number | null;
    version_name?: string | null;
    target_quantity: number;
    completed_quantity: number;
    rejected_quantity: number;
    status: JobOrderStatus | string;
    primary_work_center_id: number | null;
    primary_work_center_name: string;
    staging_work_center_id: number | null;
    suggested_staging_bin: string | null; // e.g. "FLOOR-STAGING-112"
    shift_option?: string | null;
    branch_id: number | null;
    branch_name: string;
    remarks?: string | null;
    materials: MaterialStagingItem[];
    total_materials_count: number;
    staged_materials_count: number;
    staging_percentage: number;
    reservation_status: "SOFT" | "HARD" | "PARTIAL";
    has_shortage: boolean;
    all_staged: boolean;
    created_at?: string | null;
}

export interface BinTransferPayload {
    job_order_id: number;
    job_order_no: string;
    jo_material_id: number;
    product_id: number;
    product_name?: string;
    lot_id: number;
    allocation_id?: number;
    batch_no: string;
    transfer_quantity: number;
    source_bin: string; // Default "MAIN-STORE"
    target_bin: string; // "FLOOR-STAGING-[WorkCenterID]"
    work_center_id: number;
    override_negative?: boolean;
    remarks?: string;
}

export interface ShortageWarningInfo {
    material_name: string;
    product_code: string;
    product_id: number;
    batch_no: string;
    lot_id: number;
    allocation_id?: number;
    job_order_id: number;
    job_order_no: string;
    work_center_id: number;
    work_center_name: string;
    transfer_quantity: number;
    available_quantity: number;
    shortage_quantity: number;
    source_bin: string;
    target_bin: string;
    jo_material_id: number;
}

export interface StagingStats {
    totalActiveJobs: number;
    plannedJobs: number;
    reservedJobs: number;
    fullyStagedJobs: number;
    pendingStagingJobs: number;
    shortageAlertJobs: number;
}
