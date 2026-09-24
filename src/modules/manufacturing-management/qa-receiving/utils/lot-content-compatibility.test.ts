import assert from "node:assert/strict";
import { buildLotStoredProductSummaryMap } from "../../shared/services/lot-tracking.service";
import type { MMLot, MMInventoryLot } from "../../shared/types/lot-tracking.types";
import { findQALotContentConflicts } from "./lot-content-compatibility";

const lot: MMLot = {
  lot_id: 181,
  lot_name: "APPLE RAW",
  branch_id: 196,
  unit_id: 1,
  max_batch_capacity: 10_000,
  status: "ACTIVE",
};

const registeredLots: MMInventoryLot[] = [
  {
    inventory_lot_id: 611,
    lot_id: 181,
    branch_id: 196,
    product_id: 1,
    batch_no: "APPLE-RAW-1",
    unit_cost: 0,
    qa_status: "GOOD",
    status: "ACTIVE",
    product_name: "APPLEEE",
    product_code: "APPS",
    product_type: 389,
  },
  {
    inventory_lot_id: 646,
    lot_id: 181,
    branch_id: 196,
    product_id: 2,
    batch_no: "APPLE-FG-1",
    unit_cost: 0,
    qa_status: "GOOD",
    status: "ACTIVE",
    product_name: "APPLE",
    product_code: "APP",
    product_type: 388,
    available_quantity: 0,
  },
];

const rawStock = [
  {
    mmLotId: 181,
    productId: 1,
    productName: "APPLEEE",
    productCode: "APPS",
    productTypeId: 389,
    onhandQuantity: 1_070,
  },
];

const normalizeOnhandTypes = (rows: typeof rawStock) =>
  rows.map((row) => ({ ...row, productType: row.productTypeId }));

const rawOnlySummary = buildLotStoredProductSummaryMap(
  normalizeOnhandTypes(rawStock),
  [lot],
  [],
  registeredLots
).get(lot.lot_id);

assert.equal(rawOnlySummary?.primary_classification_label, "Raw Material");
assert.deepEqual(rawOnlySummary?.stored_products.map((product) => product.product_id), [1]);
assert.equal(findQALotContentConflicts(rawOnlySummary, "RM", 3).length, 0);

const mixedSummary = buildLotStoredProductSummaryMap(
  normalizeOnhandTypes([
    ...rawStock,
    {
      mmLotId: 181,
      productId: 2,
      productName: "APPLE",
      productCode: "APP",
      productTypeId: 388,
      onhandQuantity: 75,
    },
  ]),
  [lot],
  [],
  registeredLots
).get(lot.lot_id);

assert.equal(mixedSummary?.primary_classification_label, "Raw Material & Finished Good");
assert.deepEqual(
  findQALotContentConflicts(mixedSummary, "RM", 3).map((product) => product.product_id),
  [2]
);
assert.equal(findQALotContentConflicts(mixedSummary, "OTHER", 3).length, 0);

const draftSummary = buildLotStoredProductSummaryMap(
  normalizeOnhandTypes(rawStock),
  [lot],
  [
    {
      lot_id: 181,
      product_id: 2,
      product_name: "APPLE",
      product_code: "APP",
      product_type: 388,
      allocated_quantity: 5,
    },
  ],
  registeredLots
).get(lot.lot_id);
assert.deepEqual(
  findQALotContentConflicts(draftSummary, "RM", 3).map((product) => product.product_id),
  [2]
);

const sameProductSummary = buildLotStoredProductSummaryMap(
  normalizeOnhandTypes(rawStock),
  [lot],
  [],
  registeredLots
).get(lot.lot_id);
assert.equal(findQALotContentConflicts(sameProductSummary, "RM", 1).length, 0);
