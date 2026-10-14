import assert from "node:assert/strict";
import {
    buildWipAdditionalIndex,
    calculateWipMaterialBalance,
    getWipAdditionalForLot
} from "./job-order-progress-materials.ts";

const additionalIndex = buildWipAdditionalIndex([
    { quantity: -4, mm_lot_id: { lot_id: 12 }, batch_no: "BATCH-A", remarks: "[MM-WIP-TOP-UP] jo_material_id=7;target_bin=FLOOR" },
    { quantity: -1.25, mm_lot_id: 12, batch_no: "batch-a", remarks: "[MM-WIP-TOP-UP] jo_material_id=7;target_bin=FLOOR" },
    { quantity: -30, mm_lot_id: 12, batch_no: "BATCH-A", remarks: "[MM-WIP-TOP-UP] jo_material_id=8;target_bin=FLOOR" },
    { quantity: -9, mm_lot_id: 13, batch_no: "BATCH-B", remarks: "[MM-WIP-TOP-UP] no material reference" },
    { quantity: 2, mm_lot_id: 12, batch_no: "BATCH-A", remarks: "[MM-WIP-TOP-UP] jo_material_id=7;target_bin=FLOOR" }
]);

assert.equal(additionalIndex.byMaterial.get(7), 5.25);
assert.equal(additionalIndex.byMaterial.get(8), 30);
assert.equal(getWipAdditionalForLot(additionalIndex, 7, 12, "BATCH-A"), 5.25);
assert.equal(getWipAdditionalForLot(additionalIndex, 7, 12, "BATCH-B"), 0);
assert.equal(getWipAdditionalForLot(additionalIndex, 8, 12, "BATCH-A"), 30);

assert.deepEqual(calculateWipMaterialBalance(25, 0, 5, 0), {
    reserved: 25,
    additional: 0,
    consumed: 5,
    remaining: 20
});
assert.deepEqual(calculateWipMaterialBalance(30, 8, 7, 2), {
    reserved: 22,
    additional: 8,
    consumed: 7,
    remaining: 21
});

console.log("job-order-progress-materials assertions passed");
