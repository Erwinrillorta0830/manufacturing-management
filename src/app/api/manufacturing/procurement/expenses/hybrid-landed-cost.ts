import { calculateLandedCost } from "@/modules/manufacturing-management/procurement/landed-cost-calculation";
import type { PurchaseOrderCategoryType } from "../_category-type";

export interface HybridAllocationLineItem {
    key: number;
    category_type: PurchaseOrderCategoryType;
    quantity: number;
    baseUnitCostPhp: number;
    lineGrossWeightKg: number;
}

export interface HybridAllocationItemResult {
    allocatedExpense: number;
    finalLandedUnitCost: number;
}

export type HybridAllocationResult = Map<number, HybridAllocationItemResult>;

export function calculateHybridLandedCostAllocation(
    lineItems: HybridAllocationLineItem[],
    totalLandedFee: number
): HybridAllocationResult {
    const calculation = calculateLandedCost(
        lineItems.map(item => ({
            key: item.key,
            category_type: item.category_type,
            quantity: item.quantity,
            baseUnitCostPhp: item.baseUnitCostPhp,
            lineGrossWeightKg: item.lineGrossWeightKg,
            volume: 0
        })),
        totalLandedFee,
        "Hybrid"
    );

    return new Map(calculation.lines.map(line => [line.key, {
        allocatedExpense: line.allocatedExpense,
        finalLandedUnitCost: line.finalLandedUnitCost
    }]));
}
