import assert from "node:assert/strict";
import {
    calculateProductionOutputOverrun,
    calculateShiftOutputConfirmationSummary,
    committedNadOutputOrAggregate,
    hasReachedProductionTarget,
    sumCommittedGoodOutput,
    sumCommittedNadOutput,
    sumCommittedRejectedOutput
} from "./production-output.ts";

assert.equal(calculateProductionOutputOverrun(5, 6), 1);
assert.equal(calculateProductionOutputOverrun(5, 5), 0);
assert.equal(calculateProductionOutputOverrun(5, 4), 0);
assert.equal(calculateProductionOutputOverrun(5, 5.0000005), 0);
assert.equal(calculateProductionOutputOverrun(0, 6), 0);
assert.equal(calculateProductionOutputOverrun("invalid", 6), 0);

// Crossing the target in this session is allowed; the target check still
// reports that the Job Order cannot accept another session afterward.
assert.equal(hasReachedProductionTarget(5, 0), false);
assert.equal(hasReachedProductionTarget(5, 6), true);

assert.equal(sumCommittedRejectedOutput([
    { rejected_quantity: 1, commit_status: "COMMITTED" },
    { rejected_quantity: 2, commit_status: "PENDING" },
    { rejected_quantity: 0.5, commit_status: "" },
    { rejected_quantity: 3, commit_status: "FAILED" },
    { rejected_quantity: -4, scrap_quantity: 8, commit_status: "COMMITTED" },
    { rejected_quantity: "invalid", commit_status: "COMMITTED" }
]), 1.5);
assert.equal(sumCommittedRejectedOutput([]), 0);
assert.equal(sumCommittedNadOutput([
    { rejected_quantity: 1, scrap_quantity: 0.2, commit_status: "COMMITTED" },
    { rejected_quantity: 2, scrap_quantity: 0.5, commit_status: "PENDING" },
    { rejected_quantity: 0.5, scrap_quantity: 0.25, commit_status: "" },
    { rejected_quantity: 3, scrap_quantity: 4, commit_status: "FAILED" },
    { rejected_quantity: -4, scrap_quantity: 8, commit_status: "COMMITTED" },
    { rejected_quantity: "invalid", scrap_quantity: "invalid", commit_status: "COMMITTED" }
]), 9.95);
assert.equal(sumCommittedNadOutput([]), 0);
assert.equal(committedNadOutputOrAggregate([], 4.25), 4.25);
assert.equal(committedNadOutputOrAggregate([], -4), 0);
assert.equal(committedNadOutputOrAggregate([
    { rejected_quantity: 1, scrap_quantity: 0.5, commit_status: "COMMITTED" }
], 10), 1.5);
assert.equal(sumCommittedGoodOutput([
    { yield_quantity: 4, commit_status: "COMMITTED" },
    { yield_quantity: 3, commit_status: "PENDING" },
    { yield_quantity: 1, commit_status: "" }
]), 5);

assert.deepEqual(calculateShiftOutputConfirmationSummary(4, 1, [
    { rejected_quantity: 1, commit_status: "COMMITTED" },
    { rejected_quantity: 2, commit_status: "PENDING" }
], 0), {
    sessionGoodQuantity: 1,
    projectedGoodQuantity: 5,
    sessionRejectedQuantity: 0,
    cumulativeRejectedQuantity: 1,
    totalManufacturedRunQuantity: 6
});
assert.deepEqual(calculateShiftOutputConfirmationSummary(5, 0, [
    { rejected_quantity: 1, commit_status: "COMMITTED" }
], 2), {
    sessionGoodQuantity: 0,
    projectedGoodQuantity: 5,
    sessionRejectedQuantity: 2,
    cumulativeRejectedQuantity: 3,
    totalManufacturedRunQuantity: 8
});

console.log("production-output assertions passed");
