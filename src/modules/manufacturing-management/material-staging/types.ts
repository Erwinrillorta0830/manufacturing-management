/**
 * src/modules/manufacturing-management/material-staging/types.ts
 * Type definitions for Material Staging & Floor Holds Module
 */

export type JobOrderStatus =
    | "PLANNED"
    | "RESERVED"
    | "Draft"
    | "Planned"
    | "Reserved"
    | "Released"
    | "Proceed"
    | "In Progress"
    | "Ongoing"
    | "Completed"
    | "Finished"
    | "On Hold"
    | "Cancelled";

export type ReservationStatus = "SOFT" | "HARD" | "PARTIAL";

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
