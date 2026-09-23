import assert from "node:assert/strict";
import { compareCost, combineCostComparisons, roundCost } from "./cost-variance";

assert.equal(roundCost(0.1 + 0.2), 0.3);

const overStandard = compareCost(100, 125, 10);
assert.equal(overStandard.variance, 25);
assert.equal(overStandard.variancePercent, 25);
assert.equal(overStandard.complete, true);

const underStandard = compareCost(100, 75, 10);
assert.equal(underStandard.variance, -25);
assert.equal(underStandard.variancePercent, -25);

const zeroStandard = compareCost(0, 8, 10);
assert.equal(zeroStandard.variance, 8);
assert.equal(zeroStandard.variancePercent, null);

const noOutput = compareCost(0, 8, 0);
assert.equal(noOutput.variance, null);
assert.equal(noOutput.complete, false);

const incomplete = combineCostComparisons([
    compareCost(100, 100, 10),
    compareCost(null, 10, 10)
], 10);
assert.equal(incomplete.standard, null);
assert.equal(incomplete.variance, null);
assert.equal(incomplete.complete, false);
