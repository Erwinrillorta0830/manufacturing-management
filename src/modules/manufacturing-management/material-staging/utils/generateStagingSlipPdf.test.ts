import assert from "node:assert/strict";
import { buildStagingSlipRows } from "./generateStagingSlipPdf";
import { MaterialStagingItem } from "../types";

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

console.log("generateStagingSlipPdf tests passed");
