import { DecimalValue } from "../../decimal";

export const PRODUCTION_TIMING_POLICY = "MINIMUM_BATCH_PROPORTIONAL" as const;

export const PRODUCTION_DECIMAL_SCALE = 4;

export function requirePositiveProductionNumber(value: unknown, label: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${label} must be greater than zero.`);
    }
    return parsed;
}

/**
 * A route always requires at least one configured batch run. Additional
 * quantity scales proportionally above that minimum.
 */
export function calculateEffectiveBatchMultiplier(
    targetQuantity: number,
    stepBatchSize: number
): number {
    const target = requirePositiveProductionNumber(targetQuantity, "Target production quantity");
    const batch = requirePositiveProductionNumber(stepBatchSize, "Routing step batch size");
    return Math.max(1, target / batch);
}

export function calculatePlannedRunHours(
    targetQuantity: number,
    stepBatchSize: number,
    runTimeHours: number
): number {
    const multiplier = calculateEffectiveBatchMultiplier(targetQuantity, stepBatchSize);
    return multiplier * Math.max(0, Number(runTimeHours) || 0);
}

export function calculateAggregateRunHours(
    targetQuantity: number,
    baseQuantity: number,
    setupTimeHours: number,
    runTimeHoursPerUnit: number
): number {
    const multiplier = calculateEffectiveBatchMultiplier(targetQuantity, baseQuantity);
    const standardRunHours = Math.max(0, Number(runTimeHoursPerUnit) || 0) * baseQuantity;
    return Math.max(0, Number(setupTimeHours) || 0) + (multiplier * standardRunHours);
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

    return (target / base) * quantity * (1 + (wastage / 100));
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
