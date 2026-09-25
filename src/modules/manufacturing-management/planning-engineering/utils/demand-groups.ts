import { isTerminalJobOrderStatus } from "../../job-order-status";
import type { SalesOrder, SalesOrderDetail, SalesOrderDemandGroup, SalesOrderReleaseGroup } from "../types";

export function remainingQuantity(line: SalesOrderDetail): number {
    const resolved = Number(line.remaining_quantity);
    if (Number.isFinite(resolved)) return Math.max(0, resolved);

    const ordered = Number(line.ordered_quantity || 0);
    const allocated = Number(line.allocated_quantity || 0);
    const served = Number(line.served_quantity || 0);
    const planned = Number(line.planned_quantity || 0);
    if (!Number.isFinite(ordered) || !Number.isFinite(allocated) || !Number.isFinite(served) || !Number.isFinite(planned)) {
        return 0;
    }
    return Math.max(0, ordered - Math.max(allocated, served) - Math.max(0, planned));
}

export function isSchedulableSalesOrderLine(line: SalesOrderDetail): boolean {
    return (line.parent_order_status === "For Production" || line.parent_order_status === "In Production")
        && remainingQuantity(line) > 0
        && (!line.linkedJobOrders || line.linkedJobOrders.every((jobOrder) => isTerminalJobOrderStatus(jobOrder.status)));
}

export function canCreateReplacementJobOrder(line: SalesOrderDetail): boolean {
    return line.parent_order_status === "In Production"
        && Boolean(line.linkedJobOrders?.some((jobOrder) => jobOrder.isTerminated))
        && isSchedulableSalesOrderLine(line);
}

export function buildSalesOrderDemandGroups(
    salesOrders: SalesOrder[],
    detailsMap: Record<number, SalesOrderDetail[]>,
    branchId: number | null
): SalesOrderDemandGroup[] {
    if (branchId === null) return [];

    return [...salesOrders]
        .filter((order) => Number(order.branch_id) === Number(branchId))
        .map((order) => {
            const lines = detailsMap[order.order_id] || [];
            return {
                order,
                lines,
                selectableLines: lines.filter(isSchedulableSalesOrderLine)
            };
        })
        .filter((group) => group.lines.length > 0);
}

export function buildSalesOrderReleaseGroups(lines: SalesOrderDetail[]): SalesOrderReleaseGroup[] {
    const groups = new Map<string, SalesOrderReleaseGroup>();

    for (const line of lines) {
        const productId = Number(line.product_id?.product_id || 0);
        const bomVersionId = Number(line.bom_version_id || 0);
        if (!productId || !bomVersionId) continue;

        const key = `${productId}:${bomVersionId}`;
        const existing = groups.get(key);
        if (existing) {
            existing.lines.push(line);
            existing.totalRemainingQuantity += remainingQuantity(line);
            if (!existing.salesOrderIds.includes(line.order_id)) existing.salesOrderIds.push(line.order_id);
            existing.salesOrderDetailIds.push(line.detail_id);
            continue;
        }

        groups.set(key, {
            key,
            productId,
            productName: line.product_id.product_name,
            bomVersionId,
            bomVersionName: line.bom_version_name || "Default",
            lines: [line],
            totalRemainingQuantity: remainingQuantity(line),
            salesOrderIds: [line.order_id],
            salesOrderDetailIds: [line.detail_id]
        });
    }

    return [...groups.values()];
}
