import assert from "node:assert/strict";
import {
    earnedStandardLaborHours,
    laborEfficiencyPercent,
    laborProductivity,
    laborVarianceHours,
    runningTimerHours
} from "./labor-efficiency";

assert.equal(earnedStandardLaborHours([
    { hoursRequired: 8, manpowerCount: 2 },
    { hoursRequired: 3, manpowerCount: 1 }
], 50, 100), 9.5);
assert.equal(earnedStandardLaborHours([{ hoursRequired: 8, manpowerCount: 2 }], 0, 100), null);
assert.equal(earnedStandardLaborHours([{ hoursRequired: null, manpowerCount: 2 }], 50, 100), null);
assert.equal(earnedStandardLaborHours([{ hoursRequired: 8, manpowerCount: 2 }], 50, 0), null);

assert.equal(laborVarianceHours(10, 12.5), 2.5);
assert.equal(laborVarianceHours(null, 12.5), null);
assert.equal(laborEfficiencyPercent(10, 12.5), 80);
assert.equal(laborEfficiencyPercent(10, 0), null);
assert.equal(laborProductivity(100, 20), 5);
assert.equal(laborProductivity(100, 0), null);
assert.equal(runningTimerHours("2026-09-23T00:00:00.000Z", Date.parse("2026-09-23T02:30:00.000Z")), 2.5);
assert.equal(runningTimerHours("not-a-date", Date.now()), null);
