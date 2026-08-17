export type ApprovalStatus =
    | "All"
    | "Pending Approval"
    | "For Approval"
    | "Approved"
    | "Active"
    | "Archived"
    | "Inactive"
    | "Draft"
    | "Rejected"
    | "Revision Required"
    | "Revision";

export interface VersionApprovalItem {
    id: number;
    version_id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    category: string;
    version_name: string;
    base_quantity: number;
    expected_yield_percentage: number;
    created_by: string;
    created_at: string;
    status: ApprovalStatus;
    rejection_reason?: string | null;
    revision_notes?: string | null;
    base_version_id?: number | null;
    approved_by_name?: string | null;
}

export interface VersionApprovalKPISummary {
    pendingCount: number;
    approvedMonthCount: number;
    rejectedCount: number;
    revisionCount: number;
}

export interface BOMComparisonItem {
    product_id: number;
    component_code: string;
    component_name: string;
    target_qty: number;
    base_qty: number;
    uom: string;
    change_type: "added" | "removed" | "quantity_changed" | "unchanged";
    qty_diff: number;
}

export interface RoutingComparisonItem {
    step_number: number;
    operation_name: string;
    work_center: string;
    target_setup_time: number;
    base_setup_time: number;
    setup_diff: number;
    target_run_time: number;
    base_run_time: number;
    run_diff: number;
    change_type: "added" | "removed" | "modified" | "unchanged";
}

export interface VersionComparisonData {
    targetVersion?: {
        version_id: number;
        version_name: string;
        base_quantity: number;
        expected_yield_percentage: number;
        status: string;
        created_by?: string;
        created_at?: string;
    };
    baseVersion?: {
        version_id: number;
        version_name: string;
        base_quantity: number;
        expected_yield_percentage: number;
        status: string;
    };
    product?: {
        product_code: string;
        product_name: string;
        category?: string;
    };
    bomComparison?: BOMComparisonItem[];
    routingComparison?: RoutingComparisonItem[];
    bomComponents?: Array<{
        product_id: number;
        component_name: string;
        component_code: string;
        quantity_required: number;
        wastage_factor_percentage: number;
        uom: string;
        cost_per_unit: number;
        extended_cost: number;
    }>;
    routingSteps?: Array<{
        step_number: number;
        operation_name: string;
        work_center_name: string;
        setup_time_minutes: number;
        run_time_minutes: number;
        total_time_minutes: number;
    }>;
    costSummary?: {
        materialCost: number;
        laborCost: number;
        customOverhead: number;
        totalUnitCost: number;
    };
}

export interface DecisionPayload {
    versionId: number;
    action: "approve" | "reject" | "request_revision" | "revision";
    setActive?: boolean;
    remarks?: string;
    rejectionReason?: string;
    reason?: string;
    feedback?: string;
}
