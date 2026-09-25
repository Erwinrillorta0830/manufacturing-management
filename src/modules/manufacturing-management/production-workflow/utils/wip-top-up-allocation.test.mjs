import assert from "node:assert/strict";
import {
    allocateTopUpQuantity,
    isEligibleRawMaterialTopUpLot,
    orderTopUpCandidates
} from "./wip-top-up-allocation.ts";

const preferredLot = {
    status: "ACTIVE",
    qa_status: "GOOD",
    mm_lot_id: 12,
    inventory_lot_id: 120,
    lot_no: "BATCH-RESERVED",
    expiry_date: "2027-12-01",
    available: 0.4
};
const earlierExpiryLot = {
    status: "ACTIVE",
    qa_status: "GOOD",
    mm_lot_id: 13,
    inventory_lot_id: 130,
    lot_no: "BATCH-FEFO-1",
    expiry_date: "2026-10-01",
    available: 0.3
};
const nextExpiryLot = {
    status: "ACTIVE",
    qa_status: "GOOD",
    mm_lot_id: 14,
    inventory_lot_id: 140,
    lot_no: "BATCH-FEFO-2",
    expiry_date: "2026-11-01",
    available: 0.5
};

const preferred = { mmLotId: 12, inventoryLotId: 120, batchNo: "BATCH-RESERVED" };
assert.deepEqual(
    orderTopUpCandidates([nextExpiryLot, preferredLot, earlierExpiryLot], preferred).map((lot) => lot.lot_no),
    ["BATCH-RESERVED", "BATCH-FEFO-1", "BATCH-FEFO-2"]
);

assert.deepEqual(
    allocateTopUpQuantity([nextExpiryLot, preferredLot, earlierExpiryLot], 0.8484, preferred).map(({ lot, quantity }) => ({
        batch: lot.lot_no,
        quantity
    })),
    [
        { batch: "BATCH-RESERVED", quantity: 0.4 },
        { batch: "BATCH-FEFO-1", quantity: 0.3 },
        { batch: "BATCH-FEFO-2", quantity: 0.1484 }
    ]
);

assert.equal(isEligibleRawMaterialTopUpLot(preferredLot, new Date("2026-09-25T12:00:00")), true);
assert.equal(isEligibleRawMaterialTopUpLot({ ...preferredLot, status: "INACTIVE" }), false);
assert.equal(isEligibleRawMaterialTopUpLot({ ...preferredLot, qa_status: "PASSED" }), false);
assert.equal(isEligibleRawMaterialTopUpLot({ ...preferredLot, expiry_date: "2026-09-24" }, new Date("2026-09-25T12:00:00")), false);
assert.equal(isEligibleRawMaterialTopUpLot({ ...preferredLot, expiry_date: "not-a-date" }), false);

const partial = allocateTopUpQuantity([earlierExpiryLot], 0.8484);
assert.equal(partial.reduce((sum, allocation) => sum + allocation.quantity, 0), 0.3);

console.log("wip top-up allocation assertions passed");
