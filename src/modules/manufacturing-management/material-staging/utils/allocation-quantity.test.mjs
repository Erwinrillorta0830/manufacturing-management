import assert from "node:assert/strict";
import {
    exceedsAvailableQuantity,
    getManualAllocationLimit,
    getOverTargetQuantity,
    getAllocationShortage
} from "./allocation-quantity.ts";

assert.equal(getManualAllocationLimit(1, 0), 1);
assert.equal(getManualAllocationLimit(1, 0.2), 0.8);
assert.equal(getManualAllocationLimit(0.1, 0.2), 0);

assert.equal(exceedsAvailableQuantity(1, 1), false);
assert.equal(exceedsAvailableQuantity(1.0000001, 1), true);
assert.equal(exceedsAvailableQuantity(1.000001, 1), true);

assert.equal(getOverTargetQuantity(1, 1), 0);
assert.equal(getOverTargetQuantity(1.0002, 1), 0.0002);
assert.equal(getOverTargetQuantity(0.9, 1), 0);

assert.equal(getAllocationShortage(1, 0.8), 0.2);
assert.equal(getAllocationShortage(1, 1), 0);
assert.equal(getAllocationShortage(1, 1.2), 0);

console.log("material-staging allocation quantity assertions passed");
