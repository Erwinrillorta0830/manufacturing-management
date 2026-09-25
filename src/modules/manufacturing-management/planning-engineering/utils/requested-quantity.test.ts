import assert from "node:assert/strict";
import {
    convergeToFullBatch,
    formatProductionValue,
    sanitizeQuantityDraft,
} from "./production-timing";

// Draft sanitizing never collapses free typing: empty and partial drafts
// survive so Backspace/Delete/clear-to-retype always work keystroke by keystroke.
assert.equal(sanitizeQuantityDraft("", true), "");
assert.equal(sanitizeQuantityDraft("698", true), "698");
assert.equal(sanitizeQuantityDraft("6986.19", true), "698619");
assert.equal(sanitizeQuantityDraft("12e3", true), "123");
assert.equal(sanitizeQuantityDraft("1,000", true), "1000");
assert.equal(sanitizeQuantityDraft("", false), "");
assert.equal(sanitizeQuantityDraft("2.", false), "2.");
assert.equal(sanitizeQuantityDraft("2.5.5", false), "2.55");
assert.equal(sanitizeQuantityDraft("12e3", false), "123");

// Forced full-batch convergence: FG-SAMPLE-001 v1.0, SO demand 1000 pcs,
// net-stored base 6986.19. Sub-batch and below-demand requests floor up.
const subBatch = convergeToFullBatch(1000, 1000, 6986.19, "PCS");
assert.equal(subBatch.effective, 6986);
assert.equal(subBatch.batchCount, 1);
assert.equal(subBatch.wasAdjusted, true);
assert.ok((subBatch.note || "").length > 0);

const raised = convergeToFullBatch(8000, 1000, 6986.19, "PCS");
assert.equal(raised.effective, 13972);
assert.equal(formatProductionValue(raised.effective), "13972.0000");
assert.equal(raised.batchCount, 2);

// Empty/unparseable drafts fall back to the SO demand basis with a hint.
const empty = convergeToFullBatch(null, 1000, 6986.19, "PCS");
assert.equal(empty.effective, 6986);
assert.equal(empty.batchCount, 1);
assert.ok((empty.note || "").includes("SO demand"));
const zero = convergeToFullBatch(0, 1000, 6986.19, "PCS");
assert.equal(zero.effective, 6986);

// Below-demand requests floor at SO demand before batch rounding.
const below = convergeToFullBatch(500, 1000, 6986.19, "PCS");
assert.equal(below.basis, 1000);
assert.equal(below.effective, 6986);
assert.ok((below.note || "").includes("SO demand"));

// Exact batch multiples pass through without adjustment notes.
const exact = convergeToFullBatch(6986, 1000, 6986.19, "PCS");
assert.equal(exact.effective, 6986);
assert.equal(exact.wasAdjusted, false);
assert.equal(exact.note, null);

// Non-piece UOMs keep fractional convergence (no whole-unit rounding).
const liters = convergeToFullBatch(2, 2, 1, "Liters");
assert.equal(liters.effective, 2);
assert.equal(liters.wasAdjusted, false);

console.log("requested-quantity assertions passed");
