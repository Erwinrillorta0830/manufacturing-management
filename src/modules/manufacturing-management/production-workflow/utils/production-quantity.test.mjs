import assert from "node:assert/strict";
import { exceedsAvailableStock, roundToInputStep } from "./production-quantity.ts";

// Equal balances are sufficient.
assert.equal(exceedsAvailableStock(273.139, 273.139), false);
assert.equal(exceedsAvailableStock("273.139000", 273.139), false);
// Sub-display float dust (e.g. 273.139 vs 273.1389999) is not a shortfall.
assert.equal(exceedsAvailableStock(273.139, 273.1389999), false);
assert.equal(exceedsAvailableStock(273.1390004, 273.139), false);
// Genuine excess still flags.
assert.equal(exceedsAvailableStock(273.14, 273.139), true);
assert.equal(exceedsAvailableStock(100, 99.998), true);
// Empty/zero handling matches the previous Number(x || 0) semantics.
assert.equal(exceedsAvailableStock("", 0), false);
assert.equal(exceedsAvailableStock(null, null), false);
assert.equal(exceedsAvailableStock(0.5, 0), true);

// Remaining-WIP rounding collapses float dust to the 6dp input step so
// native max validation agrees with the rounded display (JO-936107:
// 1773.139 - 1500 must yield exactly 273.139, not 273.1389999999).
assert.equal(roundToInputStep(1773.139 - 1500), 273.139);
assert.equal(roundToInputStep(273.1389999999), 273.139);
assert.equal(roundToInputStep(1063.8834 - 900), 163.8834);
assert.equal(roundToInputStep(0), 0);
assert.equal(roundToInputStep(null), 0);
assert.equal(roundToInputStep("54.6278"), 54.6278);
// A value already on the step is unchanged, so genuine caps are preserved.
assert.equal(roundToInputStep(273.139), 273.139);

console.log("production-quantity assertions passed");
