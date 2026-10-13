import assert from "node:assert/strict";
import test from "node:test";
import { getPlanningQueueWorkflowSummary } from "./queue-workflow-summary.ts";

function summarize(status, status_history = []) {
    const currentStageByStatus = {
        Draft: "Scheduled",
        "For Picking": "Staging materials",
        Picked: "Ready for production",
        "In Production": "In production",
        "On Hold": "In production",
        "QA Hold": "QA & yield",
        "Production Completed": "QA & yield",
        "For QA and Reconciliation": "QA & yield",
        Closed: "Completed"
    };

    return getPlanningQueueWorkflowSummary({
        status,
        statusLabel: status || "Unknown",
        currentStage: currentStageByStatus[status] || status || "Unknown",
        defaultNextAction: "Existing journey action",
        status_history
    });
}

test("planning queue summarizes the next action for active workflow statuses", () => {
    assert.equal(summarize("Draft").nextAction, "Initialize JO");
    assert.equal(summarize("For Picking").nextAction, "Complete staging / confirm picking");
    assert.equal(summarize("Picked").nextAction, "Start production");
    assert.equal(summarize("In Production").nextAction, "Continue production");
    assert.equal(summarize("Production Completed").nextAction, "Complete QA and reconciliation");
    assert.equal(summarize("For QA and Reconciliation").nextAction, "Complete QA and reconciliation");
});

test("planning queue displays the latest remark for the current hold status", () => {
    const summary = summarize("On Hold", [
            { new_status: "QA Hold", remarks: "QA disposition pending", changed_at: "2026-10-13T10:00:00+08:00" },
            { new_status: "On Hold", remarks: "Earlier stop reason", changed_at: "2026-10-13T08:00:00+08:00" },
            { new_status: "On Hold", remarks: "Latest stop reason", changed_at: "2026-10-13T09:00:00+08:00" }
    ]);

    assert.equal(summary.currentStage, "Production on hold");
    assert.equal(summary.nextAction, "Review hold and resume production");
    assert.equal(summary.blockedReason, "Latest stop reason");
    assert.equal(summary.blockerTone, "warning");
});

test("on-hold Job Orders receive generic guidance when no matching remark exists", () => {
    const summary = summarize("On Hold", [{ new_status: "In Production", remarks: "Unrelated note" }]);

    assert.equal(summary.blockedReason, "This Job Order is on hold. Review its details before resuming.");
    assert.equal(summary.blockerTone, "warning");
});

test("QA hold uses its matching remark or a status-specific fallback", () => {
    const recordedReason = summarize("QA Hold", [{ new_status: "QA Hold", remarks: "Disposition required" }]);
    const fallback = summarize("QA Hold");

    assert.equal(recordedReason.currentStage, "QA on hold");
    assert.equal(recordedReason.nextAction, "Resolve QA disposition");
    assert.equal(recordedReason.blockedReason, "Disposition required");
    assert.equal(recordedReason.blockerTone, "critical");
    assert.equal(fallback.blockedReason, "A QA disposition is required before this Job Order can proceed.");
});

test("closed Job Orders are marked complete with no further action", () => {
    const summary = summarize("Closed");

    assert.equal(summary.currentStage, "Completed");
    assert.equal(summary.nextAction, "No further action required");
    assert.equal(summary.blockedReason, null);
});
