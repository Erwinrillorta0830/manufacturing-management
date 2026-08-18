export interface PurchaseOrderLineReference {
    purchase_order_product_id?: unknown;
    product_id?: unknown;
}

export interface ReceivingHistoryReference {
    purchase_order_line_id?: unknown;
    product_id?: unknown;
    received_quantity?: unknown;
    quantity_rejected?: unknown;
    is_replacement?: unknown;
}

export interface ReceivingHistoryTotals {
    received: number;
    rejected: number;
}

function relationId(value: unknown, key: string): number | null {
    const raw = value && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
        : value;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolvePurchaseOrderLineId(
    receiving: ReceivingHistoryReference,
    purchaseOrderLines: readonly PurchaseOrderLineReference[]
): number | null {
    const explicitLineId = relationId(receiving.purchase_order_line_id, "purchase_order_product_id");
    if (explicitLineId) return explicitLineId;

    const productId = relationId(receiving.product_id, "product_id");
    if (!productId) return null;

    const matchingLines = purchaseOrderLines.filter(line =>
        relationId(line.product_id, "product_id") === productId
    );
    return matchingLines.length === 1
        ? relationId(matchingLines[0].purchase_order_product_id, "purchase_order_product_id")
        : null;
}

export function summarizeReceivingHistory(
    receivingRows: readonly ReceivingHistoryReference[],
    purchaseOrderLines: readonly PurchaseOrderLineReference[]
): {
    byLine: Map<number, ReceivingHistoryTotals>;
    unresolvedRows: ReceivingHistoryReference[];
} {
    const byLine = new Map<number, ReceivingHistoryTotals>();
    const unresolvedRows: ReceivingHistoryReference[] = [];

    for (const receiving of receivingRows) {
        if (receiving.is_replacement === true || Number(receiving.is_replacement) === 1) continue;
        const lineId = resolvePurchaseOrderLineId(receiving, purchaseOrderLines);
        if (!lineId) {
            unresolvedRows.push(receiving);
            continue;
        }
        const totals = byLine.get(lineId) || { received: 0, rejected: 0 };
        totals.received += Math.max(0, Number(receiving.received_quantity || 0));
        totals.rejected += Math.max(0, Number(receiving.quantity_rejected || 0));
        byLine.set(lineId, totals);
    }

    return { byLine, unresolvedRows };
}
