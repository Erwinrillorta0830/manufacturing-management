import assert from "node:assert/strict";
import { calculateProductionMetrics } from "./production-metrics";
import { calculateContainerizationMetrics } from "./containerization-helper";
import {
    calculateMaterialSpend,
    calculateRecipeMaterialCostPerUnit,
    formatManufacturingMoney,
    roundManufacturingMoney
} from "./cogs-helper";
import {
    calculateBatchScaledMaterialRequirement,
    calculateFullBatchTarget,
    calculateMaterialRequirementPlan,
    calculatePerUnitMaterialRequirement,
    calculateRequiredBatchCount,
    formatProductionValue
} from "./production-timing";

assert.equal(calculateRequiredBatchCount(12001, 6986.19), 2);
assert.equal(formatProductionValue(calculateFullBatchTarget(12001, 6986.19)), "13972.3800");
assert.equal(formatProductionValue(calculatePerUnitMaterialRequirement(12001, 1.02, 2)), "12485.8404");
assert.equal(formatProductionValue(calculatePerUnitMaterialRequirement(13972.38, 1.02, 2)), "14536.8642");
const wrapperPlan = calculateMaterialRequirementPlan(12001, 13972.38, 1.02, 2);
assert.equal(formatProductionValue(wrapperPlan.demandRequired), "12485.8404");
assert.equal(formatProductionValue(wrapperPlan.plannedRequired), "14536.8642");
assert.throws(
    () => calculateMaterialRequirementPlan(12001, 12000, 1.02, 2),
    /Planned output quantity cannot be less than requested output quantity/
);
assert.equal(
    formatProductionValue(calculateBatchScaledMaterialRequirement(12001, 6986.19, 5, 0.5)),
    "10.0500"
);

const bisenteRequirement = calculateBatchScaledMaterialRequirement(
    354.628,
    354.6278,
    5,
    0.5
);
assert.equal(formatProductionValue(bisenteRequirement), "5.0250");
assert.notEqual(formatProductionValue(bisenteRequirement), "1782.0000");
assert.equal(
    formatProductionValue(calculateBatchScaledMaterialRequirement(709.2556, 354.6278, 5, 0.5)),
    "10.0500"
);
assert.throws(
    () => calculateBatchScaledMaterialRequirement(354.628, 0, 5, 0.5),
    /Recipe base quantity must be greater than zero/
);

const metrics = calculateProductionMetrics({
    targetQuantity: 354.6278,
    baseQuantity: 354.6278,
    routes: [
        {
            sequence_order: 1,
            setup_time_hours: 0.25,
            run_time_hours: 17.4814,
            step_batch_size: 354.6278,
            work_center_overhead_cost_per_hour: 0
        },
        {
            sequence_order: 2,
            setup_time_hours: 0.0833,
            run_time_hours: 10 / 3600,
            step_batch_size: 20,
            work_center_overhead_cost_per_hour: 0
        }
    ],
    laborPositions: [
        {
            daily_rate: 505,
            manpower_count: 1,
            include_mandates: true,
            sss_amount: 48.18,
            phic_amount: 7.69,
            hdmf_amount: 3.85
        },
        {
            daily_rate: 510,
            manpower_count: 1,
            include_mandates: false
        }
    ],
    overheadItems: [{ cost_per_unit: 0.05, is_active: true } as never]
});

assert.equal(metrics.routeMetrics[0].effectiveBatchMultiplier, 1);
assert.equal(formatProductionValue(metrics.routeMetrics[0].elapsedHours), "17.7314");
assert.equal(formatProductionValue(metrics.routeMetrics[1].plannedRunHours), "0.0500");
assert.equal(formatProductionValue(metrics.routeMetrics[1].elapsedHours), "0.1333");
assert.equal(formatProductionValue(metrics.lineLeadTimeHours), "17.7314");
assert.equal(formatProductionValue(metrics.cogsBreakdown.directLaborCostPerUnit), "3.0306");
assert.equal(formatProductionValue(metrics.cogsBreakdown.factoryOverheadCostPerUnit), "0.0500");

const fallbackBenefits = calculateProductionMetrics({
    targetQuantity: 1000,
    baseQuantity: 1000,
    routes: [{ sequence_order: 1, run_time_hours: 1, step_batch_size: 1000 }],
    laborPositions: [{ daily_rate: 505, manpower_count: 1, include_mandates: true, sss_amount: 0, phic_amount: 0, hdmf_amount: 0 }]
});
assert.equal(formatProductionValue(fallbackBenefits.cogsBreakdown.directLaborCostPerUnit), "0.5647");

