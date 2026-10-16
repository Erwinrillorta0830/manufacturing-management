import assert from "node:assert/strict";
import { isRejectedOutputRegistered, rejectedOutputLedgerPatch, shouldRegisterRejectedOutput } from "./rejected-output.ts";

assert.equal(shouldRegisterRejectedOutput(1, true), true);
assert.equal(shouldRegisterRejectedOutput(1, false), false);
assert.equal(shouldRegisterRejectedOutput(0, true), false);
assert.equal(shouldRegisterRejectedOutput(-1, true), false);

assert.equal(isRejectedOutputRegistered(208), true);
assert.equal(isRejectedOutputRegistered(0), false);
assert.equal(isRejectedOutputRegistered(null), false);
assert.equal(isRejectedOutputRegistered(undefined), false);
assert.equal(isRejectedOutputRegistered(Number.NaN), false);

assert.deepEqual(rejectedOutputLedgerPatch({
    mmLotId: 1971,
    batchNo: "JO-REJECT-152",
    manufacturingDate: "2026-10-07",
    expiryDate: "2026-10-28"
}), {
    rejected_mm_lot_id: 1971,
    rejected_lot_number: "JO-REJECT-152",
    rejected_manufacturing_date: "2026-10-07",
    rejected_expiry_date: "2026-10-28",
    rejected_inventory_condition: "DAMAGED"
});

console.log("rejected-output assertions passed");
