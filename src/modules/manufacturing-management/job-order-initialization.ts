export function salesOrderStatusAfterJobOrderInitialization(currentStatus: unknown): string | null {
    return String(currentStatus ?? "").trim().toLowerCase() === "for production"
        ? "In Production"
        : null;
}

function relationId(value: unknown, keys: string[]): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const id = Number(record[key]);
            if (Number.isSafeInteger(id) && id > 0) return id;
        }
    }
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

export function salesOrderDetailIdsFromAllocations(allocations: Array<Record<string, unknown>>): number[] {
    return [...new Set(allocations
        .map((allocation) => relationId(allocation.sales_order_detail_id, ["detail_id", "id"]))
        .filter((id) => id > 0))];
}

export function linkedSalesOrderIdsFromJobOrderAllocations(
    allocations: Array<Record<string, unknown>>,
    details: Array<Record<string, unknown>>
): number[] {
    const detailIds = new Set(salesOrderDetailIdsFromAllocations(allocations));
    return [...new Set(details
        .filter((detail) => detailIds.has(relationId(detail.detail_id ?? detail.id, ["detail_id", "id"])))
        .map((detail) => relationId(detail.order_id, ["order_id", "id"]))
        .filter((id) => id > 0))];
}
