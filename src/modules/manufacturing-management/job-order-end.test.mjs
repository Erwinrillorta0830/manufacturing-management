import assert from "node:assert/strict";
import {
    salesOrderStatusAfterJobOrderEnd,
    shouldReturnSalesOrderToForProduction
} from "./job-order-end.ts";

assert.equal(shouldReturnSalesOrderToForProduction("cancel", false, 0), true);
assert.equal(shouldReturnSalesOrderToForProduction("cancel", true, 0), false);
assert.equal(shouldReturnSalesOrderToForProduction("terminate-production", false, 0), true);
assert.equal(shouldReturnSalesOrderToForProduction("terminate-production", false, 0.001), false);

assert.equal(salesOrderStatusAfterJobOrderEnd("In Production", true, false), "For Production");
assert.equal(salesOrderStatusAfterJobOrderEnd("In Production", true, true), "In Production");
assert.equal(salesOrderStatusAfterJobOrderEnd("For Invoicing", true, false), "For Invoicing");
assert.equal(salesOrderStatusAfterJobOrderEnd("For Production", false, false), "For Production");

console.log("Job Order end lifecycle checks passed.");
