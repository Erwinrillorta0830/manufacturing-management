import assert from "node:assert/strict";
import { calculateProductionMetrics } from "./production-metrics";
import {
    calculateContainerizationMetrics,
    formatInventoryQuantity,
    getKilogramsPerInventoryUnit,
    parseContainerizationProfile
} from "./containerization-helper";
import {
    calculateMaterialSpend,
    calculateRecipeMaterialCostPerUnit,
    formatManufacturingMoney,
    roundManufacturingMoney
} from "./cogs-helper";
import {
    calculateBatchScaledMaterialRequirement,
    calculateAggregateRunHours,
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

assert.equal(metrics.routeMetrics[0].timingBatchRatio, 1);
assert.equal(formatProductionValue(metrics.routeMetrics[0].elapsedHours), "17.7314");
assert.equal(formatProductionValue(metrics.routeMetrics[1].plannedRunHours), "0.0493");
assert.equal(formatProductionValue(metrics.routeMetrics[1].plannedSetupHours), "1.4770");
assert.equal(formatProductionValue(metrics.routeMetrics[1].elapsedHours), "1.5263");
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
assert.equal(belowBatch.routeMetrics[0].timingBatchRatio, 0.1);
assert.equal(belowBatch.routeMetrics[0].plannedRunHours, 1);

const aboveBatch = calculateProductionMetrics({
    targetQuantity: 2500,
    baseQuantity: 1000,
    routes: [{ sequence_order: 1, setup_time_hours: 0, run_time_hours: 10, step_batch_size: 1000 }]
});
assert.equal(aboveBatch.routeMetrics[0].timingBatchRatio, 2.5);
assert.equal(aboveBatch.routeMetrics[0].plannedRunHours, 25);

const fullBatchSetup = calculateProductionMetrics({
    targetQuantity: 12001,
    baseQuantity: 6986.19,
    routes: [{ sequence_order: 1, setup_time_hours: 0.5, run_time_hours: 2.5, step_batch_size: 6986.19 }]
});
assert.equal(formatProductionValue(fullBatchSetup.routeMetrics[0].timingBatchRatio), "1.7178");
assert.equal(fullBatchSetup.routeMetrics[0].setupTimeHours, 0.5);
assert.equal(formatProductionValue(fullBatchSetup.routeMetrics[0].plannedSetupHours), "0.8589");
assert.equal(formatProductionValue(fullBatchSetup.routeMetrics[0].plannedRunHours), "4.2945");
assert.equal(formatProductionValue(fullBatchSetup.routeMetrics[0].elapsedHours), "5.1535");
assert.equal(formatProductionValue(fullBatchSetup.lineLeadTimeHours), "5.1535");

const documentedStepTiming = calculateProductionMetrics({
    targetQuantity: 13972.38,
    timingTargetQuantity: 12001,
    baseQuantity: 6986.19,
    routes: [{ sequence_order: 1, setup_time_hours: 0.5, run_time_hours: 2.5, step_batch_size: 3250 }]
});
assert.equal(formatProductionValue(documentedStepTiming.routeMetrics[0].timingBatchRatio), "3.6926");
assert.equal(formatProductionValue(documentedStepTiming.routeMetrics[0].plannedSetupHours), "1.8463");
assert.equal(formatProductionValue(documentedStepTiming.routeMetrics[0].plannedRunHours), "9.2315");
assert.equal(formatProductionValue(documentedStepTiming.routeMetrics[0].elapsedHours), "11.0778");

assert.equal(formatProductionValue(documentedStepTiming.cogsBreakdown.materialCostPerUnit), "0.0000");

const pipelinedSteps = calculateProductionMetrics({
    targetQuantity: 12001,
    baseQuantity: 6986.19,
    routes: [
        { sequence_order: 1, setup_time_hours: 0.5, run_time_hours: 2.5, step_batch_size: 3250 },
        { sequence_order: 2, setup_time_hours: 0.25, run_time_hours: 1.5, step_batch_size: 4000 }
    ]
});
assert.equal(formatProductionValue(pipelinedSteps.routeMetrics[1].elapsedHours), "5.2504");
assert.equal(formatProductionValue(pipelinedSteps.lineLeadTimeHours), "11.0778");
assert.equal(formatProductionValue(pipelinedSteps.cumulativeWorkloadHours), "16.3283");
assert.equal(formatProductionValue(calculateAggregateRunHours(12001, 3250, 0.5, 2.5 / 3250)), "9.7315");

const auditedLeadTime = calculateProductionMetrics({
    targetQuantity: 983,
    timingTargetQuantity: 983,
    baseQuantity: 1000,
    routes: [{ sequence_order: 1, setup_time_hours: 0.5, run_time_hours: 2.0295, step_batch_size: 1000 }]
});
assert.equal(formatProductionValue(auditedLeadTime.lineLeadTimeHours), "2.4865");
assert.equal(formatProductionValue(auditedLeadTime.routeMetrics[0].plannedSetupHours), "0.4915");

const qaScaledRuntime = calculateProductionMetrics({
    targetQuantity: 13972.38,
    timingTargetQuantity: 996,
    baseQuantity: 6986.19,
    routes: [{ sequence_order: 1, setup_time_hours: 0.5, run_time_hours: 17.2314, step_batch_size: 6986.17 }]
});
assert.equal(formatProductionValue(qaScaledRuntime.lineLeadTimeHours), "2.5279");

const multiBatchRuntime = calculateProductionMetrics({
    targetQuantity: 12001,
    baseQuantity: 6986.19,
    routes: [{ sequence_order: 1, setup_time_hours: 0.25, run_time_hours: 17.4814, step_batch_size: 6986.19 }]
});
assert.equal(formatProductionValue(multiBatchRuntime.routeMetrics[0].timingBatchRatio), "1.7178");
assert.equal(formatProductionValue(multiBatchRuntime.lineLeadTimeHours), "30.4593");

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
assert.equal(formatProductionValue(liveRecipeMaterialCost), "18.4520");
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
        setup_time_hours: 0,
        run_time_hours: 1,
        step_batch_size: 3250,
        work_center_overhead_cost_per_hour: 1.0532 * 6986.19
    }],
    bomItems: [{ quantity_required: 1, cost_per_unit: 18.45 }],
    materialCostPerUnit: 18.45,
    expectedYieldPercentage: 98.5,
    overheadItems: [{ cost_per_unit: 4.85, is_active: true } as never],
    laborPositions: [{
        daily_rate: 1.46565 * 6986.19,
        manpower_count: 1,
        include_mandates: false
    }]
});
assert.equal(configuredOverhead.cogsBreakdown.factoryOverheadBasis, "VERSION_OVERHEAD");
assert.equal(formatProductionValue(configuredOverhead.cogsBreakdown.machineOverheadCostPerUnit), "1.0532");
assert.equal(formatProductionValue(configuredOverhead.cogsBreakdown.fixedOverheadCostPerUnit), "4.8500");
assert.equal(formatProductionValue(configuredOverhead.cogsBreakdown.factoryOverheadCostPerUnit), "5.9032");
assert.equal(formatProductionValue(configuredOverhead.cogsBreakdown.directLaborCostPerUnit), "1.4657");
assert.equal(formatProductionValue(configuredOverhead.cogsBreakdown.baseUnitCOGS), "25.8189");
assert.equal(formatProductionValue(configuredOverhead.cogsBreakdown.adjustedUnitCOGS), "26.2120");

