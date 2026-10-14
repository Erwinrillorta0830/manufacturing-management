import assert from "node:assert/strict";
import { calculateProductionOutputOverrun, hasReachedProductionTarget } from "./production-output.ts";

assert.equal(calculateProductionOutputOverrun(5, 6), 1);
assert.equal(calculateProductionOutputOverrun(5, 5), 0);
assert.equal(calculateProductionOutputOverrun(5, 4), 0);
assert.equal(calculateProductionOutputOverrun(5, 5.0000005), 0);
assert.equal(calculateProductionOutputOverrun(0, 6), 0);
assert.equal(calculateProductionOutputOverrun("invalid", 6), 0);

// Crossing the target in this session is allowed; the target check still
// reports that the Job Order cannot accept another session afterward.
assert.equal(hasReachedProductionTarget(5, 0), false);
assert.equal(hasReachedProductionTarget(5, 6), true);

console.log("production-output assertions passed");
