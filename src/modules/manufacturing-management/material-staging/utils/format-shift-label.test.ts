import assert from "node:assert/strict";
import { formatShiftLabel } from "./format-shift-label";

assert.equal(formatShiftLabel("10"), "10 hrs");
assert.equal(formatShiftLabel("6.5"), "6.5 hrs");
assert.equal(formatShiftLabel(10), "10 hrs");
assert.equal(formatShiftLabel("Shift 1 (Day)"), "Shift 1 (Day)");
assert.equal(formatShiftLabel("Shift 1"), "Shift 1");
assert.equal(formatShiftLabel(null), "Shift 1");
assert.equal(formatShiftLabel(""), "Shift 1");
assert.equal(formatShiftLabel(undefined, "Shift 1 (Day)"), "Shift 1 (Day)");

console.log("format-shift-label assertions passed");
