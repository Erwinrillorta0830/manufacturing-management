import assert from "node:assert/strict";
import test from "node:test";
import {
    isRunningRouteOperatorTimer,
    latestRunningRouteOperatorTimer
} from "./operator-time.ts";

test("recognizes a running timer even when the roster row is inactive", () => {
    assert.equal(isRunningRouteOperatorTimer({
        jo_route_operator_id: 12,
        started_at: "2026-09-24 09:00:00",
        stopped_at: null,
        is_active: false
    }), true);
});

test("selects the newest running timer and ignores stopped or unstarted rows", () => {
    const olderRunningTimer = {
        jo_route_operator_id: 11,
        started_at: "2026-09-24 08:00:00",
        stopped_at: ""
    };
    const stoppedTimer = {
        jo_route_operator_id: 13,
        started_at: "2026-09-24 09:30:00",
        stopped_at: "2026-09-24 10:00:00"
    };
    const latestRunningTimer = {
        jo_route_operator_id: 12,
        started_at: "2026-09-24 09:00:00",
        stopped_at: null
    };

    assert.equal(
        latestRunningRouteOperatorTimer([olderRunningTimer, stoppedTimer, latestRunningTimer]),
        latestRunningTimer
    );
    assert.equal(latestRunningRouteOperatorTimer([stoppedTimer]), null);
});
