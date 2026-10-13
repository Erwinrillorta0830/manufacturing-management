import assert from "node:assert/strict";
import test from "node:test";
import { JOB_ORDER_STATUS } from "../../job-order-status.ts";
import { resolveJobOrderJourney } from "../../shared/job-order-journey.ts";
import { getQueueDueDateCue, getQueueReadinessCue } from "./queue-row-cues.ts";

test("queue due-date cues distinguish overdue, due today, and the three-day window", () => {
    const today = "2026-10-13";

    assert.deepEqual(getQueueDueDateCue("2026-10-12", today), {
        urgency: "overdue",
        label: "Overdue by 1 day"
    });
    assert.deepEqual(getQueueDueDateCue("2026-10-13", today), {
        urgency: "today",
        label: "Due today"
    });
    assert.deepEqual(getQueueDueDateCue("2026-10-14", today), {
        urgency: "soon",
        label: "Due in 1 day"
    });
    assert.deepEqual(getQueueDueDateCue("2026-10-16", today), {
        urgency: "soon",
        label: "Due in 3 days"
    });
    assert.equal(getQueueDueDateCue("2026-10-17", today), null);
});

test("queue due-date cues use the Manila calendar day for timestamp values", () => {
    assert.deepEqual(getQueueDueDateCue("2026-10-12T16:30:00.000Z", "2026-10-13"), {
        urgency: "today",
        label: "Due today"
    });
    assert.deepEqual(getQueueDueDateCue("2026-10-13T16:30:00.000Z", "2026-10-13"), {
        urgency: "soon",
        label: "Due in 1 day"
    });
});

test("queue due-date cues remain neutral for missing or invalid dates", () => {
    assert.equal(getQueueDueDateCue(null, "2026-10-13"), null);
    assert.equal(getQueueDueDateCue("not-a-date", "2026-10-13"), null);
    assert.equal(getQueueDueDateCue("2026-10-13", "invalid-day"), null);
});

test("queue readiness text explains the next step for active statuses", () => {
    const ready = resolveJobOrderJourney({ status: JOB_ORDER_STATUS.PICKED });
    const inProduction = resolveJobOrderJourney({ status: JOB_ORDER_STATUS.IN_PRODUCTION });
    const forQa = resolveJobOrderJourney({ status: JOB_ORDER_STATUS.PRODUCTION_COMPLETED });

    assert.deepEqual(getQueueReadinessCue(JOB_ORDER_STATUS.PICKED, ready), {
        kind: "ready",
        label: "Ready: start production"
    });
    assert.deepEqual(getQueueReadinessCue(JOB_ORDER_STATUS.IN_PRODUCTION, inProduction), {
        kind: "next",
        label: "Next: log shift run"
    });
    assert.deepEqual(getQueueReadinessCue(JOB_ORDER_STATUS.PRODUCTION_COMPLETED, forQa), {
        kind: "next",
        label: "Next: complete QA & yield review"
    });
});

test("queue readiness text surfaces holds and skips closed or cancelled orders", () => {
    const onHold = resolveJobOrderJourney({ status: JOB_ORDER_STATUS.ON_HOLD });
    const qaHold = resolveJobOrderJourney({ status: JOB_ORDER_STATUS.QA_HOLD });
    const closed = resolveJobOrderJourney({ status: JOB_ORDER_STATUS.CLOSED });
    const cancelled = resolveJobOrderJourney({ status: JOB_ORDER_STATUS.CANCELLED });

    assert.deepEqual(getQueueReadinessCue(JOB_ORDER_STATUS.ON_HOLD, onHold), {
        kind: "blocked",
        label: "Blocked: resolve Job Order hold"
    });
    assert.deepEqual(getQueueReadinessCue(JOB_ORDER_STATUS.QA_HOLD, qaHold), {
        kind: "blocked",
        label: "Blocked: resolve QA hold"
    });
    assert.equal(getQueueReadinessCue(JOB_ORDER_STATUS.CLOSED, closed), null);
    assert.equal(getQueueReadinessCue(JOB_ORDER_STATUS.CANCELLED, cancelled), null);
});
