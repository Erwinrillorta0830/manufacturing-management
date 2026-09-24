import type { VersionOverheadItem } from "../../finished-goods-master/types";
import {
    calculateUnitCOGSBreakdown,
    type LaborPositionCosting,
    type RouteBOMCosting,
    type RouteStepCosting
} from "./cogs-helper";
import {
    assertCompatibleUoms,
    requirePositiveProductionNumber,
    PRODUCTION_TIMING_POLICY
} from "./production-timing";

export interface ProductionRouteMetric {
    sequenceOrder: number;
    setupTimeHours: number;
    plannedSetupHours: number;
    plannedRunHours: number;
    elapsedHours: number;
    stepBatchSize: number;
    timingBatchRatio: number;
}

export interface ProductionMetricsInput {
    targetQuantity: number;
    /**
     * Requested output used only for route timing. The target quantity may be
     * rounded up to a full recipe batch for costing and material planning.
     */
    timingTargetQuantity?: number;
    baseQuantity: number;
    targetUomId?: number | null;
    baseUomId?: number | null;
    routes: RouteStepCosting[];
    bomItems?: RouteBOMCosting[];
    laborPositions?: LaborPositionCosting[];
    overheadItems?: VersionOverheadItem[];
    customOverhead?: number | null;
    expectedYieldPercentage?: number | null;
    targetSellingPrice?: number;
    /** Recipe Master direct-material cost already normalized per finished unit. */
    materialCostPerUnit?: number | null;
}

export interface ProductionMetrics {
    routeMetrics: ProductionRouteMetric[];
    lineLeadTimeHours: number;
    cumulativeWorkloadHours: number;
    timingPolicy: typeof PRODUCTION_TIMING_POLICY;
    cogsBreakdown: ReturnType<typeof calculateUnitCOGSBreakdown>;
}

/**
 * Calculates the two production-time measures defined by the JO SOP:
 * line lead time for elapsed production and cumulative workload for
 * machine/labor capacity planning.
 */
export function calculateProductionMetrics(input: ProductionMetricsInput): ProductionMetrics {
    const targetQuantity = requirePositiveProductionNumber(input.targetQuantity, "Target production quantity");
    const timingTargetQuantity = requirePositiveProductionNumber(
        input.timingTargetQuantity ?? targetQuantity,
        "Timing target production quantity"
    );
    const baseQuantity = requirePositiveProductionNumber(input.baseQuantity, "Recipe base quantity");
    assertCompatibleUoms(input.targetUomId, input.baseUomId);
    const sortedRoutes = [...(input.routes || [])].sort(
        (left, right) => Number(left.sequence_order || 0) - Number(right.sequence_order || 0)
    );

    const routeMetrics = sortedRoutes.map((route) => {
        const sequenceOrder = Number(route.sequence_order || 0);
        const stepBatchSize = requirePositiveProductionNumber(
            route.step_batch_size,
            `Routing step ${sequenceOrder || ""} batch size`
        );
        const setupTimeHours = Math.max(0, Number(route.setup_time_hours || 0));
        const runTimeHours = Math.max(0, Number(route.run_time_hours || 0));
        const timingBatchRatio = timingTargetQuantity / stepBatchSize;
        const plannedSetupHours = setupTimeHours;
        const plannedRunHours = timingBatchRatio * runTimeHours;

        return {
            sequenceOrder,
            setupTimeHours,
            plannedSetupHours,
            plannedRunHours,
            elapsedHours: plannedSetupHours + plannedRunHours,
            stepBatchSize,
            timingBatchRatio
        };
    });

    const lineLeadTimeHours = routeMetrics.length > 0
        ? Math.max(...routeMetrics.map((metric) => metric.elapsedHours))
        : 0;
    const cumulativeWorkloadHours = routeMetrics.reduce(
        (total, metric) => total + metric.elapsedHours,
        0
    );

    const routeStepsForCosting = sortedRoutes.map((route) => ({
        ...route,
        setup_time_hours: Number(route.setup_time_hours || 0),
        run_time_hours: Number(route.run_time_hours || 0),
        step_batch_size: Number(route.step_batch_size)
    }));

    return {
        routeMetrics,
        lineLeadTimeHours,
        cumulativeWorkloadHours,
        timingPolicy: PRODUCTION_TIMING_POLICY,
        cogsBreakdown: calculateUnitCOGSBreakdown(
            baseQuantity,
            input.expectedYieldPercentage ?? undefined,
            input.customOverhead ?? undefined,
            input.bomItems || [],
            routeStepsForCosting,
            input.targetSellingPrice,
            input.laborPositions || [],
            input.overheadItems || [],
            input.materialCostPerUnit
        )
    };
}
