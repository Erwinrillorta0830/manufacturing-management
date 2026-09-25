import assert from "node:assert/strict";
import { buildStagingSlipMeta, buildStagingSlipRows } from "./generateStagingSlipPdf";
import { MaterialStagingItem, StagingJobOrder } from "../types";

function makeMaterial(
    overrides: Partial<MaterialStagingItem> = {}
): MaterialStagingItem {
    return {
        jo_material_id: 1,
        job_order_id: 10,
        product_id: 100,
        product_name: "Raw Sugar",
        product_code: "RAW-001",
        uom: "kg",
        required_quantity: 500,
        allocated_quantity: 500,
        staged_quantity: 0,
        on_hand_quantity: 900,
        shortage_quantity: 0,
        reservation_status: "SOFT",
        staging_bin: "MAIN-STORE",
        is_staged: false,
        has_shortage: false,
        allocations: [],
        ...overrides
    };
}

// SOFT-only reservations (never picked) must not print lot numbers.
const unstagedRows = buildStagingSlipRows([
    makeMaterial({
        allocations: [
            {
                lot_id: 1,
                lot_name: "LOT-A",
                batch_no: "B-001",
                allocated_quantity: 300,
                staged_quantity: 0,
                reservation_status: "SOFT",
                staging_bin: "MAIN-STORE",
                source_bin: "MAIN-STORE",
                on_hand_lot_quantity: 300
            },
            {
                lot_id: 2,
                lot_name: "LOT-B",
                batch_no: "B-002",
                allocated_quantity: 200,
                staged_quantity: 0,
                reservation_status: "SOFT",
                staging_bin: "MAIN-STORE",
                source_bin: "MAIN-STORE",
                on_hand_lot_quantity: 200
            }
        ]
    })
]);
assert.equal(unstagedRows.length, 1);
assert.equal(unstagedRows[0][6], "—");

// Partial staging: only the picked lot prints.
const partialRows = buildStagingSlipRows([
    makeMaterial({
        staged_quantity: 300,
        reservation_status: "PARTIAL",
        allocations: [
            {
                lot_id: 1,
                lot_name: "LOT-A",
                batch_no: "B-001",
                allocated_quantity: 300,
                staged_quantity: 300,
                reservation_status: "HARD",
                staging_bin: "FLOOR-STAGING-1",
                source_bin: "MAIN-STORE",
                on_hand_lot_quantity: 300
            },
            {
                lot_id: 2,
                lot_name: "LOT-B",
                batch_no: "B-002",
                allocated_quantity: 200,
                staged_quantity: 0,
                reservation_status: "SOFT",
                staging_bin: "MAIN-STORE",
                source_bin: "MAIN-STORE",
                on_hand_lot_quantity: 200
            }
        ]
    })
]);
assert.equal(partialRows[0][6], "LOT-A (B-001)");
assert.equal(partialRows[0][2], "300 kg");

// Fully staged: every picked lot prints (no regression vs old output).
const stagedRows = buildStagingSlipRows([
    makeMaterial({
        staged_quantity: 500,
        reservation_status: "HARD",
        staging_bin: "FLOOR-STAGING-1",
        allocations: [
            {
                lot_id: 1,
                lot_name: "LOT-A",
                batch_no: "B-001",
                allocated_quantity: 300,
                staged_quantity: 300,
                reservation_status: "HARD",
                staging_bin: "FLOOR-STAGING-1",
                source_bin: "MAIN-STORE",
                on_hand_lot_quantity: 300
            },
            {
                lot_id: 2,
                lot_name: "LOT-B",
                batch_no: "B-002",
                allocated_quantity: 200,
                staged_quantity: 200,
                reservation_status: "HARD",
                staging_bin: "FLOOR-STAGING-1",
                source_bin: "MAIN-STORE",
                on_hand_lot_quantity: 200
            }
        ]
    })
]);
assert.equal(stagedRows[0][6], "LOT-A (B-001), LOT-B (B-002)");

// Allocations with no lot/batch text still collapse to "—".
const blankLabelRows = buildStagingSlipRows([
    makeMaterial({
        allocations: [
            {
                lot_id: 3,
                lot_name: null,
                batch_no: "",
                allocated_quantity: 500,
                staged_quantity: 500,
                reservation_status: "HARD",
                staging_bin: "FLOOR-STAGING-1",
                source_bin: "MAIN-STORE",
                on_hand_lot_quantity: 500
            }
        ]
    })
]);
assert.equal(blankLabelRows[0][6], "—");

function makeJobOrder(overrides: Partial<StagingJobOrder> = {}): StagingJobOrder {
    return {
        job_order_id: 10,
        job_order_no: "JO-000123",
        parent_job_order_id: null,
        product_id: 200,
        product_name: "Sample FG",
        product_code: "FG-SAMPLE-001",
        version_id: 7,
        version_name: "FG-SAMPLE-001 Rev 3",
        target_quantity: 12001,
        completed_quantity: 0,
        rejected_quantity: 0,
        status: "For Picking",
        primary_work_center_id: 112,
        primary_work_center_name: "Dough & Batch Mixing Center",
        staging_work_center_id: 112,
        suggested_staging_bin: "FLOOR-STAGING-112",
        shift_option: "10",
        branch_id: 1,
        branch_name: "Main Facility",
        materials: [],
        total_materials_count: 2,
        staged_materials_count: 1,
        staging_percentage: 50,
        reservation_status: "PARTIAL",
        has_shortage: false,
        all_staged: false,
        ...overrides
    };
}

// Header meta: real version code, destination-labeled bin, unambiguous shift.
const meta = buildStagingSlipMeta(makeJobOrder());
const metaCells = meta.flat();
const metaValue = (label: string) =>
    metaCells.find((cell) => cell.label === label)?.value;
assert.equal(metaValue("Recipe Version"), "FG-SAMPLE-001 Rev 3");
assert.equal(metaValue("Target Bin (Destination)"), "FLOOR-STAGING-112");
assert.equal(metaValue("Shift Hours"), "10 hrs");
assert.equal(metaCells.find((cell) => cell.label === "Work Center"), undefined);

// Missing version still falls back to "Default" (last resort only).
const metaNoVersion = buildStagingSlipMeta(
    makeJobOrder({ version_id: null, version_name: null })
);
const metaNoVersionCells = metaNoVersion.flat();
assert.equal(
    metaNoVersionCells.find((cell) => cell.label === "Recipe Version")?.value,
    "Default"
);

console.log("generateStagingSlipPdf tests passed");
