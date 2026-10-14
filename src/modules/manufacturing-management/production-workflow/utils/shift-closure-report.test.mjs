import assert from "node:assert/strict";
import {
    buildShiftClosureReportErrorHtml,
    buildShiftClosureReportHtml,
    buildShiftClosureReportLoadingHtml
} from "./shift-closure-report.ts";

const report = buildShiftClosureReportHtml({
    jobOrderNo: "JO-123",
    productName: "Finished <Good>",
    branch: "Main Branch",
    jobOrderStatus: "In Production",
    printedAt: "Oct 14, 2026 10:00 AM PHT",
    documentNo: "SC-JO-123",
    revision: "1.0",
    sessionKey: "session-123",
    productionDay: "1",
    shiftName: "Shift 1 - Day",
    productionDate: "10/14/2026",
    targetQuantity: 100,
    outputUnit: "pcs",
    goodQuantity: 90,
    rejectedQuantity: 10,
    rejectionReason: "DEFECT - Seal",
    rejectionRemarks: "Seal was open",
    sessionRemarks: "Operator shift notes",
    varianceReason: "Material variance notes",
    outputBatchStatus: "Batch-123 (Pending QA)",
    currentEvidenceFiles: ["shift.jpg (image/jpeg)"],
    routes: [{
        sequence: 1,
        operation: "Pack",
        status: "Completed",
        qaStatus: "Passed",
        workCenterId: "WC-5",
        workCenterName: "Packing Line",
        machineId: "ASSET-9",
        machineName: "Packing Machine",
        machineDetails: "S/N 12345",
        plannedSetupHours: 0.5,
        plannedRunHours: 1,
        actualSetupHours: 0.25,
        actualRunHours: 0.75
    }],
    operators: [{
        name: "Alex Operator",
        role: "Operator",
        route: "Step 1 - Pack",
        workstation: "Packing Line",
        timeIn: "10:00 AM PHT",
        timeOut: "10:03 AM PHT",
        durationHours: 0.05,
        isActive: false
    }],
    materials: [{
        productName: "Film Roll",
        unit: "kg",
        mmLot: "MM-LOT-2",
        inventoryLot: "INV-LOT-3",
        batchNo: "BATCH-4",
        standardQuantity: 2,
        actualQuantity: 2.5
    }],
    breakdowns: [{
        timestamp: "Oct 14, 2026 09:30 AM PHT",
        step: "Step 1 - Pack",
        workstation: "Packing Line",
        machineId: "ASSET-9",
        reportedYield: 45,
        reason: "Machine jam",
        reportedBy: "Shift Supervisor",
        evidenceFiles: ["breakdown.jpg"]
    }],
    workstationMetadataUnavailable: false
});

for (const label of [
    "VERTEX TECH CORP",
    "Document No.:",
    "Route Execution &amp; Workstation Assignment",
    "Operator Timer Records &amp; Sign-Off",
    "Exact WIP Reservation Consumption",
    "Rejected Output Details",
    "Workstation Breakdown Log",
    "UOM",
    "MM-LOT-2",
    "INV-LOT-3",
    "BATCH-4",
    "breakdown.jpg",
    "Production Supervisor"
]) {
    assert.ok(report.includes(label), `report should include ${label}`);
}

assert.ok(report.includes("00:03:00"), "operator duration should use HH:MM:SS");
assert.ok(report.includes("Finished &lt;Good&gt;"), "dynamic text should be HTML escaped");
assert.ok(!report.includes("Finished <Good>"), "raw dynamic HTML should not be emitted");
assert.ok(report.includes("Shift Closure Report Preview"));
assert.ok(report.includes("onclick=\"window.print()\""), "preview should provide a manual print action");

const loading = buildShiftClosureReportLoadingHtml("JO-123");
assert.ok(loading.includes("Preparing Shift Closure Report"));
assert.ok(!loading.includes("window.print()"), "loading state must not trigger printing");

const error = buildShiftClosureReportErrorHtml("JO-123", "History <unavailable>");
assert.ok(error.includes("History &lt;unavailable&gt;"));
assert.ok(!error.includes("History <unavailable>"));

console.log("shift-closure-report assertions passed");
