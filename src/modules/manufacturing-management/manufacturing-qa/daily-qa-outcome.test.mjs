import assert from "node:assert/strict";
import {
    dailyQAAuditStateError,
    deriveDailyQAOutcome,
    latestDailyQAAudit
} from "./daily-qa-outcome.ts";

assert.equal(dailyQAAuditStateError("", "Released"), "Choose a Lab Status before saving the QA audit.");
assert.equal(
    dailyQAAuditStateError("Pending", "Released"),
    "Pending Analysis cannot be released. Choose Hold / Quarantine or Scrap."
);
assert.equal(dailyQAAuditStateError("Pending", "Quarantined"), null);
assert.equal(dailyQAAuditStateError("Passed", "Released"), null);

const pendingAudit = {
    daily_qa_id: 10,
    jo_route_id: 4,
    inspected_at: "2026-10-15T09:00:00",
    sensory_status: "Passed",
    lab_status: "Pending",
    action_taken: "Quarantined",
    weight_check_passed: 1
};
const passedAudit = {
    daily_qa_id: 11,
    jo_route_id: 4,
    inspected_at: "2026-10-15T09:30:00",
    sensory_status: "Passed",
    lab_status: "Passed",
    action_taken: "Released",
    weight_check_passed: 1
};
const laterPendingAudit = {
    ...pendingAudit,
    daily_qa_id: 12,
    inspected_at: "2026-10-15T10:00:00"
};

assert.equal(latestDailyQAAudit([pendingAudit, passedAudit]), passedAudit);
assert.deepEqual(
    deriveDailyQAOutcome([pendingAudit, passedAudit], [4]),
    { status: "Passed", hasFailure: false, isComplete: true }
);
assert.deepEqual(
    deriveDailyQAOutcome([passedAudit, laterPendingAudit], [4]),
    { status: "QA Hold", hasFailure: true, isComplete: true }
);

console.log("Daily QA lab status and latest-inspection assertions passed.");
