export type DailyQAOutcomeStatus = "Pending" | "Passed" | "QA Hold";

export interface DailyQAOutcome {
    status: DailyQAOutcomeStatus;
    hasFailure: boolean;
    isComplete: boolean;
}

export type DailyQALabStatus = "Pending" | "Passed" | "Failed";
export type DailyQAActionTaken = "Released" | "Quarantined" | "Scrapped";

const dailyQALabStatuses: readonly DailyQALabStatus[] = ["Pending", "Passed", "Failed"];
const dailyQAActions: readonly DailyQAActionTaken[] = ["Released", "Quarantined", "Scrapped"];

export function parseDailyQALabStatus(value: unknown): DailyQALabStatus | null {
    const normalized = String(value ?? "").trim();
    return dailyQALabStatuses.includes(normalized as DailyQALabStatus)
        ? normalized as DailyQALabStatus
        : null;
}

export function parseDailyQAActionTaken(value: unknown): DailyQAActionTaken | null {
    const normalized = String(value ?? "").trim();
    return dailyQAActions.includes(normalized as DailyQAActionTaken)
        ? normalized as DailyQAActionTaken
        : null;
}

export function isDailyQALabStatus(value: unknown): value is DailyQALabStatus {
    return parseDailyQALabStatus(value) !== null;
}

export function isDailyQAActionTaken(value: unknown): value is DailyQAActionTaken {
    return parseDailyQAActionTaken(value) !== null;
}

export function dailyQAAuditStateError(labStatus: unknown, actionTaken: unknown): string | null {
    if (!isDailyQALabStatus(labStatus)) {
        return "Choose a Lab Status before saving the QA audit.";
    }
    if (!isDailyQAActionTaken(actionTaken)) {
        return "Choose a valid QA disposition action before saving the audit.";
    }
    if (labStatus === "Pending" && actionTaken === "Released") {
        return "Pending Analysis cannot be released. Choose Hold / Quarantine or Scrap.";
    }
    return null;
}

type DailyQAAudit = Record<string, unknown>;

function auditValue(audit: DailyQAAudit, ...keys: string[]): unknown {
    for (const key of keys) {
        if (audit[key] !== undefined && audit[key] !== null) return audit[key];
    }
    return undefined;
}

function normalizedStatus(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
}

function auditRouteKey(audit: DailyQAAudit): string {
    const routeId = auditRouteId(audit);
    return routeId ? "route:" + routeId : "general";
}

function auditRouteId(audit: DailyQAAudit): number {
    const routeValue = auditValue(audit, "jo_route_id", "joRouteId");
    const route = routeValue && typeof routeValue === "object"
        ? (routeValue as Record<string, unknown>).jo_route_id ?? (routeValue as Record<string, unknown>).id
        : routeValue;
    const routeId = Number(route ?? 0);
    return Number.isSafeInteger(routeId) && routeId > 0 ? routeId : 0;
}

function auditTimestamp(audit: DailyQAAudit): number {
    const parsed = Date.parse(String(auditValue(audit, "inspected_at", "inspectedAt") ?? ""));
    return Number.isFinite(parsed) ? parsed : 0;
}

function auditId(audit: DailyQAAudit): number {
    const parsed = Number(auditValue(audit, "daily_qa_id", "id") ?? 0);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function latestDailyQAAudit<T extends DailyQAAudit>(audits: readonly T[]): T | null {
    let latest: T | null = null;
    for (const audit of audits) {
        if (!latest
            || auditTimestamp(audit) > auditTimestamp(latest)
            || (auditTimestamp(audit) === auditTimestamp(latest) && auditId(audit) > auditId(latest))) {
            latest = audit;
        }
    }
    return latest;
}

export function latestDailyQAAuditsByRoute<T extends DailyQAAudit>(audits: readonly T[]): T[] {
    const latestByRoute = new Map<string, T>();
    for (const audit of audits) {
        const key = auditRouteKey(audit);
        const current = latestByRoute.get(key);
        if (!current
            || auditTimestamp(audit) > auditTimestamp(current)
            || (auditTimestamp(audit) === auditTimestamp(current) && auditId(audit) > auditId(current))) {
            latestByRoute.set(key, audit);
        }
    }
    return [...latestByRoute.values()];
}

function isFailedAudit(audit: DailyQAAudit): boolean {
    const sensoryStatus = normalizedStatus(auditValue(audit, "sensory_status", "sensoryStatus"));
    const laboratoryStatus = normalizedStatus(auditValue(audit, "lab_status", "laboratory_status", "labStatus"));
    const actionTaken = normalizedStatus(auditValue(audit, "action_taken", "actionTaken"));
    const weightCheck = auditValue(audit, "weight_check_passed", "weightCheckPassed");

    return sensoryStatus === "failed"
        || laboratoryStatus === "failed"
        || ["quarantined", "scrapped"].includes(actionTaken)
        || weightCheck === false
        || String(weightCheck ?? "").trim() === "0"
        || ["failed", "qa hold", "quarantined", "scrapped"].includes(normalizedStatus(audit.qa_status));
}

function isPassingAudit(audit: DailyQAAudit): boolean {
    const sensoryStatus = normalizedStatus(auditValue(audit, "sensory_status", "sensoryStatus"));
    const laboratoryStatus = normalizedStatus(auditValue(audit, "lab_status", "laboratory_status", "labStatus"));
    const actionTaken = normalizedStatus(auditValue(audit, "action_taken", "actionTaken"));
    const weightCheck = auditValue(audit, "weight_check_passed", "weightCheckPassed");

    const weightPassed = weightCheck === undefined
        || weightCheck === null
        || weightCheck === true
        || ["1", "true", "passed"].includes(String(weightCheck).trim().toLowerCase());

    return sensoryStatus === "passed"
        && laboratoryStatus === "passed"
        && actionTaken === "released"
        && weightPassed;
}

export function getDailyQAAuditStatus(audit: DailyQAAudit): DailyQAOutcomeStatus {
    if (isFailedAudit(audit)) return "QA Hold";
    return isPassingAudit(audit) ? "Passed" : "Pending";
}

export function deriveDailyQAOutcome(
    audits: readonly DailyQAAudit[],
    requiredRouteIds: readonly (number | string)[]
): DailyQAOutcome {
    const currentAudits = latestDailyQAAuditsByRoute(audits);
    const requiredIds = requiredRouteIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
    const auditedIds = new Set(
        currentAudits
            .map(auditRouteId)
            .filter((id) => Number.isFinite(id) && id > 0)
    );
    const allRequiredRoutesAudited = requiredIds.every((id) => auditedIds.has(id));
    const hasFailure = currentAudits.some(isFailedAudit);
    const isComplete = currentAudits.length > 0 && allRequiredRoutesAudited;

    if (hasFailure) {
        return { status: "QA Hold", hasFailure: true, isComplete };
    }

    if (!isComplete || currentAudits.some((audit) => !isPassingAudit(audit))) {
        return { status: "Pending", hasFailure: false, isComplete };
    }

    return { status: "Passed", hasFailure: false, isComplete: true };
}
