import assert from "node:assert/strict";
import {
    buildMaterialReleaseBatch,
    buildReservationReleaseBatch,
    chunkBatch,
    matchesExistingReturnMovement
} from "./_cancellation-batch.ts";

const reservationBatch = buildReservationReleaseBatch([
    {
        id: 7,
        reservedQuantity: 12,
        stagedQuantity: 10,
        actualUsedQuantity: 3.45678,
        reservationStatus: "WIP"
    },
    {
        id: 8,
        reservedQuantity: 0,
        stagedQuantity: 0,
        actualUsedQuantity: 0,
        reservationStatus: "RELEASED"
    }
], quantity => Math.round(quantity * 10000) / 10000);

assert.deepEqual(reservationBatch.snapshots, [
    {
        id: 7,
        payload: {
            reserved_quantity: 12,
            staged_quantity: 10,
            reservation_status: "WIP"
        }
    }
]);
assert.deepEqual(reservationBatch.updates, [{
    jo_materials_reservation_id: 7,
    reserved_quantity: 0,
    staged_quantity: 3.4568,
    reservation_status: "RELEASED"
}]);

const materialBatch = buildMaterialReleaseBatch([
    { id: 31, reservedQuantity: 4 },
    { id: 32, reservedQuantity: 0 }
]);
assert.deepEqual(materialBatch.snapshots, [{ id: 31, reservedQuantity: 4 }]);
assert.deepEqual(materialBatch.updates, [{ jo_material_id: 31, reserved_quantity: 0 }]);

const reversal = {
    product_id: 17,
    branch_id: 4,
    mm_lot_id: 9,
    inventory_lot_id: 42,
    batch_no: "RTN-JO-1",
    transaction_type_id: 12,
    quantity: 3.25
};
const reversalIdentity = {
    productId: 17,
    branchId: 4,
    mmLotId: 9,
    inventoryLotId: 42,
    batchNo: "rtn-jo-1",
    transactionTypeId: 12,
    quantity: 3.25
};
assert.equal(matchesExistingReturnMovement(reversal, reversalIdentity), true);
assert.equal(matchesExistingReturnMovement(reversal, { ...reversalIdentity, quantity: 3.5 }), false);
assert.equal(matchesExistingReturnMovement(reversal, { ...reversalIdentity, inventoryLotId: 43 }), false);

const chunks = chunkBatch(Array.from({ length: 205 }, (_, index) => index));
assert.deepEqual(chunks.map(chunk => chunk.length), [100, 100, 5]);
assert.throws(() => chunkBatch([1, 2], 0), RangeError);

console.log("Job Order cancellation batch checks passed.");
