interface QueueStatusHistoryEntry {
    new_status?: unknown;
    remarks?: unknown;
    changed_at?: unknown;
}

export interface PlanningQueueWorkflowSummary {
    currentStage: string;
    nextAction: string;
    blockedReason: string | null;
    blockerTone: "warning" | "critical" | null;
}

interface PlanningQueueWorkflowInput {
    status: string | null;
    statusLabel: string;
    currentStage: string;
    defaultNextAction: string | null;
    status_history?: QueueStatusHistoryEntry[] | null;
}

function statusKey(value: unknown): string {
    return String(value ?? "").trim().replace(/[\\_-]+/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function latestRemarkForStatus(
    statusHistory: QueueStatusHistoryEntry[] | null | undefined,
    currentStatus: string
): string | null {
    if (!currentStatus || !Array.isArray(statusHistory)) return null;

    let latestRemark: string | null = null;
    let latestTimestamp = Number.NEGATIVE_INFINITY;

    for (const entry of statusHistory) {
        if (statusKey(entry?.new_status) !== statusKey(currentStatus)) continue;

        const remarks = String(entry?.remarks || "").trim();
        if (!remarks) continue;

        const timestamp = Date.parse(String(entry?.changed_at || ""));
        const comparableTimestamp = Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
        if (latestRemark === null || comparableTimestamp > latestTimestamp) {
            latestRemark = remarks;
            latestTimestamp = comparableTimestamp;
        }
    }

    return latestRemark;
}

export function getPlanningQueueWorkflowSummary(input: PlanningQueueWorkflowInput): PlanningQueueWorkflowSummary {
    const status = statusKey(input.status);
    let currentStage = input.currentStage;
    let nextAction = input.defaultNextAction || "No further action required";
    let blockedReason: string | null = null;
    let blockerTone: PlanningQueueWorkflowSummary["blockerTone"] = null;

    if (!status) {
        return {
            currentStage: input.statusLabel || input.currentStage,
            nextAction: "Review Job Order details",
            blockedReason: null,
            blockerTone: null
        };
    }

    if (status === "draft") {
        nextAction = "Initialize JO";
    } else if (status === "for picking") {
        nextAction = "Complete staging / confirm picking";
    } else if (status === "picked") {
        nextAction = "Start production";
    } else if (status === "in production") {
        nextAction = "Continue production";
    } else if (status === "on hold") {
        currentStage = "Production on hold";
        nextAction = "Review hold and resume production";
        blockedReason = latestRemarkForStatus(input.status_history, status)
            || "This Job Order is on hold. Review its details before resuming.";
        blockerTone = "warning";
    } else if (status === "qa hold") {
        currentStage = "QA on hold";
        nextAction = "Resolve QA disposition";
        blockedReason = latestRemarkForStatus(input.status_history, status)
            || "A QA disposition is required before this Job Order can proceed.";
        blockerTone = "critical";
    } else if (status === "production completed" || status === "for qa and reconciliation") {
        nextAction = "Complete QA and reconciliation";
    } else if (status === "closed" || status === "cancelled") {
        nextAction = "No further action required";
        blockedReason = null;
        blockerTone = null;
    } else {
        nextAction = input.defaultNextAction || "Review Job Order details";
    }

    return { currentStage, nextAction, blockedReason, blockerTone };
}
