import assert from "node:assert/strict";
import { canMutateOperatorActionOnRoute, isTerminalRouteStatus } from "./route-status.ts";

for (const status of ["Completed", " done ", "CLOSED"]) {
    assert.equal(isTerminalRouteStatus(status), true);
    assert.equal(canMutateOperatorActionOnRoute(status, "edit-times"), true);
    assert.equal(canMutateOperatorActionOnRoute(status, "stop-timer"), true);
    for (const action of ["assign-operator", "start-timer", "log-hours", "remove-operator", "swap-operator", "edit-hours"]) {
        assert.equal(canMutateOperatorActionOnRoute(status, action), false);
    }
}

for (const status of ["Pending", "In Progress", "Ongoing"]) {
    assert.equal(isTerminalRouteStatus(status), false);
    assert.equal(canMutateOperatorActionOnRoute(status, "assign-operator"), true);
    assert.equal(canMutateOperatorActionOnRoute(status, "edit-times"), true);
}
