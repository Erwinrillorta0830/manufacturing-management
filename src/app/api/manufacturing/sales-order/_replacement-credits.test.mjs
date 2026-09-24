import assert from "node:assert/strict";
import {
    acceptedReceiptedOutputByJobOrder,
    attributeReplacementCredits,
    capReplacementCreditsToRemainingDemand,
    effectiveReplacementCreditQuantity,
    loadReplacementCreditData,
    remainingSalesOrderDemand
} from "./_replacement-credits.ts";

const acceptedOutput = acceptedReceiptedOutputByJobOrder([
    { job_order_id: 10, mm_lot_id: 100, inspected_quantity: 50, defect_quantity: 5, overall_disposition: "Approved" },
    { job_order_id: 10, mm_lot_id: 101, inspected_quantity: 20, defect_quantity: 0, overall_disposition: "Approved" },
    { job_order_id: 11, mm_lot_id: 110, inspected_quantity: 80, defect_quantity: 0, overall_disposition: "Quarantined" }
], [
    { source_document_id: 10, mm_lot_id: 100, transaction_type_id: 2, quantity: 30 },
    { source_document_id: 10, mm_lot_id: 100, transaction_type_id: 2, quantity: 40 },
    { source_document_id: 10, mm_lot_id: 101, transaction_type_id: 2, quantity: 15 },
    { source_document_id: 11, mm_lot_id: 110, transaction_type_id: 2, quantity: 80 },
    { source_document_id: 10, mm_lot_id: 999, transaction_type_id: 2, quantity: 100 },
    { source_document_id: 10, mm_lot_id: 100, transaction_type_id: 1, quantity: 100 }
]);
assert.deepEqual([...acceptedOutput.entries()], [[10, 60]]);

const attributions = attributeReplacementCredits([
    { id: 2, job_order_id: 10, sales_order_detail_id: 200, allocated_quantity: 30, created_at: "2026-01-02T00:00:00Z" },
    { id: 1, job_order_id: 10, sales_order_detail_id: 100, allocated_quantity: 20, created_at: "2026-01-01T00:00:00Z" },
    { id: 3, job_order_id: 10, sales_order_detail_id: 300, allocated_quantity: 20, created_at: "2026-01-03T00:00:00Z" },
    { id: 4, job_order_id: 11, sales_order_detail_id: 200, allocated_quantity: 25, created_at: "2026-01-04T00:00:00Z" }
], [
    { job_order_id: 10, job_order_no: "JO-10", status: "Cancelled", isTerminated: true },
    { job_order_id: 11, job_order_no: "JO-11", status: "Cancelled", isTerminated: true }
], new Map([[10, 60], [11, 10]]));

assert.deepEqual(attributions.map(({ predecessorJobOrderId, detailId, creditedQuantity }) => ({
    predecessorJobOrderId,
    detailId,
    creditedQuantity
})), [
    { predecessorJobOrderId: 10, detailId: 100, creditedQuantity: 20 },
    { predecessorJobOrderId: 10, detailId: 200, creditedQuantity: 30 },
    { predecessorJobOrderId: 10, detailId: 300, creditedQuantity: 10 },
    { predecessorJobOrderId: 11, detailId: 200, creditedQuantity: 10 }
]);

assert.deepEqual(
    capReplacementCreditsToRemainingDemand(attributions, 200, 25).map((item) => item.creditedQuantity),
    [25]
);
assert.equal(capReplacementCreditsToRemainingDemand(attributions, 200, 0).length, 0);
assert.equal(effectiveReplacementCreditQuantity(100, 30, 40, 10, 70), 50);
assert.equal(remainingSalesOrderDemand(100, 30, 40, 10, 70), 0);
// Sales-order allocation and service quantities overlap, so the baseline uses
// their maximum; replacement credit is applied once and cannot go negative.
assert.equal(remainingSalesOrderDemand(100, 40, 40, 0, 20), 40);

const zeroOutputReferences = attributeReplacementCredits([
    { id: 5, job_order_id: 12, sales_order_detail_id: 400, allocated_quantity: 15 }
], [
    { job_order_id: 12, job_order_no: "JO-12", status: "Cancelled", isTerminated: true }
], new Map());
assert.equal(zeroOutputReferences.length, 1);
assert.equal(zeroOutputReferences[0].creditedQuantity, 0);

const readCalls = [];
const loadedReplacementCredits = await loadReplacementCreditData(async (collection) => {
    readCalls.push(collection);
    const rowsByCollection = {
        manufacturing_job_order_allocations: [
            { id: 20, job_order_id: 20, sales_order_detail_id: 200, allocated_quantity: 12 }
        ],
        manufacturing_job_orders: [
            { job_order_id: 20, job_order_no: "JO-20", status: "Cancelled" }
        ],
        manufacturing_job_order_status_history: [
            { job_order_id: 20, workflow_action: "terminate-production", new_status: "Cancelled" }
        ],
        manufacturing_final_qa_releases: [
            { job_order_id: 20, mm_lot_id: 2000, inspected_quantity: 12, defect_quantity: 2, overall_disposition: "Approved" }
        ]
    };
    if (collection === "inventory_movements") throw new Error("Directus inventory movements are forbidden");
    return { data: rowsByCollection[collection] || [] };
}, [{ detail_id: 200 }], async (jobOrderIds) => {
    assert.deepEqual(jobOrderIds, [20]);
    return [{ source_document_id: 20, mm_lot_id: 2000, transaction_type_id: 2, quantity: 9 }];
});
assert.equal(loadedReplacementCredits.byDetail.get(200), 9);
assert.equal(readCalls.includes("inventory_movements"), false);

console.log("Replacement-credit allocation checks passed.");
