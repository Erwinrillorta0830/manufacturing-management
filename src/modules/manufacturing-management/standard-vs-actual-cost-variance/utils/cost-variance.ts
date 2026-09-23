import type { CostComparison } from "../types";
import { DecimalValue } from "../../decimal";

export function roundCost(value: number): number {
    return Number(DecimalValue.from(value).round(2).toFixed(2));
}

export function compareCost(
    standard: number | null,
    actual: number | null,
    goodOutputQuantity: number
): CostComparison {
    if (standard === null || actual === null || goodOutputQuantity <= 0) {
        return {
            standard: standard === null ? null : roundCost(standard),
            actual: actual === null ? null : roundCost(actual),
            variance: null,
            variancePercent: null,
            complete: false
        };
    }

    const roundedStandard = roundCost(standard);
    const roundedActual = roundCost(actual);
    const variance = roundCost(roundedActual - roundedStandard);

    return {
        standard: roundedStandard,
        actual: roundedActual,
        variance,
        variancePercent: roundedStandard === 0 ? null : roundCost((variance / roundedStandard) * 100),
        complete: true
    };
}

export function combineCostComparisons(
    comparisons: CostComparison[],
    goodOutputQuantity: number
): CostComparison {
    const standard = comparisons.every((comparison) => comparison.standard !== null)
        ? roundCost(comparisons.reduce((sum, comparison) => sum + (comparison.standard || 0), 0))
        : null;
    const actual = comparisons.every((comparison) => comparison.actual !== null)
        ? roundCost(comparisons.reduce((sum, comparison) => sum + (comparison.actual || 0), 0))
        : null;

    return compareCost(standard, actual, goodOutputQuantity);
}
