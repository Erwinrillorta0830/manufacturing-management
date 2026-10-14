type SalesOrderPriceLine = {
    unitPrice?: unknown;
    remainingQuantity?: unknown;
};

function positiveFiniteNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveSalesOrderTargetSellingPrice(
    lines: readonly SalesOrderPriceLine[],
    catalogPriceCandidates: readonly unknown[] = []
): number {
    const demandLines = lines.map((line) => ({
        unitPrice: positiveFiniteNumber(line.unitPrice),
        remainingQuantity: Number(line.remainingQuantity)
    }));

    const weightedLines = demandLines.filter((line) => Number.isFinite(line.remainingQuantity) && line.remainingQuantity > 0);
    const totalRemainingQuantity = weightedLines.reduce((sum, line) => sum + line.remainingQuantity, 0);
    const hasCompleteSalesOrderPricing = weightedLines.length > 0
        && weightedLines.every((line) => line.unitPrice !== null)
        && Number.isFinite(totalRemainingQuantity)
        && totalRemainingQuantity > 0;

    if (hasCompleteSalesOrderPricing) {
        const weightedTotal = weightedLines.reduce(
            (sum, line) => sum + (line.unitPrice as number) * line.remainingQuantity,
            0
        );
        const weightedAverage = weightedTotal / totalRemainingQuantity;
        if (Number.isFinite(weightedAverage) && weightedAverage > 0) return weightedAverage;
    }

    for (const candidate of catalogPriceCandidates) {
        const catalogPrice = positiveFiniteNumber(candidate);
        if (catalogPrice !== null) return catalogPrice;
    }

    return 0;
}
