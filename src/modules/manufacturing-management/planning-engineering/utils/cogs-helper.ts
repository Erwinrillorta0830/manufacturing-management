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

export interface LaborPositionCosting {
    manpower_count?: number;
    hourly_rate?: number;
    hours_required?: number;
}

export interface UnitCOGSBreakdown {
    baseQuantity: number;
    expectedYieldPercentage: number;
    yieldFactor: number;
    materialCostPerUnit: number;
    directLaborCostPerUnit: number;
    factoryOverheadCostPerUnit: number;
    machineOverheadCostPerUnit: number;
    customOverheadCostPerUnit: number;
    hasCustomOverhead: boolean;
    baseUnitCOGS: number;
    adjustedUnitCOGS: number;
    targetSellingPrice?: number;
    grossMarginAmount?: number;
    grossMarginPercentage?: number;
}

export function calculateUnitCOGSBreakdown(
    baseQuantity: number,
    expectedYieldPercentage: number | undefined,
    customOverhead: number | undefined,
    bomItems: RouteBOMCosting[],
    routeSteps: RouteStepCosting[],
    targetSellingPrice?: number,
    laborPositions: LaborPositionCosting[] = []
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

    // 2. Direct Labor Cost per Unit (BOM labor standard: manpower x hourly rate x hours)
    const totalLaborCost = laborPositions.reduce((sum, position) => {
        const manpower = Math.max(0, Number(position.manpower_count || 0));
        const hourlyRate = Math.max(0, Number(position.hourly_rate || 0));
        const hours = Math.max(0, Number(position.hours_required || 0));
        return sum + (manpower * hourlyRate * hours);
    }, 0);
    const directLaborCostPerUnit = totalLaborCost / baseQty;

    // 3. Factory Overhead Cost per Unit (work center machine rates plus the version custom overhead)
    const totalMachineOverhead = routeSteps.reduce((sum, step) => {
        const hourlyRate = Math.max(0, Number(step.work_center_overhead_cost_per_hour || 0));
        const machineHours = Math.max(0, Number(step.setup_time_hours || 0))
            + Math.max(0, Number(step.run_time_hours || 0));
        return sum + (hourlyRate * machineHours);
    }, 0);
    const machineOverheadCostPerUnit = totalMachineOverhead / baseQty;
    const customOverheadCostPerUnit = Math.max(0, Number(customOverhead || 0));
    const factoryOverheadCostPerUnit = machineOverheadCostPerUnit + customOverheadCostPerUnit;
    const hasCustomOverhead = customOverheadCostPerUnit > 0;

    // 4. Total COGS calculation
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
        machineOverheadCostPerUnit,
        customOverheadCostPerUnit,
        hasCustomOverhead,
        baseUnitCOGS,
        adjustedUnitCOGS,
        targetSellingPrice,
        grossMarginAmount,
        grossMarginPercentage
    };
}
