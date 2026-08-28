export type DailyQAOutcomeStatus = "Pending" | "Passed" | "QA Hold";

export interface DailyQAOutcome {
    status: DailyQAOutcomeStatus;
    hasFailure: boolean;
    isComplete: boolean;
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
    const requiredIds = requiredRouteIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
    const auditedIds = new Set(
        audits
            .map((audit) => Number(audit.jo_route_id ?? audit.joRouteId))
            .filter((id) => Number.isFinite(id) && id > 0)
    );
    const allRequiredRoutesAudited = requiredIds.every((id) => auditedIds.has(id));
    const hasFailure = audits.some(isFailedAudit);
    const isComplete = audits.length > 0 && allRequiredRoutesAudited;

    if (hasFailure) {
        return { status: "QA Hold", hasFailure: true, isComplete };
    }

    if (!isComplete || audits.some((audit) => !isPassingAudit(audit))) {
        return { status: "Pending", hasFailure: false, isComplete };
    }

    return { status: "Passed", hasFailure: false, isComplete: true };
}
