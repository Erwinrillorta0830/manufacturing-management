import assert from "node:assert/strict";
import { canChangeJobOrderOperatorRoster } from "./job-order-status.ts";

for (const status of ["For Picking", "Picked", "In Production", "released", "reserved", "ongoing"]) {
    assert.equal(canChangeJobOrderOperatorRoster(status), true, `${status} should permit route roster changes`);
}

for (const status of [
    "Draft",
    "On Hold",
    "QA Hold",
    "Production Completed",
    "For QA and Reconciliation",
    "Closed",
    "Cancelled",
    "unknown"
]) {
    assert.equal(canChangeJobOrderOperatorRoster(status), false, `${status} should reject route roster changes`);
}

console.log("job-order-status assertions passed");
