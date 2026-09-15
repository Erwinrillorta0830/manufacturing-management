import type { CanonicalJobOrderStatus } from "./job-order-status";

/**
 * Public workflow contract shared by the planning, staging, and production
 * modules. Lifecycle writes must use one of these actions instead of patching
 * manufacturing_job_orders.status directly.
 */
export const JOB_ORDER_WORKFLOW_ACTIONS = [
    "initialize",
    "complete-staging",
    "start-production",
    "place-on-hold",
    "resume-production",
    "complete-production",
    "begin-qa-reconciliation",
    "close",
    "cancel"
] as const;

export type JobOrderWorkflowAction = typeof JOB_ORDER_WORKFLOW_ACTIONS[number];

export type JobOrderReservationStatus =
    | "SOFT"
    | "HARD"
    | "PARTIAL"
    | "WIP"
    | "CONSUMED"
    | "RETURNED"
    | "RELEASED";

export interface MaterialReconciliationResult {
    issuedToWip: number;
    consumed: number;
    returned: number;
    remainingWip: number;
    balanced: boolean;
}

export interface JobOrderWorkflowResponse<TJobOrder = Record<string, unknown>> {
    success: boolean;
    jobOrder?: TJobOrder;
    previousStatus: CanonicalJobOrderStatus;
    newStatus: CanonicalJobOrderStatus;
    historyId: string | number | null;
    warnings?: string[];
    reconciliation?: MaterialReconciliationResult;
}
