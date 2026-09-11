/**
 * Shared Job Order journey model.
 *
 * Single source of truth for "where is this Job Order", "what's next", and
 * the plain-language vocabulary used by Planning & Engineering and Material
 * Staging. Keep canonical Job Order status names in tooltips; user-facing
 * labels stay plain.
 */
import {
    CanonicalJobOrderStatus,
    displayJobOrderStatus,
    isCancelledJobOrderStatus,
    isTerminalJobOrderStatus,
    isJobOrderStatus,
    normalizeJobOrderStatus,
    JOB_ORDER_STATUS
} from "../job-order-status";

export type JobOrderJourneyStage =
    | "scheduled"
    | "materials"
    | "ready"
    | "production"
    | "qa"
    | "done"
    | "cancelled";

export type JobOrderJourneyStepId = "scheduled" | "materials" | "production" | "qa" | "done";

export type JobOrderJourneyStepState = "complete" | "current" | "upcoming" | "exception";

export interface JobOrderJourneyStep {
    id: JobOrderJourneyStepId;
    label: string;
    description: string;
    state: JobOrderJourneyStepState;
}

export interface JobOrderNextAction {
    label: string;
    description: string;
    /** Deep link with Job Order context when the next step lives on another page. */
    href?: string;
    /** Populated when the action exists but is currently blocked. */
    blockedReason?: string;
}

export interface JobOrderJourneyInput {
    status?: string | null;
    /** True when every BOM material is staged as a hard floor hold. */
    allMaterialsStaged?: boolean;
    hasShortage?: boolean;
    /** False when the Job Order has no usable staging work center/destination. */
    hasActiveDestination?: boolean;
    /** Buffer JOs have no linked Sales Order demand stage to explain. */
    isBuffer?: boolean;
    /** Used to build deep links that preselect this Job Order. */
    jobOrderNo?: string | null;
}

export interface JobOrderJourney {
    stage: JobOrderJourneyStage;
    stageLabel: string;
    statusLabel: string;
    statusDescription: string;
    steps: JobOrderJourneyStep[];
    nextAction: JobOrderNextAction | null;
    blockers: string[];
    isCancelled: boolean;
}

const STEP_TEMPLATES: Array<Pick<JobOrderJourneyStep, "id" | "label" | "description">> = [
    {
        id: "scheduled",
        label: "Scheduled",
        description: "Job Order created; materials are being reserved."
    },
    {
        id: "materials",
        label: "Materials",
        description: "Staging materials from the Main Store to the floor bin."
    },
    {
        id: "production",
        label: "Production",
        description: "Shop-floor execution and shift runs."
    },
    {
        id: "qa",
        label: "QA & Yield",
        description: "Quality checks and final yield closing."
    },
    {
        id: "done",
        label: "Done",
        description: "Completed and posted to finished-goods inventory."
    }
];

const STAGE_INDEX: Record<Exclude<JobOrderJourneyStage, "cancelled">, number> = {
    scheduled: 0,
    materials: 1,
    ready: 1,
    production: 2,
    qa: 3,
    done: 4
};

const STAGE_LABELS: Record<JobOrderJourneyStage, string> = {
    scheduled: "Scheduled",
    materials: "Staging materials",
    ready: "Ready for production",
    production: "In production",
    qa: "QA & yield",
    done: "Completed",
    cancelled: "Cancelled"
};

export const JOB_ORDER_STATUS_DESCRIPTIONS: Partial<Record<CanonicalJobOrderStatus, string>> = {
    Draft: "Created but not yet released to the shop floor.",
    Planned: "Queued for material reservation or crew planning.",
    Planning: "Queued for material reservation or crew planning.",
    Released: "Released to the shop floor; waiting for materials to be staged.",
    Proceed: "Released to the shop floor; waiting for materials to be staged.",
    Reserved: "All required materials are staged on the floor; ready for production.",
    Ongoing: "Production is running on the shop floor.",
    "In Progress": "Production is running on the shop floor.",
    "On Hold": "Temporarily stopped; resolve the hold before continuing.",
    "QA Hold": "Held by quality assurance pending a disposition decision.",
    Finished: "Production finished; waiting for the final yield closing.",
    Completed: "Completed and posted to finished-goods inventory.",
    Closed: "Completed and closed.",
    Cancelled: "Cancelled; materials were returned and no further action is required.",
    Shortage: "Waiting for raw-material replenishment before release."
};

export function jobOrderStatusDescription(value: unknown): string {
    const normalized = normalizeJobOrderStatus(value);
    if (!normalized) return "Unknown status.";
    return JOB_ORDER_STATUS_DESCRIPTIONS[normalized] || "Status recorded for this Job Order.";
}

export interface StagingStateInfo {
    key: "SOFT" | "PARTIAL" | "HARD";
    label: string;
    description: string;
    canonical: string;
}

export const STAGING_STATES: Record<"SOFT" | "PARTIAL" | "HARD", StagingStateInfo> = {
    SOFT: {
        key: "SOFT",
        label: "To stage",
        description: "Materials are reserved in the Main Store and have not been moved to the floor bin yet.",
        canonical: "SOFT"
    },
    PARTIAL: {
        key: "PARTIAL",
        label: "Partially staged",
        description: "Some materials are on the floor; the remaining materials are still in the Main Store.",
        canonical: "PARTIAL"
    },
    HARD: {
        key: "HARD",
        label: "Floor ready",
        description: "All required materials are staged in the floor bin and locked for production.",
        canonical: "HARD"
    }
};