const configuredOverheadAtFullBatch = calculateProductionMetrics({
    targetQuantity: 13972.38,
    baseQuantity: 6986.19,
    routes: [{
        sequence_order: 1,
        setup_time_hours: 0,
        run_time_hours: 1,
        step_batch_size: 3250,
        work_center_overhead_cost_per_hour: 1.0532 * 6986.19
    }],
    bomItems: [{ quantity_required: 1, cost_per_unit: 18.45 }],
    materialCostPerUnit: 18.45,
    expectedYieldPercentage: 98.5,
    overheadItems: [{ cost_per_unit: 4.85, is_active: true } as never],
    laborPositions: [{
        daily_rate: 1.46565 * 6986.19,
        manpower_count: 1,
        include_mandates: false
    }]
});
assert.equal(
    formatProductionValue(configuredOverheadAtFullBatch.cogsBreakdown.machineOverheadCostPerUnit),
    formatProductionValue(configuredOverhead.cogsBreakdown.machineOverheadCostPerUnit)
);
assert.equal(
    formatProductionValue(configuredOverheadAtFullBatch.cogsBreakdown.baseUnitCOGS),
    formatProductionValue(configuredOverhead.cogsBreakdown.baseUnitCOGS)
);

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
    formatProductionValue(17.4814 / 6986.19)
);

