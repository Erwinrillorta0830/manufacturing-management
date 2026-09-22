import assert from "node:assert/strict";
import { calculateProductionMetrics } from "./production-metrics";
import {
    calculateBatchScaledMaterialRequirement,
    calculateFullBatchTarget,
    calculateRequiredBatchCount,
    formatProductionValue
} from "./production-timing";

assert.equal(calculateRequiredBatchCount(12001, 6986.19), 2);
assert.equal(formatProductionValue(calculateFullBatchTarget(12001, 6986.19)), "13972.3800");
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
