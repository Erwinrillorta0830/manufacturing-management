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

export function formatProductionQuantity(value: number | null | undefined): string {
    const quantity = Number(value);
    if (!Number.isFinite(quantity)) return "0";

    return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 6
    }).format(quantity);
}