const containerizationProfile = parseContainerizationProfile(
    "Recipe notes [MM-CONTAINERIZATION-V1] {\"sacksPerMixEquivalent\":15.37,\"flourKgPerMix\":235.97965505}"
);
assert.deepEqual(containerizationProfile, {
    sacksPerMixEquivalent: 15.37,
    flourKgPerMix: 235.97965505
});

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
    [],
    6986.19,
    12001,
    containerizationProfile
);
assert.equal(containerization.requiredBatchCount, 2);
assert.equal(formatProductionValue(containerization.requestedBatchRatio), "1.7178");
assert.equal(formatProductionValue(containerization.requestedMixCount), "1.7178");
assert.equal(containerization.mixCount, 2);
assert.equal(formatProductionValue(containerization.requestedSackCount), "26.4029");
assert.equal(formatProductionValue(containerization.requestedFlourGrams / 1000), "405.3700");
assert.equal(formatProductionValue(containerization.sackCount), "30.7400");
assert.equal(formatProductionValue(containerization.flourGramsTotal / 1000), "471.9593");
assert.equal(containerization.containerUnitLabel, "recipe sack-equivalents");
assert.equal(containerization.hasFlourWeightEstimate, true);

const expectedYieldOnlyContainerization = calculateContainerizationMetrics(
    "QA Yield Product",
    6986.19,
    1,
    98.5,
    1.3,
    500,
    undefined,
    15.37,
    32892.5,
    [],
    6986.19,
    6986.19
);
assert.equal(formatProductionValue(expectedYieldOnlyContainerization.grossPieces), "1011.1155");
assert.equal(formatProductionValue(expectedYieldOnlyContainerization.netPieces), "995.9487");
assert.equal(Math.round(expectedYieldOnlyContainerization.netPieces), 996);

const bagContainerization = calculateContainerizationMetrics(
    "Flour Product",
    2000,
    1,
    100,
    0,
    500,
    50,
    undefined,
    undefined,
    [{
        product_name: "Special Grade Wheat Flour",
        quantity_required: 0.2,
        unit_of_measurement: "Bag",
        kilograms_per_inventory_unit: 25
    }],
    1000,
    1500
);
assert.equal(bagContainerization.containerUnitLabel, "Bags");
assert.equal(bagContainerization.sackCount, 400);
assert.equal(formatProductionValue(bagContainerization.flourGramsTotal / 1000), "10000.0000");

const bagContainerizationWithWastage = calculateContainerizationMetrics(
    "Flour Product",
    2000,
    1,
    100,
    0,
    500,
    50,
    undefined,
    undefined,
    [{
        product_name: "Special Grade Wheat Flour",
        quantity_required: 0.2,
        wastage_factor_percentage: 1.5,
        unit_of_measurement: "Bag",
        kilograms_per_inventory_unit: 25
    }],
    1000,
    1500
);
assert.equal(formatProductionValue(bagContainerizationWithWastage.requestedSackCount), "304.5000");
assert.equal(formatProductionValue(bagContainerizationWithWastage.sackCount), "406.0000");
assert.equal(formatProductionValue(bagContainerizationWithWastage.flourGramsTotal / 1000), "10150.0000");

const bagWithoutWeight = calculateContainerizationMetrics(
    "Flour Product",
    2000,
    1,
    100,
    0,
    500,
    50,
    undefined,
    undefined,
    [{ product_name: "Flour", quantity_required: 0.2, unit_of_measurement: "Bag" }],
    1000,
    1500
);
assert.equal(bagWithoutWeight.sackCount, 400);
assert.equal(bagWithoutWeight.hasFlourWeightEstimate, false);
assert.equal(bagWithoutWeight.hasOutputEstimate, false);

assert.equal(getKilogramsPerInventoryUnit({ unit_of_measurement: { unit_shortcut: "kg" } }), 1);
assert.equal(getKilogramsPerInventoryUnit({
    unit_of_measurement: { unit_shortcut: "Bag" },
    net_weight: 25,
    weight_unit_id: { code: "kg" }
}), 25);
assert.equal(getKilogramsPerInventoryUnit({ unit_of_measurement: { unit_shortcut: "Bag" } }), null);
assert.deepEqual(formatInventoryQuantity(4, "Bag", 25), { quantity: "4 Bag", kilograms: "100 kg" });

assert.equal(parseContainerizationProfile("No profile configured"), null);
assert.equal(parseContainerizationProfile("[MM-CONTAINERIZATION-V1] {invalid}"), null);

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
