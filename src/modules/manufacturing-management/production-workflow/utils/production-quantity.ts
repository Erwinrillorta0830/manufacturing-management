import type { JobOrder } from "../types";

export function resolveJobOrderTargetQuantity(
    jobOrder: Pick<JobOrder, "quantity" | "target_quantity"> | null | undefined
): number {
    const targetQuantity = Number(jobOrder?.target_quantity);
    if (Number.isFinite(targetQuantity) && targetQuantity > 0) {
        return targetQuantity;
    }

    const quantity = Number(jobOrder?.quantity);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

export const MATERIAL_QUANTITY_EPSILON = 0.000001;

/**
 * Compares consumed/actual quantities against reservation balances with the
 * codebase float tolerance. Reservation sums accumulate sub-display dust, so
 * a strict `>` misfires (red shortfall bar on variance-0 entries) when the
 * raw values differ below what any display rounding shows.
 */
export function exceedsAvailableStock(actual: unknown, available: unknown): boolean {
    return Number(actual || 0) > Number(available || 0) + MATERIAL_QUANTITY_EPSILON;
}

export function formatProductionQuantity(value: number | null | undefined): string {
    const quantity = Number(value);
    if (!Number.isFinite(quantity)) return "0";

    return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 6
    }).format(quantity);
}
