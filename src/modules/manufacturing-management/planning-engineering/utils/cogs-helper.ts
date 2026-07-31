export interface RouteStepCosting {
    sequence_order?: number;
    work_center_id?: number;
    setup_time_hours?: number;
    run_time_hours?: number;
    step_batch_size?: number;
    work_center_overhead_cost_per_hour?: number;
}

export interface RouteBOMCosting {
    quantity_required: number;
    wastage_factor_percentage?: number;
    cost_per_unit: number;
}

export interface UnitCOGSBreakdown {
    baseQuantity: number;
    expectedYieldPercentage: number;
    yieldFactor: number;
    materialCostPerUnit: number;
    directLaborCostPerUnit: number;
    factoryOverheadCostPerUnit: number;
    isCustomLaborOverride: boolean;
    baseUnitCOGS: number;
    adjustedUnitCOGS: number;
    targetSellingPrice?: number;
    grossMarginAmount?: number;
    grossMarginPercentage?: number;
}

export function calculateUnitCOGSBreakdown(
    baseQuantity: number,
    expectedYieldPercentage: number | undefined,
    customOverheadOverride: number | undefined,
    bomItems: RouteBOMCosting[],
    routeSteps: RouteStepCosting[],
    targetSellingPrice?: number
): UnitCOGSBreakdown {
    const baseQty = Math.max(1, baseQuantity || 1);
    const yieldPercent = (expectedYieldPercentage && expectedYieldPercentage > 0 && expectedYieldPercentage <= 100)
        ? expectedYieldPercentage
        : 100;
    const yieldFactor = yieldPercent / 100;

    // 1. Direct Materials & Packaging Cost per Unit
    const totalMaterialCost = bomItems.reduce((sum, item) => {
        const qty = Number(item.quantity_required || 0);
        const wastage = 1 + (Number(item.wastage_factor_percentage || 0) / 100);
        const unitCost = Number(item.cost_per_unit || 0);
        return sum + (qty * wastage * unitCost);
    }, 0);
    const materialCostPerUnit = totalMaterialCost / baseQty;

    // 2. Direct Labor Cost per Unit (Calculated from Work Center Operator Rates & Duration)
    const dynamicLaborCost = routeSteps.reduce((sum, step) => {
        const hourlyRate = Number(step.work_center_overhead_cost_per_hour || 0);
        const runHours = Number(step.run_time_hours || 0);
        const batchSize = Math.max(1, Number(step.step_batch_size || 1));
        return sum + (hourlyRate * (runHours / batchSize));
    }, 0) / baseQty;

    const fixedOverride = Number(customOverheadOverride || 0);
    const isCustomLaborOverride = fixedOverride > 0;
    
    // Explicit separation: Direct Labor vs Factory Overhead
    const directLaborCostPerUnit = isCustomLaborOverride ? fixedOverride : dynamicLaborCost;
    const factoryOverheadCostPerUnit = isCustomLaborOverride ? 0 : Number(customOverheadOverride || 0);

    // 3. Total COGS calculation
    const baseUnitCOGS = materialCostPerUnit + directLaborCostPerUnit + factoryOverheadCostPerUnit;
    const adjustedUnitCOGS = baseUnitCOGS / yieldFactor;

    let grossMarginAmount: number | undefined;
    let grossMarginPercentage: number | undefined;

    if (targetSellingPrice && targetSellingPrice > 0) {
        grossMarginAmount = targetSellingPrice - adjustedUnitCOGS;
        grossMarginPercentage = (grossMarginAmount / targetSellingPrice) * 100;
    }

    return {
        baseQuantity: baseQty,
        expectedYieldPercentage: yieldPercent,
        yieldFactor,
        materialCostPerUnit,
        directLaborCostPerUnit,
        factoryOverheadCostPerUnit,
        isCustomLaborOverride,
        baseUnitCOGS,
        adjustedUnitCOGS,
        targetSellingPrice,
        grossMarginAmount,
        grossMarginPercentage
    };
}
