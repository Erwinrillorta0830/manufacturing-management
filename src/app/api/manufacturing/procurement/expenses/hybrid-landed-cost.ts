import { calculatePackagingWeightShares } from "@/modules/manufacturing-management/procurement/packaging-weight";
import type { PurchaseOrderCategoryType } from "../_category-type";

export interface HybridAllocationLineItem {
    key: number;
    category_type: PurchaseOrderCategoryType;
    quantity: number;
    baseUnitCost: number;
    lineGrossWeightKg: number;
}

export interface HybridAllocationItemResult {
    allocatedExpense: number;
    finalLandedUnitCost: number;
}

export type HybridAllocationResult = Map<number, HybridAllocationItemResult>;

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateHybridLandedCostAllocation(
    lineItems: HybridAllocationLineItem[],
    totalLandedFee: number
): HybridAllocationResult {
    const result: HybridAllocationResult = new Map();
    if (lineItems.length === 0) return result;
    for (const item of lineItems) {
        if (item.category_type !== "RAW_MATERIAL" && item.category_type !== "PACKAGING") {
            throw new Error(`Line ${item.key} must have Category_Type RAW_MATERIAL or PACKAGING for Hybrid allocation.`);
        }
    }
    if (totalLandedFee === 0) {
        for (const item of lineItems) {
            result.set(item.key, { allocatedExpense: 0, finalLandedUnitCost: item.baseUnitCost });
        }
        return result;
    }

    // Phase 1: Partition total landed fee pool into RM Fee Pool and PKG Fee Pool based on invoice commercial value share.
    let totalRMValue = 0;
    let totalPKGValue = 0;

    const rmItems: HybridAllocationLineItem[] = [];
    const pkgItems: HybridAllocationLineItem[] = [];

    for (const item of lineItems) {
        const value = item.quantity * item.baseUnitCost;
        if (item.category_type === "PACKAGING") {
            totalPKGValue += value;
            pkgItems.push(item);
        } else {
            totalRMValue += value;
            rmItems.push(item);
        }
    }
    
    const totalValue = totalRMValue + totalPKGValue;
    
    let rmFeePool = 0;
    let pkgFeePool = 0;

    if (totalValue > 0) {
        rmFeePool = totalLandedFee * (totalRMValue / totalValue);
        pkgFeePool = totalLandedFee * (totalPKGValue / totalValue);
    } else {
        const totalCount = lineItems.length;
        rmFeePool = totalLandedFee * (rmItems.length / totalCount);
        pkgFeePool = totalLandedFee * (pkgItems.length / totalCount);
    }

    const unroundedAllocations = new Map<number, number>();

    // Phase 2A: Allocate RM Fee Pool to RM line items proportionally by Unit Quantity.
    const totalRMQty = rmItems.reduce((sum, item) => sum + item.quantity, 0);
    for (const item of rmItems) {
        let fee = 0;
        if (totalRMQty > 0) {
            fee = rmFeePool * (item.quantity / totalRMQty);
        } else {
            fee = rmFeePool / rmItems.length;
        }
        unroundedAllocations.set(item.key, fee);
    }

    // Phase 2B: Allocate PKG Fee Pool by the already-derived line gross weight.
    // The product unit weight and line quantity are combined once by the caller.
    const packageWeightShares = calculatePackagingWeightShares(pkgItems.map(item => ({
        key: item.key,
        lineGrossWeightKg: item.lineGrossWeightKg
    })));
    for (const item of pkgItems) {
        if (item.lineGrossWeightKg <= 0 && item.quantity > 0) {
            throw new Error(`Packaging item (Line ID: ${item.key}) must have a non-zero weight for Hybrid allocation.`);
        }
    }
    for (const item of pkgItems) {
        let fee = 0;
        const weightShare = packageWeightShares.get(item.key) || 0;
        if (weightShare > 0) {
            fee = pkgFeePool * weightShare;
        } else {
            fee = pkgFeePool / pkgItems.length;
        }
        unroundedAllocations.set(item.key, fee);
    }

    // Phase 3 & 4: Rounding Cent Reconciliation
    let sumRoundedFees = 0;
    let maxVal = -1;
    let maxValKey = -1;

    for (const item of lineItems) {
        const val = item.quantity * item.baseUnitCost;
        if (val > maxVal) {
            maxVal = val;
            maxValKey = item.key;
        }
        const rounded = roundMoney(unroundedAllocations.get(item.key) || 0);
        sumRoundedFees += rounded;
        
        result.set(item.key, {
            allocatedExpense: rounded,
            finalLandedUnitCost: 0 // Calculated below
        });
    }

    // Reconciliation
    const diff = roundMoney(totalLandedFee - sumRoundedFees);
    if (diff !== 0 && maxValKey !== -1) {
        const current = result.get(maxValKey)!;
        current.allocatedExpense = roundMoney(current.allocatedExpense + diff);
    }

    // Calculate Added Unit Cost and Final Landed Unit Cost
    for (const item of lineItems) {
        const res = result.get(item.key)!;
        const addedUnitCost = item.quantity > 0 ? res.allocatedExpense / item.quantity : 0;
        res.finalLandedUnitCost = roundMoney(item.baseUnitCost + addedUnitCost);
    }

    return result;
}
