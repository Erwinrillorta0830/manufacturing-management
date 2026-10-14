import { isJobOrderStatus, JOB_ORDER_STATUS } from "../../job-order-status";
import type { JobOrderJourney } from "../../shared/job-order-journey";
import { getPhtDateInputValue, phtTimestampToEpoch } from "../../shared/pht-date";

export type QueueDueDateCue = {
    urgency: "overdue" | "today" | "soon";
    label: string;
};

export type QueueReadinessCue = {
    kind: "blocked" | "ready" | "next";
    label: string;
};

function dateOrdinal(value: string): number | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        return null;
    }

    return Math.floor(date.getTime() / 86_400_000);
}

export function getQueueDueDateCue(
    dueDate: string | null | undefined,
    today = getPhtDateInputValue()
): QueueDueDateCue | null {
    if (!dueDate) return null;

    const dueTimestamp = phtTimestampToEpoch(dueDate);
    if (!dueTimestamp) return null;

    const dueDay = getPhtDateInputValue(new Date(dueTimestamp));
    const dueOrdinal = dateOrdinal(dueDay);
    const todayOrdinal = dateOrdinal(today);
    if (dueOrdinal === null || todayOrdinal === null) return null;

    const daysUntilDue = dueOrdinal - todayOrdinal;
    if (daysUntilDue < 0) {
        const overdueDays = Math.abs(daysUntilDue);
        return {
            urgency: "overdue",
            label: `Overdue by ${overdueDays} ${overdueDays === 1 ? "day" : "days"}`
        };
    }
    if (daysUntilDue === 0) return { urgency: "today", label: "Due today" };
    if (daysUntilDue <= 3) {
        return { urgency: "soon", label: `Due in ${daysUntilDue} ${daysUntilDue === 1 ? "day" : "days"}` };
    }
    return null;
}

export function getQueueReadinessCue(status: string, journey: JobOrderJourney): QueueReadinessCue | null {
    if (isJobOrderStatus(status, JOB_ORDER_STATUS.ON_HOLD)) {
        return { kind: "blocked", label: "Blocked: resolve Job Order hold" };
    }
    if (isJobOrderStatus(status, JOB_ORDER_STATUS.QA_HOLD)) {
        return { kind: "blocked", label: "Blocked: resolve QA hold" };
    }
    if (journey.isCancelled || isJobOrderStatus(status, JOB_ORDER_STATUS.CLOSED)) return null;

    if (journey.blockers.length > 0) {
        return { kind: "blocked", label: `Blocked: ${journey.blockers[0]}` };
    }
    if (isJobOrderStatus(status, JOB_ORDER_STATUS.PICKED)) {
        return { kind: "ready", label: "Ready: start production" };
    }
    if (isJobOrderStatus(status, JOB_ORDER_STATUS.IN_PRODUCTION)) {
        return { kind: "next", label: "Next: log shift run" };
    }
    if (isJobOrderStatus(status, JOB_ORDER_STATUS.PRODUCTION_COMPLETED, JOB_ORDER_STATUS.FOR_QA_RECONCILIATION)) {
        return { kind: "next", label: "Next: complete QA & yield review" };
    }
    if (journey.nextAction) {
        return { kind: "next", label: `Next: ${journey.nextAction.label}` };
    }
    return null;
}
