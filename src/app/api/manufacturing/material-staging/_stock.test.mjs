import assert from "node:assert/strict";
import {
    mergeMaterialStagingMovements,
    mergeMaterialStagingOnHandMovements,
    sumMovementQuantitiesByBranchProduct
} from "./_stock.ts";

const ledgerMovements = [
    { movement_id: 1, branch_id: 4, product_id: 20, quantity: 100 },
    { movement_id: 2, branch_id: 4, product_id: 20, quantity: -5 },
    { movement_id: 3, branch_id: 8, product_id: 20, quantity: 40 }
];
const directusStagingMovements = [
    { movement_id: 2, branch_id: 4, product_id: 20, quantity: -5 },
    { movement_id: 4, branch_id: 4, product_id: 20, quantity: -12 },
    { branch_id: 4, product_id: 21, quantity: -3 }
];

const movements = mergeMaterialStagingMovements(ledgerMovements, directusStagingMovements);
const stockByBranchProduct = sumMovementQuantitiesByBranchProduct(movements);

assert.equal(stockByBranchProduct.get("4:20"), 83);
assert.equal(stockByBranchProduct.get("8:20"), 40);
assert.equal(stockByBranchProduct.get("4:21"), -3);

const onHandMovements = mergeMaterialStagingOnHandMovements(
    [{ movement_id: 10, branch_id: 4, product_id: 20, quantity: 100, remarks: "receipt" }],
    [
        { movement_id: 11, branch_id: 4, product_id: 20, quantity: -10, remarks: "[MM-MATERIAL-STAGING] issue" },
        { movement_id: 12, branch_id: 4, product_id: 20, quantity: 10, remarks: "[MM-MATERIAL-STAGING-RETURN] return" }
    ]
);
const onHandByBranchProduct = sumMovementQuantitiesByBranchProduct(onHandMovements);

assert.equal(onHandByBranchProduct.get("4:20"), 90);

console.log("material-staging Main Store On-Hand assertions passed");
