import assert from "node:assert/strict";
import { hasCompletedTimer } from "./operator-time";

assert.equal(hasCompletedTimer(null, null), false);
assert.equal(hasCompletedTimer("2026-09-24 09:00:00", null), false);
assert.equal(hasCompletedTimer(null, "2026-09-24 10:00:00"), false);
assert.equal(hasCompletedTimer("2026-09-24 09:00:00", "2026-09-24 10:00:00"), true);
assert.equal(hasCompletedTimer("2026-09-24 09:00:00", "2026-09-24 09:00:00"), true);
assert.equal(hasCompletedTimer("2026-09-24 10:00:00", "2026-09-24 09:00:00"), false);
assert.equal(hasCompletedTimer("not-a-timestamp", "2026-09-24 10:00:00"), false);
