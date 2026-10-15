import assert from "node:assert/strict";
import { resolveHistoryWorkCenter, resolveWorkflowStationContext } from "./_workflow-station-context.ts";

const routes = [
    { jo_route_id: 12, sequence_order: 2, status: "Pending", work_center_id: 202 },
    { jo_route_id: 11, sequence_order: 1, status: "Completed", work_center_id: 101 },
    { jo_route_id: 13, sequence_order: 3, status: "Pending", work_center_id: 303 }
];

assert.deepEqual(resolveWorkflowStationContext(routes, 13), {
    joRouteId: 13,
    workCenterId: 303,
    invalidRouteSelection: false
});
assert.deepEqual(resolveWorkflowStationContext(routes), {
    joRouteId: 12,
    workCenterId: 202,
    invalidRouteSelection: false
});
assert.equal(resolveWorkflowStationContext(routes, 99).invalidRouteSelection, true);
assert.deepEqual(resolveWorkflowStationContext([{ jo_route_id: 15, status: "Pending", work_center_id: null }]), {
    joRouteId: 15,
    workCenterId: null,
    invalidRouteSelection: false
});

const currentRouteWorkCenters = new Map([[12, 202]]);
assert.deepEqual(resolveHistoryWorkCenter({ work_center_id: 303, jo_route_id: 12 }, currentRouteWorkCenters), {
    workCenterId: 303,
    workCenterIds: [303],
    workCenterName: null
});
assert.deepEqual(resolveHistoryWorkCenter({ remarks: 'Station Start Scanner: scanned Work Center "Frying" (ID: 404)', jo_route_id: 12 }, currentRouteWorkCenters), {
    workCenterId: 404,
    workCenterIds: [404],
    workCenterName: "Frying"
});
assert.deepEqual(resolveHistoryWorkCenter({ jo_route_id: 12 }, currentRouteWorkCenters), {
    workCenterId: 202,
    workCenterIds: [202],
    workCenterName: null
});
assert.deepEqual(resolveHistoryWorkCenter({}, currentRouteWorkCenters), {
    workCenterId: 202,
    workCenterIds: [202],
    workCenterName: null
});
assert.deepEqual(resolveHistoryWorkCenter({}, new Map([[12, 202], [13, 303], [14, 202]])), {
    workCenterId: null,
    workCenterIds: [202, 303],
    workCenterName: null
});
assert.deepEqual(resolveHistoryWorkCenter({}, new Map()), {
    workCenterId: null,
    workCenterIds: [],
    workCenterName: null
});

console.log("workflow station context assertions passed");
