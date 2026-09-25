import assert from "node:assert/strict";
import {
    isBadToBadTransferAllowed,
    isReleasableQaStatus
} from "./_values.ts";

assert.equal(isReleasableQaStatus("GOOD"), true);
assert.equal(isReleasableQaStatus("passed"), true);
assert.equal(isReleasableQaStatus("PASS"), true);
assert.equal(isReleasableQaStatus("approved"), true);
assert.equal(isReleasableQaStatus("DAMAGED"), false);
assert.equal(isReleasableQaStatus("QUARANTINED"), false);
assert.equal(isReleasableQaStatus(null), false);

// BAD-to-BAD: DAMAGED source into an all-DAMAGED destination passes.
assert.equal(isBadToBadTransferAllowed("DAMAGED", ["DAMAGED"]), true);
assert.equal(isBadToBadTransferAllowed("damaged", ["DAMAGED", "damaged"]), true);
// Releasable sources never need the allowance.
assert.equal(isBadToBadTransferAllowed("GOOD", ["DAMAGED"]), false);
assert.equal(isBadToBadTransferAllowed("GOOD", []), false);
// Mixed, good, or empty destinations stay blocked.
assert.equal(isBadToBadTransferAllowed("DAMAGED", ["DAMAGED", "GOOD"]), false);
assert.equal(isBadToBadTransferAllowed("DAMAGED", ["GOOD"]), false);
assert.equal(isBadToBadTransferAllowed("DAMAGED", []), false);
// Bands must match: DAMAGED cannot leak into a QUARANTINED lot and vice versa.
assert.equal(isBadToBadTransferAllowed("DAMAGED", ["QUARANTINED"]), false);
assert.equal(isBadToBadTransferAllowed("QUARANTINED", ["QUARANTINED"]), true);
// Blank source status stays blocked (missing QA is handled upstream).
assert.equal(isBadToBadTransferAllowed(null, ["DAMAGED"]), false);
assert.equal(isBadToBadTransferAllowed("", ["DAMAGED"]), false);

console.log("Lot transfer BAD-to-BAD QA checks passed.");
