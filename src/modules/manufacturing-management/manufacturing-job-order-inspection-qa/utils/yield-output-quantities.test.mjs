import assert from "node:assert/strict";
import test from "node:test";
import { getYieldOutputTotals } from "./yield-output-quantities.ts";

test("folds legacy scrap into rejected output and total", () => {
    assert.deepEqual(getYieldOutputTotals(10, 2, 3), {
        rejectedQuantity: 5,
        totalQuantity: 15
    });
});

test("leaves current records unchanged when scrap is zero", () => {
    assert.deepEqual(getYieldOutputTotals(10, 2, 0), {
        rejectedQuantity: 2,
        totalQuantity: 12
    });
});

test("ignores invalid and negative quantities", () => {
    assert.deepEqual(getYieldOutputTotals(-1, Number.NaN, 3), {
        rejectedQuantity: 3,
        totalQuantity: 3
    });
});