export function stagingStateInfo(value: string | null | undefined): StagingStateInfo | null {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "SOFT") return STAGING_STATES.SOFT;
    if (normalized === "PARTIAL") return STAGING_STATES.PARTIAL;
    if (normalized === "HARD") return STAGING_STATES.HARD;
    return null;
}

export function stagingStateLabel(value: string | null | undefined): string {
    return stagingStateInfo(value)?.label || "To stage";
}

function stepStates(currentIndex: number, stage: JobOrderJourneyStage): JobOrderJourneyStep[] {
    if (stage === "cancelled") {
        return STEP_TEMPLATES.map((step) => ({ ...step, state: "exception" as const }));
    }
    return STEP_TEMPLATES.map((step, index) => {
        if (index < currentIndex) return { ...step, state: "complete" as const };
        if (index === currentIndex) {
            // A fully staged Job Order is "between" materials and production:
            // show materials as complete and production as the next step.
            if (stage === "ready" && step.id === "materials") return { ...step, state: "complete" as const };
            return { ...step, state: "current" as const };
        }
        return { ...step, state: "upcoming" as const };
    });
}

function resolveStage(input: JobOrderJourneyInput): JobOrderJourneyStage {
    const status = input.status;
    if (isCancelledJobOrderStatus(status)) return "cancelled";
    if (isTerminalJobOrderStatus(status) || isJobOrderStatus(status, JOB_ORDER_STATUS.COMPLETED, JOB_ORDER_STATUS.CLOSED)) return "done";
    if (isJobOrderStatus(status, JOB_ORDER_STATUS.FINISHED, JOB_ORDER_STATUS.QA_HOLD, JOB_ORDER_STATUS.ON_HOLD)) return "qa";
    if (isJobOrderStatus(status, JOB_ORDER_STATUS.ONGOING, JOB_ORDER_STATUS.IN_PROGRESS)) return "production";
    if (isJobOrderStatus(status, JOB_ORDER_STATUS.RESERVED)) return "ready";
    if (isJobOrderStatus(status, JOB_ORDER_STATUS.RELEASED, JOB_ORDER_STATUS.PROCEED)) {
        return input.allMaterialsStaged ? "ready" : "materials";
    }
    return "scheduled";
}

function buildNextAction(
    input: JobOrderJourneyInput,
    stage: JobOrderJourneyStage
): JobOrderNextAction | null {
    const joParam = input.jobOrderNo ? `?jo=${encodeURIComponent(String(input.jobOrderNo))}` : "";
    const destinationBlocked = input.hasActiveDestination === false;

    switch (stage) {
        case "scheduled":
            if (input.hasShortage) {
                return {
                    label: "Reserve materials",
                    description: "Reserve the shortfall lots in the Job Order details, then release it to the shop floor."
                };
            }
            return {
                label: "Release to Shop Floor",
                description: "Reserve any remaining lots and release this Job Order for staging."
            };
        case "materials":
            return {
                label: "Stage materials",
                description: "Move the reserved materials from the Main Store to the work-center floor bin.",
                href: `/mm/material-staging${joParam}`,
                ...(destinationBlocked
                    ? { blockedReason: "No active work-center destination is configured for this Job Order." }
                    : {})
            };
        case "ready":
            return {
                label: "Open Production Workflow",
                description: "All materials are on the floor. Start the shift run when production begins.",
                href: `/mm/production-workflow${joParam}`
            };
        case "production":
            return {
                label: "Continue production",
                description: "Log shift runs and completion progress in the shop-floor terminal.",
                href: `/mm/production-workflow${joParam}`
            };
        case "qa":
            return {
                label: "Open QA & Yield Closing",
                description: "Resolve the QA hold or close the final yield to post finished goods.",
                href: `/mm/manufacturing-qa${joParam}`
            };
        case "done":
        case "cancelled":
        default:
            return null;
    }
}

function buildBlockers(input: JobOrderJourneyInput, stage: JobOrderJourneyStage): string[] {
    const blockers: string[] = [];
    if (stage === "cancelled") {
        blockers.push("This Job Order was cancelled. No further shop-floor action is required.");
        return blockers;
    }
    if (input.hasShortage && stage === "scheduled") {
        blockers.push("Material shortfalls must be reserved before this Job Order can be released.");
    }
    if (
        input.hasActiveDestination === false
        && (stage === "materials" || stage === "ready")
    ) {
        blockers.push("No active work-center destination is configured, so materials cannot be staged yet.");
    }
    return blockers;
}

export function resolveJobOrderJourney(input: JobOrderJourneyInput): JobOrderJourney {
    const stage = resolveStage(input);
    const statusLabel = displayJobOrderStatus(input.status);
    const steps = stepStates(stage === "cancelled" ? 0 : STAGE_INDEX[stage], stage);
    return {
        stage,
        stageLabel: STAGE_LABELS[stage],
        statusLabel,
        statusDescription: jobOrderStatusDescription(input.status),
        steps,
        nextAction: buildNextAction(input, stage),
        blockers: buildBlockers(input, stage),
        isCancelled: stage === "cancelled"
    };
}
