import assert from "node:assert/strict";
import {
    calculateFullBatchTarget,
    calculateRequiredBatchCount,
    estimateGrossBaseQuantityFromNet,
    formatProductionValue,
    isLikelyNetStoredBaseQuantity,
    resolveRecipeBatchSizeDisplay,
} from "./production-timing";

// Regression: FG-SAMPLE-001 Rev 2 — gross base 7092.5556 @ 98.5% yield.
// The Release Production Run modal must show the gross base quantity; the
// net output (6986.1672) is display-only and must never be fed back as the
// batch size.
const display = resolveRecipeBatchSizeDisplay(7092.5556, 98.5);
assert.equal(formatProductionValue(display.grossBaseQuantity), "7092.5556");
assert.equal(display.expectedYieldPercentage, 98.5);
assert.equal(formatProductionValue(display.expectedNetQuantity), "6986.1673");

// Full-batch targets are driven by the gross base quantity.
assert.equal(calculateRequiredBatchCount(12001, display.grossBaseQuantity), 2);
assert.equal(
    formatProductionValue(calculateFullBatchTarget(12001, display.grossBaseQuantity)),
    "14185.1112"
);

// Feeding the net output back as the batch size silently re-plans a
// different (understated) target: 13972.38 instead of 14185.1112.
assert.equal(formatProductionValue(calculateFullBatchTarget(12001, 6986.19)), "13972.3800");
assert.notEqual(
    formatProductionValue(calculateFullBatchTarget(12001, display.grossBaseQuantity)),
    formatProductionValue(calculateFullBatchTarget(12001, 6986.19))
);

// A net-stored base quantity (stale v1.0 row: 6986.19) yields a net-of-net
// expectation — the visible signal of bad master data in the modal.
const stale = resolveRecipeBatchSizeDisplay(6986.19, 98.5);
assert.ok(stale.expectedNetQuantity < stale.grossBaseQuantity);
assert.equal(formatProductionValue(stale.expectedNetQuantity), "6881.3972");

// Missing yield defaults to 100%: net equals gross.
const noYield = resolveRecipeBatchSizeDisplay(7092.5556, null);
assert.equal(noYield.expectedYieldPercentage, 100);
assert.equal(formatProductionValue(noYield.expectedNetQuantity), "7092.5556");

// Editor guard: a manually entered base matching net (not gross) flags,
// while genuine gross entries and 100%-yield recipes never flag.
assert.equal(isLikelyNetStoredBaseQuantity(6986.19, 7092.5556, 98.5), true);
assert.equal(isLikelyNetStoredBaseQuantity(7092.5556, 7092.5556, 98.5), false);
assert.equal(isLikelyNetStoredBaseQuantity(7092.5556, 7092.5556, 100), false);
assert.equal(isLikelyNetStoredBaseQuantity(7092.5556, 7092.5556, null), false);

// Recovery estimate: net / yield factor reproduces the gross to 4dp.
assert.equal(formatProductionValue(estimateGrossBaseQuantityFromNet(6986.1673, 98.5)), "7092.5556");

console.log("recipe-batch-size assertions passed");
