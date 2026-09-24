import assert from "node:assert/strict";
import {
    calculateFullBatchTarget,
    calculatePerUnitMaterialRequirement,
    calculateReleaseMaterialRequirementPlan,
    calculateRequiredBatchCount,
    normalizeProductionOutputQuantity,
    formatProductionValue
} from "./production-timing";

const recipeBatchSize = 6986.19;
const salesOrderQuantity = 12001;
const netOutputQuantity = 996;
const oneBatchTarget = calculateFullBatchTarget(1000, recipeBatchSize);
assert.equal(calculateRequiredBatchCount(1000, recipeBatchSize), 1);
assert.equal(oneBatchTarget, 6986.19);
assert.equal(calculateFullBatchTarget(recipeBatchSize, recipeBatchSize), recipeBatchSize);
assert.equal(normalizeProductionOutputQuantity(oneBatchTarget, "PCS"), 6986);
const plannedProductionQuantity = calculateFullBatchTarget(salesOrderQuantity, recipeBatchSize);

assert.equal(plannedProductionQuantity, 13972.38);
assert.equal(calculateRequiredBatchCount(plannedProductionQuantity, recipeBatchSize), 2);

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

const auditedPartialTargetPlan = calculateReleaseMaterialRequirementPlan(
    983,
    plannedProductionQuantity,
    1.02,
    2,
    983
);
assert.equal(formatProductionValue(auditedPartialTargetPlan.demandRequired), "1002.6600");
assert.equal(formatProductionValue(auditedPartialTargetPlan.plannedRequired), "1002.6600");

const fractionalUomPlan = calculateReleaseMaterialRequirementPlan(
    1.25,
    1.25,
    1.02,
    2,
    1.25
);
assert.equal(formatProductionValue(fractionalUomPlan.demandRequired), "1.2750");
assert.equal(formatProductionValue(fractionalUomPlan.plannedRequired), "1.2750");

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
