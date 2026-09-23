import { DecimalValue } from "../../decimal";

export const PRODUCTION_TIMING_POLICY = "PROPORTIONAL_RUN_TIME" as const;

export const PRODUCTION_DECIMAL_SCALE = 4;
const BATCH_BOUNDARY_TOLERANCE = DecimalValue.from("0.001");

export function requirePositiveProductionNumber(value: unknown, label: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${label} must be greater than zero.`);
    }
    return parsed;
}

/**
 * Returns the number of complete recipe/route batches required for a target.
 * DecimalValue is used at the comparison boundary so an exact batch multiple
 * does not become the next batch because of binary floating-point rounding.
 */
export function calculateRequiredBatchCount(
    targetQuantity: number,
    batchSize: number
): number {
    const target = DecimalValue.from(requirePositiveProductionNumber(targetQuantity, "Target production quantity"))
        .round(PRODUCTION_DECIMAL_SCALE);
    const batch = DecimalValue.from(requirePositiveProductionNumber(batchSize, "Batch size"))
        .round(PRODUCTION_DECIMAL_SCALE);

    let wholeBatches = Math.floor(Number(target.toFixed(PRODUCTION_DECIMAL_SCALE)) / Number(batch.toFixed(PRODUCTION_DECIMAL_SCALE)));
    wholeBatches = Math.max(0, wholeBatches);

    let wholeBatchQuantity = batch.multiply(wholeBatches);
    while (wholeBatches > 0 && wholeBatchQuantity.compare(target) > 0) {
        wholeBatches -= 1;
        wholeBatchQuantity = batch.multiply(wholeBatches);
    }
    while (batch.multiply(wholeBatches + 1).compare(target) <= 0) {
        wholeBatches += 1;
    }

    const remainder = target.subtract(wholeBatchQuantity);
    return Math.max(
        1,
        remainder.compare(BATCH_BOUNDARY_TOLERANCE) <= 0 ? wholeBatches : wholeBatches + 1
    );
}

export function calculateFullBatchTarget(
    targetQuantity: number,
    batchSize: number
): number {
    const batchCount = calculateRequiredBatchCount(targetQuantity, batchSize);
    return Number(
        DecimalValue.from(requirePositiveProductionNumber(batchSize, "Batch size"))
            .multiply(batchCount)
            .toFixed(PRODUCTION_DECIMAL_SCALE)
    );
}

export interface ProductionQuantityPlan {
    requestedQuantity: number;
    baseQuantity: number;
    requestedBatchRatio: number;
    requiredBatchCount: number;
    effectiveQuantity: number;
}

export interface MaterialRequirementPlan {
    quantityBasis: "PER_FINISHED_UNIT";
    quantityPerFinishedUnit: number;
    wastageFactorPercentage: number;
    demandRequired: number;
    plannedRequired: number;
}

function requireNonNegativeProductionNumber(value: number, label: string): number {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${label} must be zero or greater.`);
    }
    return value;
}

/**
 * BOM quantities in manufacturing_routes_bom are normalized to one finished
 * output unit. Batch sizing affects the finished output target, not the BOM
 * quantity basis.
 */
export function calculatePerUnitMaterialRequirement(
    outputQuantity: number,
    quantityPerFinishedUnit: number,
    wastageFactorPercentage = 0
): number {
    const output = requireNonNegativeProductionNumber(Number(outputQuantity), "Output quantity");
    const quantity = requireNonNegativeProductionNumber(Number(quantityPerFinishedUnit), "BOM quantity required");
    const wastage = requireNonNegativeProductionNumber(Number(wastageFactorPercentage), "BOM wastage percentage");

    return Number(
        DecimalValue.from(output)
            .multiply(quantity)
            .multiply(DecimalValue.from(1).add(DecimalValue.from(wastage).divideRounded(100, 8)))
            .toFixed(PRODUCTION_DECIMAL_SCALE)
    );
}

export function calculateMaterialRequirementPlan(
    requestedQuantity: number,
    plannedQuantity: number,
    quantityPerFinishedUnit: number,
    wastageFactorPercentage = 0
): MaterialRequirementPlan {
    const requested = requireNonNegativeProductionNumber(Number(requestedQuantity), "Requested output quantity");
    const planned = requireNonNegativeProductionNumber(Number(plannedQuantity), "Planned output quantity");
    if (DecimalValue.from(planned).add(BATCH_BOUNDARY_TOLERANCE).compare(DecimalValue.from(requested)) < 0) {
        throw new Error("Planned output quantity cannot be less than requested output quantity.");
    }

    return {
        quantityBasis: "PER_FINISHED_UNIT",
        quantityPerFinishedUnit: roundProductionValue(Number(quantityPerFinishedUnit)),
        wastageFactorPercentage: roundProductionValue(Number(wastageFactorPercentage)),
        demandRequired: calculatePerUnitMaterialRequirement(requested, quantityPerFinishedUnit, wastageFactorPercentage),
        plannedRequired: calculatePerUnitMaterialRequirement(planned, quantityPerFinishedUnit, wastageFactorPercentage)
    };
}

/**
 * Keeps demand quantity and the full-batch production quantity together so
 * previews, containerization, and inventory requirements cannot drift apart.
 */
