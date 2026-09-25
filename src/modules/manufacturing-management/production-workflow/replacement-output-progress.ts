type ReplacementCreditRow = { credited_quantity?: unknown; creditedQuantity?: unknown };
type YieldLedgerRow = { yield_quantity?: unknown; rejected_quantity?: unknown };

export interface ReplacementAwareProductionOutput {
    inheritedCreditedQuantity: number;
    currentJobOrderOutputQuantity: number;
    producedQuantity: number;
}

function nonNegativeQuantity(value: unknown): number {
    const quantity = Number(value ?? 0);
    return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
}

function roundQuantity(value: number): number {
    return Math.round(Math.max(0, value) * 1_000_000) / 1_000_000;
}

export function sumReplacementCreditedQuantity(rows: ReplacementCreditRow[] = []): number {
    return roundQuantity(rows.reduce(
        (total, row) => total + nonNegativeQuantity(row.credited_quantity ?? row.creditedQuantity),
        0
    ));
}

export function remainingProductionTarget(targetQuantity: unknown, inheritedCreditedQuantity: unknown): number {
    return roundQuantity(
        nonNegativeQuantity(targetQuantity) - nonNegativeQuantity(inheritedCreditedQuantity)
    );
}

export function resolveReplacementAwareProductionOutput(input: {
    replacementCredits?: ReplacementCreditRow[];
    yieldLedgerRows?: YieldLedgerRow[];
    actualQuantityProduced?: unknown;
    completedQuantity?: unknown;
}): ReplacementAwareProductionOutput {
    const inheritedCreditedQuantity = sumReplacementCreditedQuantity(input.replacementCredits);
    const yieldLedgerRows = input.yieldLedgerRows || [];
    const hasYieldLedger = yieldLedgerRows.length > 0;
    const currentJobOrderOutputQuantity = roundQuantity(hasYieldLedger
        ? yieldLedgerRows.reduce((total, row) => total
            + nonNegativeQuantity(row.yield_quantity)
            + nonNegativeQuantity(row.rejected_quantity), 0)
        : Math.max(
            nonNegativeQuantity(input.actualQuantityProduced),
            nonNegativeQuantity(input.completedQuantity)
        ));

    return {
        inheritedCreditedQuantity,
        currentJobOrderOutputQuantity,
        producedQuantity: roundQuantity(hasYieldLedger
            ? inheritedCreditedQuantity + currentJobOrderOutputQuantity
            : Math.max(inheritedCreditedQuantity, currentJobOrderOutputQuantity))
    };
}
