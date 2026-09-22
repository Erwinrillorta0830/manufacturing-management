import type { VersionOverheadItem, VersionPosition } from "../../finished-goods-master/types";
import { calculateDirectLaborCost } from "../../finished-goods-master/costing";
import { calculateEffectiveBatchMultiplier } from "./production-timing";

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
    position_name?: string;
    category?: "direct_labor" | "maintenance";
    manpower_count?: number | string;
    hourly_rate?: number | string;
    hours_required?: number | string;
    daily_rate?: number | string;
    ot_hours?: number | string;
    include_mandates?: boolean;
    sss_amount?: number | string;
    phic_amount?: number | string;
    hdmf_amount?: number | string;
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
    fixedOverheadCostPerUnit: number;
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
    laborPositions: LaborPositionCosting[] = [],
    overheadItems: VersionOverheadItem[] = []
): UnitCOGSBreakdown {
    const baseQty = Number(baseQuantity);
    if (!Number.isFinite(baseQty) || baseQty <= 0) {
        throw new Error("Recipe base quantity must be greater than zero.");
    }
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

    // 2. Direct Labor Cost per Unit, including the configured statutory
    // benefit allowance used by the finished-goods costing rules.
    const normalizedLaborPositions: VersionPosition[] = laborPositions.map((position) => ({
        position_name: position.position_name || "Operator",
        category: position.category === "maintenance" ? "maintenance" : "direct_labor",
        manpower_count: position.manpower_count ?? 0,
        hourly_rate: position.hourly_rate ?? 0,
        hours_required: position.hours_required,
        daily_rate: position.daily_rate,
        ot_hours: position.ot_hours,
        include_mandates: position.include_mandates,
        sss_amount: position.sss_amount,
        phic_amount: position.phic_amount,
        hdmf_amount: position.hdmf_amount
    }));
    const directLaborCostPerUnit = calculateDirectLaborCost(normalizedLaborPositions, baseQty);

    // 3. Factory Overhead Cost per Unit. Runtime is scaled by each route's
    // configured batch size, while active version overheads are authoritative.
    const totalMachineOverhead = routeSteps.reduce((sum, step) => {
        const hourlyRate = Math.max(0, Number(step.work_center_overhead_cost_per_hour || 0));
        const stepBatchSize = Number(step.step_batch_size);
        if (!Number.isFinite(stepBatchSize) || stepBatchSize <= 0) {
            throw new Error(`Routing step ${Number(step.sequence_order || 0) || ""} batch size must be greater than zero.`);
        }
        const setupHours = Math.max(0, Number(step.setup_time_hours || 0));
        const runHours = Math.max(0, Number(step.run_time_hours || 0));
        const machineHours = setupHours
            + (calculateEffectiveBatchMultiplier(baseQty, stepBatchSize) * runHours);
        return sum + (hourlyRate * machineHours);
    }, 0);
    const machineOverheadCostPerUnit = totalMachineOverhead / baseQty;
    const activeOverheadItems = overheadItems.filter((item) => item.is_active !== false);
    const configuredFixedOverhead = activeOverheadItems.reduce(
        (sum, item) => sum + Math.max(0, Number(item.cost_per_unit || 0)),
        0
    );
    const customOverheadCostPerUnit = activeOverheadItems.length > 0
        ? configuredFixedOverhead
        : Math.max(0, Number(customOverhead || 0));
    const fixedOverheadCostPerUnit = customOverheadCostPerUnit;
    const factoryOverheadCostPerUnit = machineOverheadCostPerUnit + fixedOverheadCostPerUnit;
    const hasCustomOverhead = fixedOverheadCostPerUnit > 0;

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
        fixedOverheadCostPerUnit,
        hasCustomOverhead,
        baseUnitCOGS,
        adjustedUnitCOGS,
        targetSellingPrice,
        grossMarginAmount,
        grossMarginPercentage
    };
}
