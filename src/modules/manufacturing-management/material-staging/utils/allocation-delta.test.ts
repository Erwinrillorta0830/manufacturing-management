import assert from "node:assert/strict";
import { hasStagingDelta } from "./allocation-delta";

const BIN_A = "FLOOR-STAGING-112";
const BIN_B = "FLOOR-STAGING-113";
const staged = [
    { mm_lot_id: 1, inventory_lot_id: 11, batch_no: "B-001", staged_quantity: 100, staging_bin: BIN_A },
    { mm_lot_id: 2, inventory_lot_id: 22, batch_no: "B-002", staged_quantity: 50, staging_bin: BIN_A },
];

// Reported case: identical re-entry with nothing remaining is not a delta.
assert.equal(
    hasStagingDelta(staged, [
        { mm_lot_id: 1, inventory_lot_id: 11, batch_no: "B-001", quantity: 100 },
        { mm_lot_id: 2, inventory_lot_id: 22, batch_no: "B-002", quantity: 50 },
    ], BIN_A, 0),
    false
);

// Manual top-ups may exceed the outstanding target for floor buffer,
// even if they coincide with already-staged quantities (incremental lines).
assert.equal(
    hasStagingDelta(staged, [
        { mm_lot_id: 1, inventory_lot_id: 11, batch_no: "B-001", quantity: 100 },
        { mm_lot_id: 2, inventory_lot_id: 22, batch_no: "B-002", quantity: 50 },
    ], BIN_A, 150),
    true
);
assert.equal(
    hasStagingDelta(staged, [
        { mm_lot_id: 1, inventory_lot_id: 11, batch_no: "B-001", quantity: 120 },
        { mm_lot_id: 2, inventory_lot_id: 22, batch_no: "B-002", quantity: 50 },
    ], BIN_A, 150),
    true
);

// Quantity adjustment on the same lots is a delta.
assert.equal(
    hasStagingDelta(staged, [
        { mm_lot_id: 1, inventory_lot_id: 11, batch_no: "B-001", quantity: 120 },
        { mm_lot_id: 2, inventory_lot_id: 22, batch_no: "B-002", quantity: 50 },
    ], BIN_A),
    true
);

// Lot reassignment (new lot, dropped lot) is a delta.
assert.equal(
    hasStagingDelta(staged, [
        { mm_lot_id: 1, inventory_lot_id: 11, batch_no: "B-001", quantity: 100 },
        { mm_lot_id: 3, inventory_lot_id: 33, batch_no: "B-003", quantity: 50 },
    ], BIN_A),
    true
);

// Identical lots at a different destination bin are committable.
assert.equal(
    hasStagingDelta(staged, [
        { mm_lot_id: 1, inventory_lot_id: 11, batch_no: "B-001", quantity: 100 },
        { mm_lot_id: 2, inventory_lot_id: 22, batch_no: "B-002", quantity: 50 },
    ], BIN_B),
    true
);

// Empty selection posts nothing.
assert.equal(hasStagingDelta(staged, [], BIN_A), false);
assert.equal(hasStagingDelta(staged, [], BIN_B), false);

// Sub-epsilon rounding noise is not a delta.
assert.equal(
    hasStagingDelta(staged, [
        { mm_lot_id: 1, inventory_lot_id: 11, batch_no: "B-001", quantity: 100.0000005 },
        { mm_lot_id: 2, inventory_lot_id: 22, batch_no: "B-002", quantity: 50 },
    ], BIN_A),
    false
);

// Fresh staging against an empty baseline is a delta.
assert.equal(
    hasStagingDelta([], [{ mm_lot_id: 1, inventory_lot_id: 11, batch_no: "B-001", quantity: 100 }], BIN_A),
    true
);

// Batch matching ignores case/whitespace.
assert.equal(
    hasStagingDelta(staged, [
        { mm_lot_id: 1, inventory_lot_id: 11, batch_no: "  b-001 ", quantity: 100 },
        { mm_lot_id: 2, inventory_lot_id: 22, batch_no: "B-002", quantity: 50 },
    ], BIN_A),
    false
);

console.log("allocation-delta assertions passed");
