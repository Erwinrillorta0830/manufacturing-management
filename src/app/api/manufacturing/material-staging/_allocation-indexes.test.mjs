import assert from "node:assert/strict";
import {
    addStagedMovementQuantity,
    allocationStockIdentityKey,
    buildAllocationReservationIndexes,
    indexInventoryLotsByProduct
} from "./_allocation-indexes.ts";
import { normalizeBatchNo } from "./_stock.ts";

const selectedMaterialIds = new Set([101]);
const reservations = [
    {
        materialId: 101, productId: 7, branchId: 2, mmLotId: 3, inventoryLotId: 10,
        batchNo: "Batch-A", reservedQuantity: 10, actualUsedQuantity: 1, stagedQuantity: 2
    },
    {
        materialId: 101, productId: 7, branchId: 2, mmLotId: 3, inventoryLotId: 10,
        batchNo: "batch-a", reservedQuantity: 5, actualUsedQuantity: 0, stagedQuantity: 3
    },
    {
        materialId: 202, productId: 7, branchId: 2, mmLotId: 3, inventoryLotId: 10,
        batchNo: " BATCH-A ", reservedQuantity: 8, actualUsedQuantity: 1, stagedQuantity: 2
    },
    {
        materialId: 303, productId: 7, branchId: 2, mmLotId: 3, inventoryLotId: 11,
        batchNo: "batch-a", reservedQuantity: 20, actualUsedQuantity: 0, stagedQuantity: 0
    },
    {
        materialId: 404, productId: 7, branchId: 9, mmLotId: 3, inventoryLotId: 10,
        batchNo: "batch-a", reservedQuantity: 30, actualUsedQuantity: 0, stagedQuantity: 0
    },
    {
        materialId: 505, productId: 7, branchId: 2, mmLotId: 3, inventoryLotId: 10,
        batchNo: "batch-a", reservedQuantity: 2, actualUsedQuantity: 5, stagedQuantity: 1
    }
];

const reservationIndexes = buildAllocationReservationIndexes(reservations, selectedMaterialIds, normalizeBatchNo);
const selectedIdentity = allocationStockIdentityKey({
    productId: 7, branchId: 2, mmLotId: 3, inventoryLotId: 10, batchNo: "BATCH-A"
}, normalizeBatchNo);
assert.equal(reservationIndexes.stagedByMaterialId.get(101), 5);
assert.equal(reservationIndexes.reservedElsewhereByStockIdentity.get(selectedIdentity), 5);
assert.notEqual(
    reservationIndexes.reservedElsewhereByStockIdentity.get(selectedIdentity),
    reservationIndexes.reservedElsewhereByStockIdentity.get(allocationStockIdentityKey({
        productId: 7, branchId: 2, mmLotId: 3, inventoryLotId: 11, batchNo: "batch-a"
    }, normalizeBatchNo))
);
assert.equal(
    reservationIndexes.reservedElsewhereByStockIdentity.get(allocationStockIdentityKey({
        productId: 7, branchId: 9, mmLotId: 3, inventoryLotId: 10, batchNo: "batch-a"
    }, normalizeBatchNo)),
    30
);

const stagedByMovement = new Map();
addStagedMovementQuantity(stagedByMovement, 101, -5, false);
addStagedMovementQuantity(stagedByMovement, 101, 2, true);
addStagedMovementQuantity(stagedByMovement, 202, 4, false);
assert.equal(stagedByMovement.get(101), 3);
assert.equal(stagedByMovement.get(202), 4);

const inventoryLots = [
    { productId: 7, inventoryLotId: 10 },
    { productId: 8, inventoryLotId: 20 },
    { productId: 7, inventoryLotId: 11 }
];
const inventoryLotsByProduct = indexInventoryLotsByProduct(inventoryLots, (lot) => lot.productId);
assert.deepEqual(inventoryLotsByProduct.get(7), [inventoryLots[0], inventoryLots[2]]);
assert.deepEqual(inventoryLotsByProduct.get(8), [inventoryLots[1]]);

console.log("material-staging allocation index assertions passed");