const belowBatch = calculateProductionMetrics({
    targetQuantity: 100,
    baseQuantity: 1000,
    routes: [{ sequence_order: 1, setup_time_hours: 0, run_time_hours: 10, step_batch_size: 1000 }]
});
assert.equal(belowBatch.routeMetrics[0].effectiveBatchMultiplier, 1);
assert.equal(belowBatch.routeMetrics[0].plannedRunHours, 10);

const aboveBatch = calculateProductionMetrics({
    targetQuantity: 2500,
    baseQuantity: 1000,
    routes: [{ sequence_order: 1, setup_time_hours: 0, run_time_hours: 10, step_batch_size: 1000 }]
});
assert.equal(aboveBatch.routeMetrics[0].effectiveBatchMultiplier, 3);
assert.equal(aboveBatch.routeMetrics[0].plannedRunHours, 30);

const fullBatchSetup = calculateProductionMetrics({
    targetQuantity: 12001,
    baseQuantity: 6986.19,
    routes: [{ sequence_order: 1, setup_time_hours: 0.5, run_time_hours: 2.5, step_batch_size: 6986.19 }]
});
assert.equal(fullBatchSetup.routeMetrics[0].effectiveBatchMultiplier, 2);
assert.equal(fullBatchSetup.routeMetrics[0].setupTimeHours, 0.5);
assert.equal(fullBatchSetup.routeMetrics[0].plannedRunHours, 5);
assert.equal(fullBatchSetup.routeMetrics[0].elapsedHours, 5.5);

const multiBatchRuntime = calculateProductionMetrics({
    targetQuantity: 12001,
    baseQuantity: 6986.19,
    routes: [{ sequence_order: 1, setup_time_hours: 0.25, run_time_hours: 17.4814, step_batch_size: 6986.19 }]
});
assert.equal(multiBatchRuntime.routeMetrics[0].effectiveBatchMultiplier, 2);
assert.equal(formatProductionValue(multiBatchRuntime.lineLeadTimeHours), "35.2128");

const directMaterialsForRequestedQuantity = calculateProductionMetrics({
    targetQuantity: 12001,
    baseQuantity: 6986.19,
    routes: [{ sequence_order: 1, run_time_hours: 2.5, step_batch_size: 6986.19 }],
    bomItems: [{ quantity_required: 1, cost_per_unit: 18.45 }],
    materialCostPerUnit: 18.45
});
const directMaterialsForFullBatch = calculateProductionMetrics({
    targetQuantity: 13972.38,
    baseQuantity: 6986.19,
    routes: [{ sequence_order: 1, run_time_hours: 2.5, step_batch_size: 6986.19 }],
    bomItems: [{ quantity_required: 1, cost_per_unit: 18.45 }],
    materialCostPerUnit: 18.45
});
const directMaterialsFromBomFallback = calculateProductionMetrics({
    targetQuantity: 12001,
    baseQuantity: 6986.19,
    routes: [{ sequence_order: 1, run_time_hours: 2.5, step_batch_size: 6986.19 }],
    bomItems: [{ quantity_required: 1, cost_per_unit: 18.45 }]
});
assert.equal(formatProductionValue(directMaterialsForRequestedQuantity.cogsBreakdown.materialCostPerUnit), "18.4500");
assert.equal(formatProductionValue(directMaterialsForFullBatch.cogsBreakdown.materialCostPerUnit), "18.4500");
assert.equal(formatProductionValue(directMaterialsFromBomFallback.cogsBreakdown.materialCostPerUnit), "18.4500");
const liveRecipeMaterialCost = calculateRecipeMaterialCostPerUnit([
    { quantity_required: 0.3579, wastage_factor_percentage: 1.5, cost_per_unit: 35 },
    { quantity_required: 0.1074, wastage_factor_percentage: 1, cost_per_unit: 28 },
    { quantity_required: 0.0064, wastage_factor_percentage: 0.5, cost_per_unit: 14 },
    { quantity_required: 0.093, cost_per_unit: 2 },
    { quantity_required: 0.1718, cost_per_unit: 0.5 },
    { quantity_required: 0.0086, cost_per_unit: 45 },
    { quantity_required: 0.0086, cost_per_unit: 45 },
    { quantity_required: 1.02, wastage_factor_percentage: 2, cost_per_unit: 1.5 }
]);
assert.equal(formatManufacturingMoney(liveRecipeMaterialCost), "18.45");
assert.equal(roundManufacturingMoney(liveRecipeMaterialCost), 18.45);
assert.equal(formatManufacturingMoney(calculateMaterialSpend(liveRecipeMaterialCost, 12001)), "221418.45");
assert.equal(formatManufacturingMoney(calculateMaterialSpend(liveRecipeMaterialCost, 13972.38)), "257790.41");
assert.notEqual(formatManufacturingMoney(liveRecipeMaterialCost / 6986.19), "18.45");
const rawMaterialCostMetrics = calculateProductionMetrics({
    targetQuantity: 12001,
    baseQuantity: 6986.19,
    routes: [{ sequence_order: 1, run_time_hours: 2.5, step_batch_size: 6986.19 }],
    bomItems: [{ quantity_required: 1, cost_per_unit: liveRecipeMaterialCost }],
    materialCostPerUnit: liveRecipeMaterialCost
});
assert.equal(formatManufacturingMoney(rawMaterialCostMetrics.cogsBreakdown.materialCostPerUnit), "18.45");

