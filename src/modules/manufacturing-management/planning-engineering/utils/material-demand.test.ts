import assert from "node:assert/strict";
import {
    calculateFullBatchTarget,
    calculatePerUnitMaterialRequirement,
    calculateReleaseMaterialRequirementPlan,
    formatProductionValue
} from "./production-timing";

const recipeBatchSize = 6986.19;
const salesOrderQuantity = 12001;
const netOutputQuantity = 996;
const plannedProductionQuantity = calculateFullBatchTarget(salesOrderQuantity, recipeBatchSize);

assert.equal(plannedProductionQuantity, 13972.38);

const qaReleasePlan = calculateReleaseMaterialRequirementPlan(
    salesOrderQuantity,
    plannedProductionQuantity,
    1.02,
    2,
    netOutputQuantity
);
assert.equal(formatProductionValue(qaReleasePlan.demandRequired), "1015.9200");
assert.equal(formatProductionValue(qaReleasePlan.plannedRequired), "1015.9200");
assert.equal(qaReleasePlan.wastageFactorPercentage, 0);

const unconfiguredContainerizationPlan = calculateReleaseMaterialRequirementPlan(
    salesOrderQuantity,
    plannedProductionQuantity,
    1.02,
    2
);
assert.equal(formatProductionValue(unconfiguredContainerizationPlan.plannedRequired), "14536.8642");

const previousFullBatchBasis = calculatePerUnitMaterialRequirement(recipeBatchSize, 1.02, 2);
assert.equal(formatProductionValue(previousFullBatchBasis), "7268.4321");
assert.notEqual(formatProductionValue(previousFullBatchBasis), "1015.9200");