export function calculateProductionQuantityPlan(
    requestedQuantity: number,
    baseQuantity: number
): ProductionQuantityPlan {
    const requested = requirePositiveProductionNumber(requestedQuantity, "Target production quantity");
    const base = requirePositiveProductionNumber(baseQuantity, "Recipe base quantity");
    const requiredBatchCount = calculateRequiredBatchCount(requested, base);

    return {
        requestedQuantity: roundProductionValue(requested),
        baseQuantity: roundProductionValue(base),
        requestedBatchRatio: requested / base,
        requiredBatchCount,
        effectiveQuantity: calculateFullBatchTarget(requested, base)
    };
}

/**
 * Production runs use complete batches. A route with a configured batch size
 * therefore receives an integer multiplier, with a minimum of one batch.
 */
export function calculateEffectiveBatchMultiplier(
    targetQuantity: number,
    stepBatchSize: number
): number {
    return calculateRequiredBatchCount(targetQuantity, stepBatchSize);
}

export function calculatePlannedRunHours(
    targetQuantity: number,
    stepBatchSize: number,
    runTimeHours: number
): number {
    const multiplier = calculateEffectiveBatchMultiplier(targetQuantity, stepBatchSize);
    return multiplier * Math.max(0, Number(runTimeHours) || 0);
}

export function calculatePlannedSetupHours(
    targetQuantity: number,
    stepBatchSize: number,
    setupTimeHours: number
): number {
    const multiplier = calculateEffectiveBatchMultiplier(targetQuantity, stepBatchSize);
    return multiplier * Math.max(0, Number(setupTimeHours) || 0);
}

export interface PlannedRouteHours {
    planned_setup_hours?: unknown;
    planned_run_hours?: unknown;
}

export function calculatePipelinedLineDurationHours(routes: readonly PlannedRouteHours[]): number {
    return routes.reduce(
        (longest, route) => Math.max(
            longest,
            Math.max(0, Number(route.planned_setup_hours) || 0)
                + Math.max(0, Number(route.planned_run_hours) || 0)
        ),
        0
    );
}

export function calculateCumulativeRouteWorkloadHours(routes: readonly PlannedRouteHours[]): number {
    return routes.reduce(
        (total, route) => total
            + Math.max(0, Number(route.planned_setup_hours) || 0)
            + Math.max(0, Number(route.planned_run_hours) || 0),
        0
    );
}

export function calculateAggregateRunHours(
    targetQuantity: number,
    baseQuantity: number,
    setupTimeHours: number,
    runTimeHoursPerUnit: number
): number {
    requirePositiveProductionNumber(baseQuantity, "Recipe base quantity");
    const quantity = Math.max(0, Number(targetQuantity) || 0);
    const plannedSetupHours = quantity > 0 ? Math.max(0, Number(setupTimeHours) || 0) : 0;
    const plannedRunHours = quantity * Math.max(0, Number(runTimeHoursPerUnit) || 0);
    return plannedSetupHours + plannedRunHours;
}

/**
 * Calculates the material quantity required for the requested output when a
 * BOM quantity is configured for one recipe batch.
 *
 * The component UOM is intentionally not converted here. The target and
 * recipe batch quantities must already be expressed in compatible output
 * UOMs; component-UOM conversion belongs at the inventory boundary.
 */
export function calculateBatchScaledMaterialRequirement(
    targetQuantity: number,
    baseQuantity: number,
    quantityRequiredPerBatch: number,
    wastageFactorPercentage = 0
): number {
    const target = Number(targetQuantity);
    if (!Number.isFinite(target) || target < 0) {
        throw new Error("Target production quantity must be zero or greater.");
    }

    const base = requirePositiveProductionNumber(baseQuantity, "Recipe base quantity");
    const quantity = Number(quantityRequiredPerBatch);
    if (!Number.isFinite(quantity) || quantity < 0) {
        throw new Error("BOM quantity required must be zero or greater.");
    }

    const wastage = Number(wastageFactorPercentage);
    if (!Number.isFinite(wastage) || wastage < 0) {
        throw new Error("BOM wastage percentage must be zero or greater.");
    }

    if (target === 0) return 0;

    const batchCount = calculateRequiredBatchCount(target, base);
    return batchCount * quantity * (1 + (wastage / 100));
}

export function readUomId(value: unknown): number | null {
    if (value && typeof value === "object") {
        const relation = value as Record<string, unknown>;
        const relatedId = relation.unit_id ?? relation.uom_id ?? relation.id;
        const parsedRelationId = Number(relatedId);
        return Number.isSafeInteger(parsedRelationId) && parsedRelationId > 0 ? parsedRelationId : null;
    }

    const parsedId = Number(value);
    return Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : null;
}

export function assertCompatibleUoms(targetUomId?: unknown, baseUomId?: unknown): void {
    const targetId = readUomId(targetUomId);
    const baseId = readUomId(baseUomId);
    if (targetId !== null && baseId !== null && targetId !== baseId) {
        throw new Error(`Production quantity UOM (${targetId}) must match the recipe base UOM (${baseId}).`);
    }
}

export function roundProductionValue(value: number): number {
    return Number(DecimalValue.from(Number.isFinite(value) ? value : 0).toFixed(PRODUCTION_DECIMAL_SCALE));
}

export function formatProductionValue(value: number | null | undefined): string {
    return DecimalValue.from(Number.isFinite(Number(value)) ? Number(value) : 0).toFixed(PRODUCTION_DECIMAL_SCALE);
}
