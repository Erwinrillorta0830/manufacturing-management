import assert from "node:assert/strict";
import {
    linkedSalesOrderIdsFromJobOrderAllocations,
    salesOrderDetailIdsFromAllocations,
    salesOrderStatusAfterJobOrderInitialization
} from "./job-order-initialization.ts";

assert.equal(salesOrderStatusAfterJobOrderInitialization("For Production"), "In Production");
assert.equal(salesOrderStatusAfterJobOrderInitialization(" for production "), "In Production");
assert.equal(salesOrderStatusAfterJobOrderInitialization("In Production"), null);
assert.equal(salesOrderStatusAfterJobOrderInitialization("For Invoicing"), null);
assert.equal(salesOrderStatusAfterJobOrderInitialization("For Consolidation"), null);

assert.deepEqual(salesOrderDetailIdsFromAllocations([
    { sales_order_detail_id: 12 },
    { sales_order_detail_id: { detail_id: 13 } },
    { sales_order_detail_id: 12 },
    { sales_order_detail_id: null }
]), [12, 13]);

assert.deepEqual(linkedSalesOrderIdsFromJobOrderAllocations(
    [
        { sales_order_detail_id: 12 },
        { sales_order_detail_id: { detail_id: 13 } },
        { sales_order_detail_id: 12 },
        { sales_order_detail_id: null }
    ],
    [
        { detail_id: 12, order_id: 200 },
        { detail_id: 13, order_id: { order_id: 201 } },
        { detail_id: 14, order_id: 202 }
    ]
), [200, 201]);

console.log("Job Order initialization Sales Order synchronization checks passed.");
