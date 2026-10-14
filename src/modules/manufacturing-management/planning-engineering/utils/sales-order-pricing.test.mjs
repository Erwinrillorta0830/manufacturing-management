import assert from "node:assert/strict";
import test from "node:test";
import { resolveSalesOrderTargetSellingPrice } from "./sales-order-pricing.ts";

test("uses the selected Sales Order line price for a single-line release", () => {
    assert.equal(resolveSalesOrderTargetSellingPrice([
        { unitPrice: 125, remainingQuantity: 4 }
    ], [90]), 125);
});

test("weights multiple Sales Order prices by remaining demand", () => {
    assert.equal(resolveSalesOrderTargetSellingPrice([
        { unitPrice: 10, remainingQuantity: 3 },
        { unitPrice: 20, remainingQuantity: 1 }
    ]), 12.5);
});

test("falls back to the first usable catalog price when Sales Order pricing is incomplete", () => {
    assert.equal(resolveSalesOrderTargetSellingPrice([
        { unitPrice: 10, remainingQuantity: 3 },
        { unitPrice: null, remainingQuantity: 1 }
    ], [0, "invalid", 90]), 90);
});

test("returns zero when Sales Order and catalog prices are unavailable", () => {
    assert.equal(resolveSalesOrderTargetSellingPrice([
        { unitPrice: Number.NaN, remainingQuantity: 1 }
    ], [0, "invalid"]), 0);
});

test("ignores lines with no remaining demand when calculating the weighted price", () => {
    assert.equal(resolveSalesOrderTargetSellingPrice([
        { unitPrice: 10, remainingQuantity: 3 },
        { unitPrice: null, remainingQuantity: 0 }
    ]), 10);
});
