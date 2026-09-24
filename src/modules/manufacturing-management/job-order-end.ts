export type JobOrderEndAction = "cancel" | "terminate-production";

export function shouldReturnSalesOrderToForProduction(
    action: JobOrderEndAction,
    hasEndOfShiftProgress: boolean,
    actualMaterialConsumption: number
): boolean {
    if (action === "cancel") return !hasEndOfShiftProgress;
    return !(Number.isFinite(actualMaterialConsumption) && actualMaterialConsumption > 0);
}

export function salesOrderStatusAfterJobOrderEnd(
    currentStatus: unknown,
    shouldRollback: boolean,
    hasOtherActiveJobOrder: boolean
): string {
    const status = String(currentStatus ?? "").trim();
    if (!shouldRollback || hasOtherActiveJobOrder || status !== "In Production") return status;
    return "For Production";
}
