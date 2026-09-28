const QUANTITY_EPSILON = 0.000001;

export interface ProductionYieldLedgerOutput {
    yield_quantity?: unknown;
    commit_status?: unknown;
}

export function sumCommittedGoodOutput(rows: ProductionYieldLedgerOutput[]): number {
    return rows.reduce((total, row) => {
        const commitStatus = String(row.commit_status ?? "").trim().toUpperCase();
        if (commitStatus && commitStatus !== "COMMITTED") return total;
        const quantity = Number(row.yield_quantity ?? 0);
        return total + (Number.isFinite(quantity) ? Math.max(0, quantity) : 0);
    }, 0);
}

export function committedGoodOutputOrAggregate(
    rows: ProductionYieldLedgerOutput[],
    aggregateValue: unknown
): number {
    if (rows.length > 0) return sumCommittedGoodOutput(rows);
    const aggregate = Number(aggregateValue ?? 0);
    return Number.isFinite(aggregate) ? Math.max(0, aggregate) : 0;
}

export function goodOutputAggregateFallback(actualValue: unknown, completedValue: unknown): number {
    const actual = Number(actualValue ?? 0);
    const completed = Number(completedValue ?? 0);
    if (Number.isFinite(actual) && actual > 0) return actual;
    return Number.isFinite(completed) ? Math.max(0, completed) : 0;
}

export function hasReachedProductionTarget(targetValue: unknown, goodOutputValue: unknown): boolean {
    const target = Number(targetValue ?? 0);
    const goodOutput = Number(goodOutputValue ?? 0);
    return Number.isFinite(target)
        && target > QUANTITY_EPSILON
        && Number.isFinite(goodOutput)
        && goodOutput + QUANTITY_EPSILON >= target;
}
