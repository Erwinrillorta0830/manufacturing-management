import { toStandardKg } from "./expenses-helper";

export interface HybridAllocationLineItem {
    key: number;
    category: string;
    quantity: number;
    baseUnitCost: number;
    weight: number;
    weightUnit?: string;
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
        if (item.category === "PKG" || item.category === "Packaging") {
            totalPKGValue += value;
            pkgItems.push(item);
        } else {
            // Default everything else to RM
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

    // Phase 2B: Allocate PKG Fee Pool to PKG line items proportionally by Gross Weight in KG.
    let totalPKGWeight = 0;
    for (const item of pkgItems) {
        const kg = toStandardKg(item.weight, item.weightUnit);
        if (kg <= 0 && item.quantity > 0) {
            throw new Error(`Packaging item (Line ID: ${item.key}) must have a non-zero weight for Hybrid allocation.`);
        }
        totalPKGWeight += kg * item.quantity;
    }
    for (const item of pkgItems) {
        let fee = 0;
        if (totalPKGWeight > 0) {
            const kg = toStandardKg(item.weight, item.weightUnit);
            fee = pkgFeePool * ((kg * item.quantity) / totalPKGWeight);
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
