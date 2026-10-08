import assert from "node:assert/strict";
import { buildShiftYieldRunLabels } from "./shift-yield-run-labels";

const first = {
    ledger_id: 10,
    job_order_id: 1,
    shift_name: "Day 1 - Shift 1 - Day",
    logged_at: "2026-10-07 08:00:00"
};
const second = {
    ledger_id: 11,
    job_order_id: 1,
    shift_name: "Day 1 - Shift 1 - Day",
    logged_at: "2026-10-07 09:00:00"
};
const otherJobOrder = {
    ledger_id: 12,
    job_order_id: 2,
    shift_name: "Day 1 - Shift 1 - Day",
    logged_at: "2026-10-07 09:30:00"
};
const otherShift = {
    ledger_id: 13,
    job_order_id: 1,
    shift_name: "Day 1 - Shift 2 - Day",
    logged_at: "2026-10-07 10:00:00"
};
const otherDay = {
    ledger_id: 14,
    job_order_id: 1,
    shift_name: "Day 2 - Shift 1 - Day",
    logged_at: "2026-10-08 08:00:00"
};

const labels = buildShiftYieldRunLabels([second, otherJobOrder, first, otherShift, otherDay]);
assert.equal(labels.get(first), "Day 1 • Shift 1 (Run 1)");
assert.equal(labels.get(second), "Day 1 • Shift 1 (Run 2)");
assert.equal(labels.get(otherJobOrder), "Day 1 • Shift 1 (Run 1)");
assert.equal(labels.get(otherShift), "Day 1 • Shift 2 (Run 1)");
assert.equal(labels.get(otherDay), "Day 2 • Shift 1 (Run 1)");

const tiedByTimestamp = [
    { ledger_id: 21, job_order_id: 3, shift_name: "Day 1 - Shift 1 - Day", logged_at: "2026-10-07 08:00:00" },
    { ledger_id: 20, job_order_id: 3, shift_name: "Day 1 - Shift 1 - Day", logged_at: "2026-10-07 08:00:00" }
];
const tiedLabels = buildShiftYieldRunLabels(tiedByTimestamp);
assert.equal(tiedLabels.get(tiedByTimestamp[1]), "Day 1 • Shift 1 (Run 1)");
assert.equal(tiedLabels.get(tiedByTimestamp[0]), "Day 1 • Shift 1 (Run 2)");

const nightShift = {
    ledger_id: 30,
    job_order_id: 4,
    shift_name: "Day 1 - Shift 1 - Night",
    logged_at: "2026-10-07 20:00:00"
};
const legacyShift = { ledger_id: 31, job_order_id: 4, shift_name: "Overnight", logged_at: "2026-10-07 21:00:00" };
const unspecifiedShift = { ledger_id: 32, job_order_id: 4, shift_name: null, logged_at: "2026-10-07 22:00:00" };
const fallbackLabels = buildShiftYieldRunLabels([nightShift, legacyShift, unspecifiedShift]);
assert.equal(fallbackLabels.get(nightShift), "Day 1 • Shift 1 - Night (Run 1)");
assert.equal(fallbackLabels.get(legacyShift), "Overnight");
assert.equal(fallbackLabels.get(unspecifiedShift), "Shift not specified");

console.log("shift-yield-run-labels assertions passed");
