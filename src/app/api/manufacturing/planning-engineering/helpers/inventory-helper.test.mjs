import assert from "node:assert/strict";
import { buildAvailableLotBreakdown } from "./inventory-helper.ts";

const balances = [
    {
        product_id: 1,
        lot_id: 11,
        lot_name: "Bin A",
        inventory_lot_id: 101,
        batch_no: "BATCH-A",
        quantity: 100,
        available: 0,
        expiry_date: "2027-02-01",
        manufacturing_date: "2026-10-01",
        qa_status: "Passed"
    },
    {
        product_id: 1,
        lot_id: 12,
        lot_name: "Bin B",
        inventory_lot_id: 102,
        batch_no: "BATCH-A",
        quantity: 80,
        available: 0,
        expiry_date: "2027-01-01",
        manufacturing_date: "2026-09-01",
        qa_status: "Passed"
    },
    {
        product_id: 1,
        lot_id: 12,
        lot_name: "Bin B",
        inventory_lot_id: 103,
        batch_no: "BATCH-B",
        quantity: 40,
        available: 0,
        expiry_date: "2027-03-01",
        manufacturing_date: "2026-10-02",
        qa_status: "Partially Accepted"
    },
    {
        product_id: 1,
        lot_id: 13,
        lot_name: "Bin C",
        inventory_lot_id: 104,
        batch_no: "BATCH-A",
        quantity: 50,
        available: 0,
        expiry_date: "2027-01-15",
        manufacturing_date: "2026-09-15",
        qa_status: "Pending"
    }
];

const reservations = [
    { product_id: 1, lot_id: 11, inventory_lot_id: 101, batch_no: "LOT-N/A", quantity: 20 },
    { product_id: 1, lot_id: 12, inventory_lot_id: null, batch_no: "BATCH-A", quantity: 30 },
    { product_id: 1, lot_id: null, inventory_lot_id: null, batch_no: "BATCH-B", quantity: 10 }
];

const breakdown = buildAvailableLotBreakdown(balances, reservations);
assert.deepEqual(
    breakdown.map(({ lot_id, inventory_lot_id, batch_no, available }) => ({ lot_id, inventory_lot_id, batch_no, available })),
    [
        { lot_id: 12, inventory_lot_id: 102, batch_no: "BATCH-A", available: 50 },
        { lot_id: 11, inventory_lot_id: 101, batch_no: "BATCH-A", available: 80 },
        { lot_id: 12, inventory_lot_id: 103, batch_no: "BATCH-B", available: 30 }
    ]
);

const fallbackBreakdown = buildAvailableLotBreakdown(
    [
        { ...balances[0], quantity: 40, expiry_date: "2027-02-01" },
        { ...balances[1], quantity: 60, expiry_date: "2027-01-01" }
    ],
    [{ product_id: 1, lot_id: null, inventory_lot_id: null, batch_no: "BATCH-A", quantity: 70 }]
);
assert.deepEqual(
fallbackBreakdown.map(({ lot_id, available }) => ({ lot_id, available })),
    [{ lot_id: 11, available: 30 }]
);

console.log("inventory-helper lot breakdown assertions passed");
