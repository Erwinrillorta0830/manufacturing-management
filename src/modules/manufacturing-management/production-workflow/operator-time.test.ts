import assert from "node:assert/strict";
import {
    accumulateHoursFromSeconds,
    elapsedSecondsBetween,
    elapsedSecondsSince,
    formatElapsedDuration,
    hasCompletedTimer,
    hoursFromSeconds
} from "./operator-time";

assert.equal(hasCompletedTimer(null, null), false);
assert.equal(hasCompletedTimer("2026-09-24 09:00:00", null), false);
assert.equal(hasCompletedTimer(null, "2026-09-24 10:00:00"), false);
assert.equal(hasCompletedTimer("2026-09-24 09:00:00", "2026-09-24 10:00:00"), true);
assert.equal(hasCompletedTimer("2026-09-24 09:00:00", "2026-09-24 09:00:00"), true);
assert.equal(hasCompletedTimer("2026-09-24 10:00:00", "2026-09-24 09:00:00"), false);
assert.equal(hasCompletedTimer("not-a-timestamp", "2026-09-24 10:00:00"), false);

assert.equal(elapsedSecondsBetween("2026-09-24 09:00:00", "2026-09-24 09:00:01"), 1);
assert.equal(elapsedSecondsBetween("2026-09-24 09:00:00", "2026-09-24 09:00:00"), 0);
assert.equal(elapsedSecondsBetween("2026-09-24 09:00:02", "2026-09-24 09:00:01"), null);
assert.equal(elapsedSecondsBetween("2026-09-24T01:00:00.000Z", "2026-09-24T02:00:00.000Z"), 3600);
assert.equal(elapsedSecondsSince("2026-09-24 09:00:00", Date.parse("2026-09-24T10:00:01.000+08:00")), 3601);
assert.equal(elapsedSecondsSince("2026-09-24 09:00:00", Date.parse("2026-09-25T10:00:00.000+08:00")), 90000);
assert.equal(hoursFromSeconds(1), 1 / 3600);
assert.equal(Math.round(accumulateHoursFromSeconds(0.5, 1) * 3600), 1801);
assert.ok(accumulateHoursFromSeconds(0, 1) > 0 && accumulateHoursFromSeconds(0, 1) < 0.01);
assert.equal(formatElapsedDuration(0), "00:00:00");
assert.equal(formatElapsedDuration(360001), "100:00:01");
