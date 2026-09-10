type SalesOrderDetailLike = {
    ordered_quantity?: unknown;
    quantity?: unknown;
    allocated_quantity?: unknown;
    served_quantity?: unknown;
};

function numericValue(value: unknown): number {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : NaN;
}

export function isSalesOrderDetailFullyFulfilled(detail: SalesOrderDetailLike): boolean {
    const ordered = numericValue(detail.ordered_quantity ?? detail.quantity);
    const allocated = numericValue(detail.allocated_quantity);
    const served = numericValue(detail.served_quantity);
    return Number.isFinite(ordered)
        && ordered > 0
        && Number.isFinite(allocated)
        && Number.isFinite(served)
        && Math.max(allocated, served) >= ordered;
}

export function areSalesOrderDetailsFullyFulfilled(details: unknown): boolean {
    return Array.isArray(details)
        && details.length > 0
        && details.every((detail) => Boolean(detail)
            && typeof detail === "object"
            && isSalesOrderDetailFullyFulfilled(detail as SalesOrderDetailLike));
}

export type SalesOrderFulfillmentStatus = "For Consolidation" | "In Production";

export function salesOrderStatusAfterFulfillment(details: unknown): SalesOrderFulfillmentStatus {
    return areSalesOrderDetailsFullyFulfilled(details) ? "For Consolidation" : "In Production";
}
