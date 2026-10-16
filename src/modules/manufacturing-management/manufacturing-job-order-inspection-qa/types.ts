import type { DailyQAOutcomeStatus } from "../manufacturing-qa/daily-qa-outcome";

export interface JobOrderDailyYieldSummary {
    jobOrderId: number;
    jobOrderNo: string;
    status: string;
    productId: number | null;
    productName: string;
    productCode: string | null;
    productUom?: string | null;
    branchId: number | null;
    targetQuantity: number;
    producedQuantity: number;
    verifiedRejectedQuantity: number;
    verifiedTotalProducedQuantity: number;
    yieldCount: number;
    pendingYieldCount: number;
    discrepancyYieldCount: number;
    unresolvedYieldCount: number;
    latestYieldAt: string | null;
    createdAt: string | null;
    modifiedAt: string | null;
}

export interface JobOrderDailyYieldSummaryQuery {
    page: number;
    pageSize: number;
    search: string;
    status: string;
    productId: string;
    dateFrom: string;
    dateTo: string;
    flaggedOnly: boolean;
}

export interface JobOrderDailyYieldSummaryPage {
    data: JobOrderDailyYieldSummary[];
    meta: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
    facets: {
        totalAvailable: number;
        unresolvedJobOrderCount: number;
        statusOptions: string[];
        productOptions: Array<{ value: string; label: string }>;
    };
}

export interface JobOrderDailyYieldRoute {
    id: number;
    sequenceOrder: number;
    name: string;
    qaTemplateId: number | null;
    status: string | null;
}

export interface JobOrderDailyYieldRecord {
    ledgerId: number;
    jobOrderId: number;
    shiftName: string;
    sessionKey: string | null;
    productionDate: string | null;
    loggedAt: string | null;
    loggedById: number | null;
    goodQuantity: number;
    rejectedQuantity: number;
    qaAcceptedQuantity: number;
    qaRejectedQuantity: number;
    qaAllocationLimit: number;
    scrapQuantity: number;
    totalQuantity: number;
    mmLotId: number | null;
    lotName: string | null;
    batchNo: string | null;
    manufacturingDate: string | null;
    expiryDate: string | null;
    rejectedMmLotId: number | null;
    rejectedLotName: string | null;
    rejectedBatchNo: string | null;
    rejectedManufacturingDate: string | null;
    rejectedExpiryDate: string | null;
    acceptedAllocations: JobOrderYieldOutputAllocation[];
    rejectedAllocations: JobOrderYieldOutputAllocation[];
    evidenceImage: {
        fileId: string;
        fileName: string | null;
        mimeType: string | null;
        fileSize: number | null;
        url: string;
    } | null;
    evidence?: {
        inspectorShift: JobOrderDailyYieldEvidence[];
        acceptedStock: JobOrderDailyYieldEvidence[];
        rejectedStock: JobOrderDailyYieldEvidence[];
    };
    qaStatus: DailyQAOutcomeStatus;
    processQaStatus: DailyQAOutcomeStatus;
    qaRevocation: {
        revokedAt: string | null;
        revokedById: number | null;
        revokedByName: string | null;
        reason: string | null;
    } | null;
    outcome: {
        status: DailyQAOutcomeStatus;
        hasFailure: boolean;
        isComplete: boolean;
    };
    audits: JobOrderDailyYieldAudit[];
}

export interface JobOrderYieldOutputAllocation {
    allocationId: number | null;
    allocationKey: string;
    quantity: number;
    mmLotId: number | null;
    lotName: string | null;
    batchNo: string | null;
    manufacturingDate: string | null;
    expiryDate: string | null;
    rejectionReasonId: number | null;
    rejectionReasonName: string | null;
}

export interface JobOrderDailyYieldEvidence {
    evidenceId: number | string;
    channel: "INSPECTOR_SHIFT" | "QA_ACCEPTED_STOCK" | "QA_REJECTED_STOCK";
    fileId: string;
    fileName: string | null;
    mimeType: string | null;
    fileSize: number | null;
    url: string;
    uploadedById: number | null;
    uploadedAt: string | null;
    sortOrder: number;
}

export interface JobOrderDailyYieldAuditParameter {
    parameter_id: number;
    value: string;
    is_passed: boolean | null;
}

export interface JobOrderDailyYieldAudit {
    [key: string]: unknown;
    jo_route_id?: number | string | null;
    qaParameters?: JobOrderDailyYieldAuditParameter[];
}

export interface JobOrderClosureBlocker {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

export interface JobOrderClosureReadiness {
    ready: boolean;
    blockers: JobOrderClosureBlocker[];
    autoResolvableDispositionCount: number;
}

export interface JobOrderDailyYieldDetails extends JobOrderDailyYieldSummary {
    productShelfLifeDays: number | null;
    completedQuantity: number;
    totalProducedQuantity: number;
    yieldEvidenceAvailable: boolean;
    yieldEvidenceWarning: string | null;
    routes: JobOrderDailyYieldRoute[];
    dailyYields: JobOrderDailyYieldRecord[];
    canRevokeYieldAudit: boolean;
    closeReadiness: JobOrderClosureReadiness;
}

export interface DailyYieldQAParameter {
    parameter_id: number;
    test_name?: string | null;
    test_type?: string | null;
    min_value?: number | string | null;
    max_value?: number | string | null;
    target_value?: number | string | null;
    is_critical?: boolean | number | string | null;
}

export interface DailyYieldQATemplate {
    template_id?: number | string | null;
    id?: number | string | null;
    parameters?: DailyYieldQAParameter[] | null;
}

export interface DailyYieldQALog {
    id: number;
    jo_route_id?: number | string | null;
    task_id: {
        jo_route_id?: number | string | null;
        jo_id?: string | null;
        operation_name?: string | null;
        name?: string | null;
        id?: number | string | null;
    } | number | null;
    expected_quantity?: number | string | null;
    actual_quantity?: number | string | null;
    deviation_quantity?: number | string | null;
    qa_status?: string | null;
    comments?: string | null;
}
