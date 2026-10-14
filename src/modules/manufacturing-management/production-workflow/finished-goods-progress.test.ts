import assert from "node:assert/strict";
import { buildFinishedGoodsProgress } from "./finished-goods-progress";

const qaExample = buildFinishedGoodsProgress(6986.19, 1520, 0, [
    { orderNo: "SO-1", allocatedQuantity: 1000 },
    { orderNo: "SO-2", allocatedQuantity: 1000 }
]);

assert.deepEqual(qaExample.salesOrders.map((line) => line.totalProduced), [217.572096, 217.572096]);
assert.deepEqual(qaExample.bufferStock, [{
    orderNo: "Unallocated Buffer / Stock",
    targetQuantity: 4986.19,
    good: 1084.855808,
    nad: 0,
    totalProduced: 1084.855808,
    remaining: 3901.334192
}]);
assert.deepEqual(qaExample.totals, {
    targetQuantity: 6986.19,
    goodQuantity: 1520,
    nadQuantity: 0,
    totalProducedQuantity: 1520,
    remainingQuantity: 5466.19,
    overrunQuantity: 0
});
assert.equal(
    qaExample.salesOrders.reduce((total, line) => total + line.totalProduced, 0)
        + qaExample.bufferStock.reduce((total, line) => total + line.totalProduced, 0),
    qaExample.totals.totalProducedQuantity
);

const groupedOrder = buildFinishedGoodsProgress(100, 40, 0, [
    { orderNo: "SO-1", allocatedQuantity: 25 },
    { orderNo: "SO-1", allocatedQuantity: 25 }
]);
assert.equal(groupedOrder.salesOrders.length, 1);
assert.equal(groupedOrder.salesOrders[0].targetQuantity, 50);
assert.equal(groupedOrder.salesOrders[0].good, 20);
assert.equal(groupedOrder.salesOrders[0].remaining, 30);
assert.equal(groupedOrder.bufferStock[0].totalProduced, 20);

const bufferOnly = buildFinishedGoodsProgress(100, 40, 0, []);
assert.equal(bufferOnly.salesOrders.length, 0);
assert.equal(bufferOnly.bufferStock[0].targetQuantity, 100);
assert.equal(bufferOnly.bufferStock[0].totalProduced, 40);

const goodAndNad = buildFinishedGoodsProgress(100, 40, 10, [
    { orderNo: "SO-1", allocatedQuantity: 60 },
    { orderNo: "SO-2", allocatedQuantity: 40 }
]);
assert.deepEqual(goodAndNad.salesOrders.map((line) => [line.good, line.nad, line.totalProduced, line.remaining]), [
    [24, 6, 30, 36],
    [16, 4, 20, 24]
]);
assert.deepEqual(goodAndNad.totals, {
    targetQuantity: 100,
    goodQuantity: 40,
    nadQuantity: 10,
    totalProducedQuantity: 50,
    remainingQuantity: 60,
    overrunQuantity: 0
});

const fullyAllocated = buildFinishedGoodsProgress(100, 105, 0, [
    { orderNo: "SO-1", allocatedQuantity: 50 },
    { orderNo: "SO-2", allocatedQuantity: 50 }
]);
assert.equal(fullyAllocated.bufferStock.length, 0);
assert.deepEqual(fullyAllocated.salesOrders.map((line) => line.good), [50, 50]);
assert.equal(fullyAllocated.totals.remainingQuantity, 0);
assert.equal(fullyAllocated.totals.goodQuantity, 105);
assert.equal(fullyAllocated.totals.overrunQuantity, 5);
assert.equal(fullyAllocated.salesOrders.reduce((total, line) => total + line.totalProduced, 0), 100);
assert.equal(
    fullyAllocated.salesOrders.reduce((total, line) => total + line.totalProduced, 0)
        + fullyAllocated.totals.overrunQuantity,
    fullyAllocated.totals.totalProducedQuantity
);

const overAllocated = buildFinishedGoodsProgress(100, 100, 0, [
    { orderNo: "SO-1", allocatedQuantity: 80 },
    { orderNo: "SO-2", allocatedQuantity: 80 }
]);
assert.equal(overAllocated.bufferStock.length, 0);
assert.equal(overAllocated.salesOrders.reduce((total, line) => total + line.totalProduced, 0), 100);

const empty = buildFinishedGoodsProgress(0, 0, 0, []);
assert.equal(empty.salesOrders.length, 0);
assert.equal(empty.bufferStock.length, 0);
assert.deepEqual(empty.totals, {
    targetQuantity: 0,
    goodQuantity: 0,
    nadQuantity: 0,
    totalProducedQuantity: 0,
    remainingQuantity: 0,
    overrunQuantity: 0
});
