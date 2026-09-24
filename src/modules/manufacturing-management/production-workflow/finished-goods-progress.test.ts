import assert from "node:assert/strict";
import { buildFinishedGoodsProgress } from "./finished-goods-progress";

const qaExample = buildFinishedGoodsProgress(6986.19, 1520, [
    { orderNo: "SO-1", allocatedQuantity: 1000 },
    { orderNo: "SO-2", allocatedQuantity: 1000 }
]);

assert.deepEqual(qaExample.salesOrders.map((line) => line.produced), [217.572096, 217.572096]);
assert.deepEqual(qaExample.bufferStock, [{
    orderNo: "Unallocated Buffer / Stock",
    targetQuantity: 4986.19,
    produced: 1084.855808,
    remaining: 3901.334192
}]);
assert.deepEqual(qaExample.totals, {
    targetQuantity: 6986.19,
    producedQuantity: 1520,
    remainingQuantity: 5466.19
});
assert.equal(
    qaExample.salesOrders.reduce((total, line) => total + line.produced, 0)
        + qaExample.bufferStock.reduce((total, line) => total + line.produced, 0),
    qaExample.totals.producedQuantity
);

const groupedOrder = buildFinishedGoodsProgress(100, 40, [
    { orderNo: "SO-1", allocatedQuantity: 25 },
    { orderNo: "SO-1", allocatedQuantity: 25 }
]);
assert.equal(groupedOrder.salesOrders.length, 1);
assert.equal(groupedOrder.salesOrders[0].targetQuantity, 50);
assert.equal(groupedOrder.salesOrders[0].produced, 20);
assert.equal(groupedOrder.bufferStock[0].produced, 20);

const bufferOnly = buildFinishedGoodsProgress(100, 40, []);
assert.equal(bufferOnly.salesOrders.length, 0);
assert.equal(bufferOnly.bufferStock[0].targetQuantity, 100);
assert.equal(bufferOnly.bufferStock[0].produced, 40);

const fullyAllocated = buildFinishedGoodsProgress(100, 110, [
    { orderNo: "SO-1", allocatedQuantity: 50 },
    { orderNo: "SO-2", allocatedQuantity: 50 }
]);
assert.equal(fullyAllocated.bufferStock.length, 0);
assert.deepEqual(fullyAllocated.salesOrders.map((line) => line.produced), [55, 55]);
assert.equal(fullyAllocated.totals.remainingQuantity, 0);

const overAllocated = buildFinishedGoodsProgress(100, 100, [
    { orderNo: "SO-1", allocatedQuantity: 80 },
    { orderNo: "SO-2", allocatedQuantity: 80 }
]);
assert.equal(overAllocated.bufferStock.length, 0);
assert.equal(overAllocated.salesOrders.reduce((total, line) => total + line.produced, 0), 100);

const empty = buildFinishedGoodsProgress(0, 0, []);
assert.equal(empty.salesOrders.length, 0);
assert.equal(empty.bufferStock.length, 0);
assert.deepEqual(empty.totals, { targetQuantity: 0, producedQuantity: 0, remainingQuantity: 0 });
