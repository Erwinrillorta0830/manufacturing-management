import assert from "node:assert/strict";
import {
    parseQAOutputQuantity,
    qaOutputAllocationMatchesLoggedTotal
} from "./qa-output-allocation.ts";

assert.equal(parseQAOutputQuantity("6000"), 6000);
assert.equal(parseQAOutputQuantity("10.125"), 10.125);
assert.equal(parseQAOutputQuantity("-1"), null);
assert.equal(parseQAOutputQuantity("1.0000001"), null);
assert.equal(parseQAOutputQuantity(""), null);

assert.equal(qaOutputAllocationMatchesLoggedTotal({ acceptedQuantity: 6000, rejectedQuantity: 10 }, 6000, 10), true);
assert.equal(qaOutputAllocationMatchesLoggedTotal({ acceptedQuantity: 5999, rejectedQuantity: 11 }, 6000, 10), true);
assert.equal(qaOutputAllocationMatchesLoggedTotal({ acceptedQuantity: 6000, rejectedQuantity: 9 }, 6000, 10), false);
assert.equal(qaOutputAllocationMatchesLoggedTotal({ acceptedQuantity: 2, rejectedQuantity: 0 }, 2, 0), true);
assert.equal(qaOutputAllocationMatchesLoggedTotal({ acceptedQuantity: 1, rejectedQuantity: 1 }, 2, 0), true);
assert.equal(qaOutputAllocationMatchesLoggedTotal({ acceptedQuantity: 2, rejectedQuantity: 1 }, 2, 0), false);
assert.equal(qaOutputAllocationMatchesLoggedTotal({ acceptedQuantity: 0, rejectedQuantity: 0 }, 0, 0), true);

console.log("QA output allocation assertions passed");
