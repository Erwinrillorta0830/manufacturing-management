/**
 * Canonical status contract for manufacturing_job_orders.
 *
 * Job Order statuses are stored in title case.  The normalizer accepts the
 * historical casing and spelling variants at integration boundaries, while
 * writers must persist one of these canonical values.
 */
export const JOB_ORDER_STATUS = {
    DRAFT: "Draft",
    FOR_PICKING: "For Picking",
    PICKED: "Picked",
    IN_PRODUCTION: "In Production",
    PRODUCTION_COMPLETED: "Production Completed",
    FOR_QA_RECONCILIATION: "For QA and Reconciliation",

    // Deprecated aliases retained while the existing UI and API callers are
    // migrated to the canonical workflow actions.
    PLANNED: "Draft",
    PLANNING: "Draft",
    RELEASED: "For Picking",
    PROCEED: "For Picking",
    ONGOING: "In Production",
    IN_PROGRESS: "In Production",
    RESERVED: "Picked",
    ON_HOLD: "On Hold",
    QA_HOLD: "QA Hold",
    FINISHED: "Production Completed",
    COMPLETED: "For QA and Reconciliation",
    CLOSED: "Closed",
    CANCELLED: "Cancelled",
    SHORTAGE: "Draft"
} as const;

export type CanonicalJobOrderStatus = typeof JOB_ORDER_STATUS[keyof typeof JOB_ORDER_STATUS];

const STATUS_BY_KEY = new Map<string, CanonicalJobOrderStatus>([
    ["draft", JOB_ORDER_STATUS.DRAFT],
    ["planned", JOB_ORDER_STATUS.DRAFT],
    ["planning", JOB_ORDER_STATUS.DRAFT],
    ["shortage", JOB_ORDER_STATUS.DRAFT],
    ["for picking", JOB_ORDER_STATUS.FOR_PICKING],
    ["released", JOB_ORDER_STATUS.FOR_PICKING],
    ["proceed", JOB_ORDER_STATUS.FOR_PICKING],
    ["picked", JOB_ORDER_STATUS.PICKED],
    ["reserved", JOB_ORDER_STATUS.PICKED],
    ["in production", JOB_ORDER_STATUS.IN_PRODUCTION],
    ["ongoing", JOB_ORDER_STATUS.IN_PRODUCTION],
    ["in progress", JOB_ORDER_STATUS.IN_PRODUCTION],
    ["on hold", JOB_ORDER_STATUS.ON_HOLD],
    ["qa hold", JOB_ORDER_STATUS.QA_HOLD],
    ["production completed", JOB_ORDER_STATUS.PRODUCTION_COMPLETED],
    ["finished", JOB_ORDER_STATUS.PRODUCTION_COMPLETED],
    ["for qa and reconciliation", JOB_ORDER_STATUS.FOR_QA_RECONCILIATION],
    ["completed", JOB_ORDER_STATUS.FOR_QA_RECONCILIATION],
    ["closed", JOB_ORDER_STATUS.CLOSED],
    ["cancelled", JOB_ORDER_STATUS.CANCELLED],
    ["canceled", JOB_ORDER_STATUS.CANCELLED],
    ["shortage", JOB_ORDER_STATUS.SHORTAGE]
]);

function statusKey(value: unknown): string {
    return String(value ?? "")
        .trim()
        .replace(/[\\_-]+/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase();
}

/** Return the canonical title-cased value, or null for an unknown value. */
export function normalizeJobOrderStatus(value: unknown): CanonicalJobOrderStatus | null {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    return STATUS_BY_KEY.get(statusKey(value)) || null;
}

/**
 * Validate a status before writing it to manufacturing_job_orders.
 * Unknown values are rejected instead of being silently converted to Draft.
 */
export function assertJobOrderStatus(value: unknown): CanonicalJobOrderStatus {
    const normalized = normalizeJobOrderStatus(value);
    if (!normalized) {
        throw new Error(`Unknown Job Order status: ${String(value ?? "").trim() || "(empty)"}`);
    }
    return normalized;
}

export function isJobOrderStatus(
    value: unknown,
    ...expected: CanonicalJobOrderStatus[]
): boolean {
    const normalized = normalizeJobOrderStatus(value);
    return normalized !== null && expected.includes(normalized);
}

export function isTerminalJobOrderStatus(value: unknown): boolean {
    return isJobOrderStatus(
        value,
        JOB_ORDER_STATUS.CLOSED,
        JOB_ORDER_STATUS.CANCELLED
    );
}

export function isCancelledJobOrderStatus(value: unknown): boolean {
    return isJobOrderStatus(value, JOB_ORDER_STATUS.CANCELLED);
}

/**
 * A Job Order may only be cancelled before production starts. Picked JOs may
 * be cancelled after their staged material is returned/reversed by the
 * cancellation transaction.
 */
export const CANCELLABLE_JOB_ORDER_STATUSES: CanonicalJobOrderStatus[] = [
    JOB_ORDER_STATUS.DRAFT,
    JOB_ORDER_STATUS.FOR_PICKING,
    JOB_ORDER_STATUS.PICKED
];

export function isCancellableJobOrderStatus(value: unknown): boolean {
    return isJobOrderStatus(value, ...CANCELLABLE_JOB_ORDER_STATUSES);
}

export function isActiveJobOrderStatus(value: unknown): boolean {
    return isJobOrderStatus(
        value,
        JOB_ORDER_STATUS.DRAFT,
        JOB_ORDER_STATUS.FOR_PICKING,
        JOB_ORDER_STATUS.PICKED,
        JOB_ORDER_STATUS.IN_PRODUCTION,
        JOB_ORDER_STATUS.PRODUCTION_COMPLETED,
        JOB_ORDER_STATUS.FOR_QA_RECONCILIATION,
        JOB_ORDER_STATUS.ON_HOLD,
        JOB_ORDER_STATUS.QA_HOLD
    );
}

export function displayJobOrderStatus(value: unknown): string {
    return normalizeJobOrderStatus(value) || String(value ?? "Unknown");
}
