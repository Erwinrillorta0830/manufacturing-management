import assert from "node:assert/strict";
import { allocateOutputProportionally, allocatedBatchCost, weightedNetUnitPrice } from "./profitability-calculations";

const allocatedAcrossBatches = allocateOutputProportionally([
    { key: "batch-a", goodQuantity: 100 },
    { key: "batch-b", goodQuantity: 300 }
], 200);
assert.deepEqual(allocatedAcrossBatches.map((batch) => batch.allocatedQuantity), [50, 150]);
assert.deepEqual(allocatedAcrossBatches.map((batch) => batch.unallocatedQuantity), [50, 150]);

const overAllocated = allocateOutputProportionally([{ key: "batch-a", goodQuantity: 12 }], 20);
assert.equal(overAllocated[0].allocatedQuantity, 12);
assert.equal(overAllocated[0].unallocatedQuantity, 0);

const weightedPrice = weightedNetUnitPrice([
    { allocatedQuantity: 100, netUnitPrice: 10 },
    { allocatedQuantity: 300, netUnitPrice: 20 }
]);
assert.equal(weightedPrice, 17.5);
assert.equal(weightedNetUnitPrice([]), null);
assert.equal(allocatedBatchCost(400, 200, 50), 100);
assert.equal(allocatedBatchCost(null, 200, 50), null);
