import assert from "node:assert/strict";
import {
    buildStagingMovementIndexes,
    getAllocationsForMaterialGroup,
    groupMaterialsByJobOrder,
    indexAllocationsByMaterial,
    stagingMovementExactKey,
    stagingMovementLotBatchKey
} from "./_assembly-indexes.ts";
import { canonicalTypeName, normalizeBatchNo } from "./_stock.ts";

const materials = [
    { id: 101, job_order_id: 1 },
    { id: 102, job_order_id: 1 },
    { id: 201, job_order_id: 2 }
];
const materialsByJobOrder = groupMaterialsByJobOrder(materials, (material) => material.job_order_id);
assert.deepEqual(materialsByJobOrder.get(1), materials.slice(0, 2));
assert.deepEqual(materialsByJobOrder.get(2), [materials[2]]);

const allocationA = { jo_material_id: 101, product_id: 8, allocation_id: "a" };
const allocationFallback = { jo_material_id: 0, product_id: 8, allocation_id: "fallback" };
const allocationB = { jo_material_id: 102, product_id: 8, allocation_id: "b" };
const allocationsByJobOrder = new Map([
    [1, [allocationA, allocationFallback, allocationB, { jo_material_id: 103, product_id: 9, allocation_id: "other-product" }]],
    [2, [{ jo_material_id: 0, product_id: 8, allocation_id: "other-job-order" }]]
]);
const allocationIndexes = indexAllocationsByMaterial(
    allocationsByJobOrder,
    (allocation) => allocation.jo_material_id,
    (allocation) => allocation.product_id
);
assert.deepEqual(
    getAllocationsForMaterialGroup(allocationIndexes, 1, [101, 102, 101], 8),
    [allocationA, allocationFallback, allocationB]
);

const stagingIdentity = {
    jobOrderId: 12,
    branchId: 2,
    productId: 7,
    lotId: 3,
    inventoryLotId: 10,
    normalizedBatchNo: normalizeBatchNo("Batch A")
};
const movements = [
    {
        source_document_id: 12,
        branch_id: 2,
        product_id: 7,
        mm_lot_id: 3,
        inventory_lot_id: 10,
        batch_no: "Batch A",
        transaction_type_id: 4,
        quantity: -5,
        remarks: "[MM-MATERIAL-STAGING];target_bin=FLOOR-STAGING-2;work_center_id=2"
    },
    {
        source_document_id: 12,
        branch_id: 2,
        product_id: 7,
        mm_lot_id: 3,
        inventory_lot_id: 10,
        batch_no: " batch a ",
        transaction_type: "MATERIAL_STAGING_ISSUE",
        quantity: -2,
        remarks: "[MM-MATERIAL-STAGING];target_bin=FLOOR-STAGING-2;[NEGATIVE OVERRIDE]"
    },
    {
        source_document_id: 12,
        branch_id: 2,
        product_id: 7,
        mm_lot_id: 3,
        inventory_lot_id: 10,
        batch_no: "BATCH A",
        transaction_type_id: 4,
        quantity: 1,
        remarks: "[MM-MATERIAL-STAGING-RETURN]"
    },
    {
        source_document_id: 12,
        branch_id: 2,
        product_id: 7,
        mm_lot_id: 3,
        inventory_lot_id: 11,
        batch_no: "batch a",
        transaction_type_id: 4,
        quantity: -4,
        remarks: "[MM-MATERIAL-STAGING];target_bin=FLOOR-STAGING-11"
    }
];
const stagingIndexes = buildStagingMovementIndexes(movements, normalizeBatchNo, canonicalTypeName);
assert.deepEqual(stagingIndexes.byExactIdentity.get(stagingMovementExactKey(stagingIdentity)), {
    quantity: 6,
    lotId: 3,
    inventoryLotId: 10,
    stagingBin: "FLOOR-STAGING-2",
    negativeOverride: true
});
assert.equal(
    stagingIndexes.byExactIdentity.get(stagingMovementExactKey({ ...stagingIdentity, inventoryLotId: 11 }))?.quantity,
    4
);
assert.equal(
    stagingIndexes.firstByLotBatch.get(stagingMovementLotBatchKey(stagingIdentity))?.inventoryLotId,
    10
);
assert.equal(
    stagingIndexes.firstByLotBatch.get(stagingMovementLotBatchKey(stagingIdentity))?.quantity,
    6
);

console.log("material-staging assembly index assertions passed");
