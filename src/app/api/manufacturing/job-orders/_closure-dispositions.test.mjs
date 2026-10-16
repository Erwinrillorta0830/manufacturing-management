import assert from "node:assert/strict";
import {
    classifyClosureDispositions,
    commitClosureWithDispositionResolution
} from "./_closure-dispositions.ts";

const routeLinkedPending = { id: "DISP-1", task_id: 12, disposition_status: "Pending" };
const alreadyResolved = { id: "DISP-2", task_id: 12, disposition_status: "Resolved" };
const unmatchedPending = { id: "DISP-3", task_id: 99, disposition_status: "Pending" };
const unlinkedPending = { id: "DISP-4", task_id: null, disposition_status: "Pending" };
const unknownStatus = { id: "DISP-5", task_id: 12, disposition_status: "Escalated" };

assert.deepEqual(
    classifyClosureDispositions(
        [routeLinkedPending, alreadyResolved, unmatchedPending, unlinkedPending, unknownStatus],
        [12],
        true
    ),
    {
        autoResolvable: [routeLinkedPending],
        unresolved: [
            { disposition: unmatchedPending, reason: "route-not-linked" },
            { disposition: unlinkedPending, reason: "route-not-linked" },
            { disposition: unknownStatus, reason: "status-unrecognized" }
        ]
    }
);

assert.deepEqual(
    classifyClosureDispositions([routeLinkedPending], [12], false),
    {
        autoResolvable: [],
        unresolved: [{ disposition: routeLinkedPending, reason: "yield-audits-incomplete" }]
    }
);

assert.deepEqual(
    classifyClosureDispositions([{ id: "DISP-6", task_id: { id: 12 }, disposition_status: " pending " }], [12], true)
        .autoResolvable.map((row) => row.id),
    ["DISP-6"]
);

const closeFailure = new Error("status history write failed");
const restoredDispositions = [];
await assert.rejects(
    commitClosureWithDispositionResolution(
        [routeLinkedPending],
        async (candidates) => candidates,
        async () => { throw closeFailure; },
        async (resolved) => {
            restoredDispositions.push(...resolved);
            return [];
        },
        (failedIds) => new Error(`Rollback failed: ${failedIds.join(", ")}`)
    ),
    (error) => error === closeFailure
);
assert.deepEqual(restoredDispositions, [routeLinkedPending]);

console.log("Job Order closure disposition assertions passed");
