import assert from "node:assert/strict";
import {
    GENERIC_FLOOR_STAGING_BIN,
    resolveStagingTargetBin
} from "../types";

// Raw-material-level staging (no work center): generic floor bin.
assert.equal(GENERIC_FLOOR_STAGING_BIN, "FLOOR-STAGING");
assert.equal(resolveStagingTargetBin(null), "FLOOR-STAGING");
assert.equal(resolveStagingTargetBin(undefined), "FLOOR-STAGING");
assert.equal(resolveStagingTargetBin(0), "FLOOR-STAGING");
assert.equal(resolveStagingTargetBin(-3), "FLOOR-STAGING");

// Legacy callers still passing a work center keep the scoped bin so old
// FLOOR-STAGING-{id} rows and new generic rows stay mutually readable.
assert.equal(resolveStagingTargetBin(112), "FLOOR-STAGING-112");
assert.equal(resolveStagingTargetBin(1), "FLOOR-STAGING-1");

console.log("staging-target-bin tests passed");
