import assert from "node:assert/strict";
import { exceedsAvailableStock } from "./production-quantity";

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

console.log("production-quantity assertions passed");
