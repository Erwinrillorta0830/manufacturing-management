import assert from "node:assert/strict";
import test from "node:test";
import { expiryDateFromShelfLife } from "./shelf-life-date.ts";

test("adds the finished-goods shelf life in days", () => {
    assert.equal(expiryDateFromShelfLife("2026-09-07", 365), "2027-09-07");
});

test("uses date-only arithmetic across leap years", () => {
    assert.equal(expiryDateFromShelfLife("2024-02-29", 365), "2025-02-28");
});

test("returns null for invalid dates or shelf-life values", () => {
    assert.equal(expiryDateFromShelfLife("2026-02-30", 365), null);
    assert.equal(expiryDateFromShelfLife("2026-09-07", 0), null);
    assert.equal(expiryDateFromShelfLife("2026-09-07", 1.5), null);
    assert.equal(expiryDateFromShelfLife("", 365), null);
});
