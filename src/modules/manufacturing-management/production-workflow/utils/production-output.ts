const QUANTITY_EPSILON = 0.000001;

export interface ProductionYieldLedgerOutput {
    yield_quantity?: unknown;
    rejected_quantity?: unknown;
    scrap_quantity?: unknown;
    commit_status?: unknown;
}

function sumCommittedOutput(rows: ProductionYieldLedgerOutput[], quantityField: "yield_quantity" | "rejected_quantity"): number {
    return rows.reduce((total, row) => {
        const commitStatus = String(row.commit_status ?? "").trim().toUpperCase();
        if (commitStatus && commitStatus !== "COMMITTED") return total;
        const quantity = Number(row[quantityField] ?? 0);
        return total + (Number.isFinite(quantity) ? Math.max(0, quantity) : 0);
    }, 0);
}

export function sumCommittedGoodOutput(rows: ProductionYieldLedgerOutput[]): number {
    return sumCommittedOutput(rows, "yield_quantity");
}

export function sumCommittedRejectedOutput(rows: ProductionYieldLedgerOutput[]): number {
    return sumCommittedOutput(rows, "rejected_quantity");
}

export function sumCommittedNadOutput(rows: ProductionYieldLedgerOutput[]): number {
    return rows.reduce((total, row) => {
        const commitStatus = String(row.commit_status ?? "").trim().toUpperCase();
        if (commitStatus && commitStatus !== "COMMITTED") return total;
        const rejected = Number(row.rejected_quantity ?? 0);
        const scrap = Number(row.scrap_quantity ?? 0);
        return total
            + (Number.isFinite(rejected) ? Math.max(0, rejected) : 0)
            + (Number.isFinite(scrap) ? Math.max(0, scrap) : 0);
    }, 0);
}

export function committedNadOutputOrAggregate(
    rows: ProductionYieldLedgerOutput[],
    aggregateValue: unknown
): number {
    if (rows.length > 0) return sumCommittedNadOutput(rows);
    const aggregate = Number(aggregateValue ?? 0);
    return Number.isFinite(aggregate) ? Math.max(0, aggregate) : 0;
}

export interface ShiftOutputConfirmationSummary {
    sessionGoodQuantity: number;
    projectedGoodQuantity: number;
    sessionRejectedQuantity: number;
    cumulativeRejectedQuantity: number;
    totalManufacturedRunQuantity: number;
}

function nonNegativeQuantity(value: unknown): number {
    const quantity = Number(value ?? 0);
    return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
}

export function calculateShiftOutputConfirmationSummary(
    goodOutputBeforeShift: unknown,
    currentGoodOutput: unknown,
    priorYieldRows: ProductionYieldLedgerOutput[],
    currentRejectedOutput: unknown
): ShiftOutputConfirmationSummary {
    const sessionGoodQuantity = nonNegativeQuantity(currentGoodOutput);
    const projectedGoodQuantity = nonNegativeQuantity(goodOutputBeforeShift) + sessionGoodQuantity;
    const sessionRejectedQuantity = nonNegativeQuantity(currentRejectedOutput);
    const cumulativeRejectedQuantity = sumCommittedRejectedOutput(priorYieldRows) + sessionRejectedQuantity;

    return {
        sessionGoodQuantity,
        projectedGoodQuantity,
        sessionRejectedQuantity,
        cumulativeRejectedQuantity,
        totalManufacturedRunQuantity: projectedGoodQuantity + cumulativeRejectedQuantity
    };
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

export function calculateProductionOutputOverrun(targetValue: unknown, goodOutputValue: unknown): number {
    const target = Number(targetValue ?? 0);
    const goodOutput = Number(goodOutputValue ?? 0);
    if (!Number.isFinite(target) || target <= QUANTITY_EPSILON || !Number.isFinite(goodOutput)) return 0;

    const overrun = goodOutput - target;
    return overrun > QUANTITY_EPSILON ? overrun : 0;
}
