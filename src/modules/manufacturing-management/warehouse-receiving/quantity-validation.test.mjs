import assert from "node:assert/strict";
import { isReceiptQuantityOverRemaining } from "./quantity-validation.ts";

assert.equal(isReceiptQuantityOverRemaining(0, 10), false);
assert.equal(isReceiptQuantityOverRemaining(9, 10), false);
assert.equal(isReceiptQuantityOverRemaining(10, 10), false);
assert.equal(isReceiptQuantityOverRemaining(10 + 0.5e-9, 10), false);
assert.equal(isReceiptQuantityOverRemaining(10 + 2e-9, 10), true);

console.log("Warehouse partial receipt quantity checks passed.");
