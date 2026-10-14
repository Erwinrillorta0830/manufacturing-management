import assert from "node:assert/strict";
import {
    allocateFefoQuantities,
    exceedsAvailableQuantity,
    getManualAllocationLimit,
    getManualAllocationTargetLimit,
    getMaterialRequiredQuantity,
    getRemainingAllocationQuantity,
    getOverTargetQuantity,
    getAllocationShortage
} from "./allocation-quantity.ts";

assert.equal(getManualAllocationLimit(1, 0), 1);
assert.equal(getManualAllocationLimit(1, 0.2), 0.8);
assert.equal(getManualAllocationLimit(0.1, 0.2), 0);

assert.equal(getMaterialRequiredQuantity({ allocated_quantity: 25.125 }), 25.125);
assert.equal(getMaterialRequiredQuantity({ allocated_quantity: 0, required_quantity: 25.125 }), 25.125);
assert.equal(getMaterialRequiredQuantity({ allocated_quantity: 0, required_quantity: 0 }), 0);

assert.equal(getRemainingAllocationQuantity(25.125, 0), 25.125);
assert.equal(getRemainingAllocationQuantity(25.125, 10), 15.125);
assert.equal(getRemainingAllocationQuantity(25.125, 25.125), 0);
assert.equal(getRemainingAllocationQuantity(25.125, 30), 0);
assert.deepEqual(allocateFefoQuantities(25.125, 0, [10, 100]), [10, 15.125]);
assert.deepEqual(allocateFefoQuantities(25.125, 10, [100]), [15.125]);
assert.deepEqual(allocateFefoQuantities(25.125, 25.125, [100]), [0]);

assert.equal(getManualAllocationTargetLimit(129695.492, 0, 25.125, 0), 25.125);
assert.equal(getManualAllocationTargetLimit(10, 0, 25.125, 0), 10);
assert.equal(getManualAllocationTargetLimit(129695.492, 0, 25.125, 10), 15.125);
assert.equal(getManualAllocationTargetLimit(100, 5, 12, 7), 5);
assert.equal(getManualAllocationTargetLimit(100, 0, 0, 0), 0);

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
