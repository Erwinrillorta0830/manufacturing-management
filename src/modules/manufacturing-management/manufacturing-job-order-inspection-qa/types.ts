import type { DailyQAOutcomeStatus } from "../manufacturing-qa/daily-qa-outcome";

export interface JobOrderDailyYieldSummary {
    jobOrderId: number;
    jobOrderNo: string;
    status: string;
    productId: number | null;
    productName: string;
    productCode: string | null;
    branchId: number | null;
    targetQuantity: number;
    producedQuantity: number;
    yieldCount: number;
    unresolvedYieldCount: number;
    latestYieldAt: string | null;
    createdAt: string | null;
    modifiedAt: string | null;
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
    goodQuantity: number;
    rejectedQuantity: number;
    scrapQuantity: number;
    totalQuantity: number;
    mmLotId: number | null;
    lotName: string | null;
    batchNo: string | null;
    manufacturingDate: string | null;
    expiryDate: string | null;
    evidenceImage: {
        fileId: string;
        fileName: string | null;
        mimeType: string | null;
        fileSize: number | null;
        url: string;
    } | null;
    qaStatus: DailyQAOutcomeStatus;
    processQaStatus: DailyQAOutcomeStatus;
    outcome: {
        status: DailyQAOutcomeStatus;
        hasFailure: boolean;
        isComplete: boolean;
    };
    audits: Record<string, unknown>[];
}

export interface JobOrderClosureBlocker {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

export interface JobOrderClosureReadiness {
    ready: boolean;
    blockers: JobOrderClosureBlocker[];
}

export interface JobOrderDailyYieldDetails extends JobOrderDailyYieldSummary {
    completedQuantity: number;
    routes: JobOrderDailyYieldRoute[];
    dailyYields: JobOrderDailyYieldRecord[];
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
