import assert from "node:assert/strict";
import {
    calculateQAOutputAllocationCapacity,
    parseQAOutputQuantity,
    qaOutputAllocationCapacityErrorMessage,
    qaOutputAllocationMatchesLoggedTotal,
    qaOutputAllocationWithinCapacity,
    sumQAOutputQuantities
} from "./qa-output-allocation.ts";

assert.equal(parseQAOutputQuantity("6000"), 6000);
assert.equal(parseQAOutputQuantity("10.125"), 10.125);
assert.equal(parseQAOutputQuantity("-1"), null);
assert.equal(parseQAOutputQuantity("1.0000001"), null);
assert.equal(parseQAOutputQuantity(""), null);
assert.equal(sumQAOutputQuantities("1.2", "0.3", "0.5"), 2);
assert.equal(sumQAOutputQuantities("1.0000001"), null);

const capacity = calculateQAOutputAllocationCapacity([
    {
        ledger_id: 1,
        commit_status: "COMMITTED",
        yield_quantity: 2,
        rejected_quantity: 0,
        scrap_quantity: 0,
        qa_accepted_quantity: 1,
        qa_rejected_quantity: 1
    },
    {
        ledger_id: 2,
        commit_status: "COMMITTED",
        yield_quantity: 3,
        rejected_quantity: 0.5,
        scrap_quantity: 0.5,
        qa_accepted_quantity: 1,
        qa_rejected_quantity: 1
    },
    { ledger_id: 3, commit_status: null, yield_quantity: 2, rejected_quantity: 0, scrap_quantity: 0 },
    { ledger_id: 4, commit_status: "PENDING", yield_quantity: 100, rejected_quantity: 0, scrap_quantity: 0 },
    { ledger_id: 5, commit_status: "FAILED", yield_quantity: 100, rejected_quantity: 0, scrap_quantity: 0 }
], 1);

assert.deepEqual(capacity, {
    totalProducedQuantity: 8,
    allocatedElsewhereQuantity: 2,
    maxAuditQuantity: 6,
    loggedOutputQuantity: 2
});
assert.equal(qaOutputAllocationWithinCapacity({ acceptedQuantity: 2, rejectedQuantity: 4 }, capacity.maxAuditQuantity), true);
assert.equal(qaOutputAllocationWithinCapacity({ acceptedQuantity: 5, rejectedQuantity: 1.000001 }, capacity.maxAuditQuantity), false);
assert.equal(qaOutputAllocationWithinCapacity({ acceptedQuantity: 2.5, rejectedQuantity: 0 }, capacity.maxAuditQuantity), true);
assert.equal(
    qaOutputAllocationCapacityErrorMessage(3, 7, "pcs"),
    "Total audited quantity (Good + Bad) cannot exceed the remaining Job Order production capacity (3 pcs; 7 pcs produced)."
);
assert.equal(calculateQAOutputAllocationCapacity([
    { ledger_id: 1, commit_status: "COMMITTED", yield_quantity: 2, qa_accepted_quantity: 1, qa_rejected_quantity: 1 },
    { ledger_id: 2, commit_status: "COMMITTED", yield_quantity: 3, qa_accepted_quantity: 1, qa_rejected_quantity: 1 },
    { ledger_id: 3, commit_status: "COMMITTED", yield_quantity: 2 }
], 3)?.maxAuditQuantity, 3);
assert.equal(qaOutputAllocationMatchesLoggedTotal({ acceptedQuantity: 2, rejectedQuantity: 1 }, 2, 0), false);
assert.equal(qaOutputAllocationMatchesLoggedTotal({ acceptedQuantity: 1.5, rejectedQuantity: 0.5 }, 2, 0), true);
assert.equal(calculateQAOutputAllocationCapacity([], 1), null);

console.log("QA output allocation assertions passed");
