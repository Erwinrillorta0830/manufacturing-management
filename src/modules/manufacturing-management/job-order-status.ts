/**
 * Canonical status contract for manufacturing_job_orders.
 *
 * Job Order statuses are stored in title case.  The normalizer accepts the
 * historical casing and spelling variants at integration boundaries, while
 * writers must persist one of these canonical values.
 */
export const JOB_ORDER_STATUS = {
    DRAFT: "Draft",
    PLANNED: "Planned",
    PLANNING: "Planning",
    RELEASED: "Released",
    PROCEED: "Proceed",
    ONGOING: "Ongoing",
    IN_PROGRESS: "In Progress",
    RESERVED: "Reserved",
    ON_HOLD: "On Hold",
    QA_HOLD: "QA Hold",
    FINISHED: "Finished",
    COMPLETED: "Completed",
    CLOSED: "Closed",
    CANCELLED: "Cancelled",
    SHORTAGE: "Shortage"
} as const;

export type CanonicalJobOrderStatus = typeof JOB_ORDER_STATUS[keyof typeof JOB_ORDER_STATUS];

const STATUS_BY_KEY = new Map<string, CanonicalJobOrderStatus>([
    ["draft", JOB_ORDER_STATUS.DRAFT],
    ["planned", JOB_ORDER_STATUS.PLANNED],
    ["planning", JOB_ORDER_STATUS.PLANNING],
    ["released", JOB_ORDER_STATUS.RELEASED],
    ["proceed", JOB_ORDER_STATUS.PROCEED],
    ["ongoing", JOB_ORDER_STATUS.ONGOING],
    ["in progress", JOB_ORDER_STATUS.IN_PROGRESS],
    ["reserved", JOB_ORDER_STATUS.RESERVED],
    ["on hold", JOB_ORDER_STATUS.ON_HOLD],
    ["qa hold", JOB_ORDER_STATUS.QA_HOLD],
    ["finished", JOB_ORDER_STATUS.FINISHED],
    ["completed", JOB_ORDER_STATUS.COMPLETED],
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
        JOB_ORDER_STATUS.FINISHED,
        JOB_ORDER_STATUS.COMPLETED,
        JOB_ORDER_STATUS.CLOSED
    );
}

export function isCancelledJobOrderStatus(value: unknown): boolean {
    return isJobOrderStatus(value, JOB_ORDER_STATUS.CANCELLED);
}

export function isActiveJobOrderStatus(value: unknown): boolean {
    return isJobOrderStatus(
        value,
        JOB_ORDER_STATUS.DRAFT,
        JOB_ORDER_STATUS.PLANNED,
        JOB_ORDER_STATUS.PLANNING,
        JOB_ORDER_STATUS.RELEASED,
        JOB_ORDER_STATUS.PROCEED,
        JOB_ORDER_STATUS.ONGOING,
        JOB_ORDER_STATUS.IN_PROGRESS,
        JOB_ORDER_STATUS.RESERVED,
        JOB_ORDER_STATUS.ON_HOLD,
        JOB_ORDER_STATUS.QA_HOLD,
        JOB_ORDER_STATUS.SHORTAGE
    );
}

export function displayJobOrderStatus(value: unknown): string {
    return normalizeJobOrderStatus(value) || String(value ?? "Unknown");
}