const configuredOverhead = calculateProductionMetrics({
    targetQuantity: 12001,
    baseQuantity: 6986.19,
    routes: [{
        sequence_order: 1,
        setup_time_hours: 0.25,
        run_time_hours: 17.4814,
        step_batch_size: 6986.19,
        work_center_overhead_cost_per_hour: 10
    }],
    bomItems: [{ quantity_required: 1, cost_per_unit: 18.45 }],
    materialCostPerUnit: 18.45,
    expectedYieldPercentage: 98.5,
    overheadItems: [{ cost_per_unit: 4.85, is_active: true } as never],
    laborPositions: [{
        daily_rate: 1.4657 * 6986.19,
        manpower_count: 1,
        include_mandates: false
    }]
});
assert.equal(configuredOverhead.cogsBreakdown.factoryOverheadBasis, "VERSION_OVERHEAD");
assert.equal(formatProductionValue(configuredOverhead.cogsBreakdown.factoryOverheadCostPerUnit), "4.8500");
assert.equal(formatProductionValue(configuredOverhead.cogsBreakdown.directLaborCostPerUnit), "1.4657");
assert.equal(formatProductionValue(configuredOverhead.cogsBreakdown.baseUnitCOGS), "24.7700");
assert.equal(formatProductionValue(configuredOverhead.cogsBreakdown.adjustedUnitCOGS), "25.1500");

const runtimeOverheadFallback = calculateProductionMetrics({
    targetQuantity: 12001,
    baseQuantity: 6986.19,
    routes: [{
        sequence_order: 1,
        setup_time_hours: 0,
        run_time_hours: 17.4814,
        step_batch_size: 6986.19,
        work_center_overhead_cost_per_hour: 1
    }]
});
assert.equal(runtimeOverheadFallback.cogsBreakdown.factoryOverheadBasis, "WORK_CENTER_RUNTIME");
assert.equal(
    formatProductionValue(runtimeOverheadFallback.cogsBreakdown.factoryOverheadCostPerUnit),
    formatProductionValue((17.4814 * 2) / 12001)
);

const containerization = calculateContainerizationMetrics(
    "QA Product",
    13972.38,
    1,
    100,
    0,
    500,
    50,
    1,
    15370,
    // BOM quantities are per finished unit. This is equivalent to the legacy
    // 15.37 KG per 6,986.19-unit batch fixture.
    [{ product_name: "Flour", quantity_required: 15.37 / 6986.19, unit_of_measurement: "KG" }],
    6986.19,
    12001
);
assert.equal(containerization.requiredBatchCount, 2);
assert.equal(formatProductionValue(containerization.requestedBatchRatio), "1.7178");
assert.equal(formatProductionValue(containerization.requestedMixCount), "1.7178");
assert.equal(containerization.mixCount, 2);
assert.equal(formatProductionValue(containerization.requestedFlourGrams), "26402.8562");
assert.equal(containerization.flourGramsTotal, 30740);

assert.throws(
    () => calculateProductionMetrics({
        targetQuantity: 100,
        baseQuantity: 1000,
        targetUomId: 2,
        baseUomId: 3,
        routes: [{ sequence_order: 1, run_time_hours: 1, step_batch_size: 1000 }]
    }),
    /must match/
);

assert.equal(formatProductionValue(0.04925), "0.0493");
