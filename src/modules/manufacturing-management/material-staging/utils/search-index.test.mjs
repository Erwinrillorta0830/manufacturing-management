import assert from "node:assert/strict";
import { buildMaterialStagingSearchIndex } from "./search-index.ts";

const jobOrders = [
    {
        job_order_id: 12,
        job_order_no: "JO-12",
        product_name: "Orange Cake",
        product_code: "FG-ORANGE",
        primary_work_center_name: "Packing Line",
        materials: [
            {
                product_name: "Palm Oil",
                product_code: "RM-OIL",
                allocations: [{ batch_no: "OIL-BATCH-45" }]
            }
        ]
    }
];

const searchIndex = buildMaterialStagingSearchIndex(jobOrders);
const searchableText = searchIndex.get(12);
assert.ok(searchableText);
for (const value of ["jo-12", "orange cake", "fg-orange", "packing line", "palm oil", "rm-oil", "oil-batch-45"]) {
    assert.ok(searchableText.includes(value), `Expected search index to include ${value}`);
}
assert.ok(!searchableText.includes("jo-12orange cake"), "Separate fields must not combine into a searchable phrase");

console.log("material-staging search index assertions passed");
