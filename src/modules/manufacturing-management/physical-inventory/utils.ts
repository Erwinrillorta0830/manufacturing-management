import { PhysicalInventoryLineItem, CountSheetSummary, OffsetPairing } from "./types";

export function calculateCountSheetSummary(
    items: PhysicalInventoryLineItem[],
    offsetPairings: OffsetPairing[] = []
): CountSheetSummary {
    const totalItems = items.length;
    let totalSystemQty = 0;
    let totalPhysicalQty = 0;
    let netVarianceQty = 0;
    let netVarianceBaseQty = 0;
    let surplusItemsCount = 0;
    let deficitItemsCount = 0;
    let matchedItemsCount = 0;
    let uncountedItemsCount = 0;
    let totalSurplusCost = 0;
    let totalDeficitCost = 0;

    for (const item of items) {
        const sys = item.system_count || 0;
        totalSystemQty += sys;

        if (item.physical_count === null || item.physical_count === undefined) {
            uncountedItemsCount++;
            continue;
        }

        const phys = item.physical_count;
        totalPhysicalQty += phys;

        const factor = item.uom_factor || 1;
        const variance = item.variance !== undefined ? item.variance : (phys - sys);
        const varianceBase = item.variance_base !== undefined ? item.variance_base : (variance * factor);

        netVarianceQty += variance;
        netVarianceBaseQty += varianceBase;

        const price = item.unit_price || 0;
        const diffCost = item.difference_cost !== undefined ? item.difference_cost : (varianceBase * price);

        if (variance > 0.00001) {
            surplusItemsCount++;
            totalSurplusCost += diffCost;
        } else if (variance < -0.00001) {
            deficitItemsCount++;
            totalDeficitCost += Math.abs(diffCost);
        } else {
            matchedItemsCount++;
        }
    }

    let totalOffsetQty = 0;
    let totalOffsetImpact = 0;
    for (const pair of offsetPairings) {
        totalOffsetQty += pair.offset_qty || 0;
        totalOffsetImpact += pair.net_financial_impact || 0;
    }

    const netVarianceCost = totalSurplusCost - totalDeficitCost;
    const countedItemsCount = totalItems - uncountedItemsCount;

    return {
        totalItems,
        totalItemsCount: totalItems,
        countedItemsCount,
        totalSystemQty,
        totalPhysicalQty,
        netVarianceQty,
        netVarianceBaseQty,
        surplusItemsCount,
        deficitItemsCount,
        matchedItemsCount,
        uncountedItemsCount,
        totalSurplusCost,
        surplusVarianceCost: totalSurplusCost,
        totalDeficitCost,
        deficitVarianceCost: totalDeficitCost,
        netVarianceCost,
        totalOffsetQty,
        totalOffsetImpact
    };
}

export function formatCurrency(amount: number): string {
    const isNegative = amount < -0.00001;
    const absValue = Math.abs(amount);
    const formatted = new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(absValue);

    return isNegative ? `-${formatted}` : formatted;
}

export function formatDate(dateString?: string): string {
    if (!dateString) return "N/A";
    try {
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return dateString;
        return d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch {
        return dateString || "N/A";
    }
}
