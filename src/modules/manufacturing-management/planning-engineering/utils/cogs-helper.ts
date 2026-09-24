import type { VersionOverheadItem, VersionPosition } from "../../finished-goods-master/types";
import {
    calculateDirectLaborCost,
    calculateMaterialCost,
    calculateRouteBreakdown
} from "../../finished-goods-master/costing";
import { DecimalValue } from "../../decimal";

export const MANUFACTURING_MONEY_DECIMAL_SCALE = 2;
export const MANUFACTURING_UNIT_COST_DECIMAL_SCALE = 4;

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

export type FactoryOverheadBasis = "VERSION_OVERHEAD" | "CUSTOM_OVERHEAD" | "WORK_CENTER_RUNTIME";

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
    factoryOverheadBasis: FactoryOverheadBasis;
    baseUnitCOGS: number;
    adjustedUnitCOGS: number;
    targetSellingPrice?: number;
    grossMarginAmount?: number;
    grossMarginPercentage?: number;
}

/**
 * Manufacturing material costs are currency values. Keep the unit cost and
 * every derived material total on the same two-decimal, half-up boundary.
 */
export function roundManufacturingMoney(value: number | string | null | undefined): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Number(
        DecimalValue.from(parsed)
            .round(MANUFACTURING_MONEY_DECIMAL_SCALE)
            .toFixed(MANUFACTURING_MONEY_DECIMAL_SCALE)
    );
}

export function formatManufacturingMoney(value: number | string | null | undefined): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return DecimalValue.from(0).toFixed(MANUFACTURING_MONEY_DECIMAL_SCALE);
    return DecimalValue.from(parsed).toFixed(MANUFACTURING_MONEY_DECIMAL_SCALE);
}

export function roundManufacturingUnitCost(value: number | string | null | undefined): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Number(
        DecimalValue.from(parsed)
            .round(MANUFACTURING_UNIT_COST_DECIMAL_SCALE)
            .toFixed(MANUFACTURING_UNIT_COST_DECIMAL_SCALE)
    );
}

export function calculateMaterialSpend(
    materialCostPerUnit: number | string | null | undefined,
    quantity: number | string | null | undefined
): number {
    const cost = Number(materialCostPerUnit);
    const amount = Number(quantity);
    if (!Number.isFinite(cost) || cost < 0) {
        throw new Error("Material cost per unit must be a non-negative number.");
    }
    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Material quantity must be a non-negative number.");
    }

    return Number(
        DecimalValue.from(roundManufacturingMoney(cost))
            .multiply(amount)
            .round(MANUFACTURING_MONEY_DECIMAL_SCALE)
            .toFixed(MANUFACTURING_MONEY_DECIMAL_SCALE)
    );
}

/**
 * BOM quantities used by the planning wizard are per finished unit. Match the
 * finished-goods master material-cost rule for wastage without dividing by
 * recipe batch size.
 */
export function calculateRecipeMaterialCostPerUnit(bomItems: RouteBOMCosting[]): number {
    return bomItems.reduce((sum, item) => sum + calculateMaterialCost({
        quantity: Number(item.quantity_required || 0),
        unitCost: Number(item.cost_per_unit || 0),
        wastagePercent: Number(item.wastage_factor_percentage || 0)
    }), 0);
}

export function calculateUnitCOGSBreakdown(
    baseQuantity: number,
    expectedYieldPercentage: number | undefined,
    customOverhead: number | undefined,
    bomItems: RouteBOMCosting[],
    routeSteps: RouteStepCosting[],
    targetSellingPrice?: number,
    laborPositions: LaborPositionCosting[] = [],
    overheadItems: VersionOverheadItem[] = [],
    materialCostPerUnit?: number | null
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
    const resolvedMaterialCost = Number(materialCostPerUnit);
    const directMaterialCostPerUnit = roundManufacturingUnitCost(
        Number.isFinite(resolvedMaterialCost) && resolvedMaterialCost >= 0
            ? resolvedMaterialCost
            : calculateRecipeMaterialCostPerUnit(bomItems)
    );

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

    // 3. Factory overhead is additive: route runtime overhead and configured
    // version/custom overhead are distinct cost components.
    const machineOverheadCostPerUnit = routeSteps.reduce((sum, step) => {
        const routeCost = calculateRouteBreakdown({
            machineHourlyRate: Number(step.work_center_overhead_cost_per_hour || 0),
            stepBatchSize: step.step_batch_size,
            setupTimeHours: Number(step.setup_time_hours || 0),
            runTimeHours: Number(step.run_time_hours || 0),
            baseQuantity: baseQty
        });
        return sum + routeCost.machineOverheadCost;
    }, 0);
    const activeOverheadItems = overheadItems.filter((item) => item.is_active !== false);
    const configuredFixedOverhead = activeOverheadItems.reduce(
        (sum, item) => sum + Math.max(0, Number(item.cost_per_unit || 0)),
        0
    );
    const customOverheadCostPerUnit = activeOverheadItems.length > 0
        ? configuredFixedOverhead
        : Math.max(0, Number(customOverhead || 0));
    const fixedOverheadCostPerUnit = customOverheadCostPerUnit;
    const factoryOverheadBasis: FactoryOverheadBasis = activeOverheadItems.length > 0
        ? "VERSION_OVERHEAD"
        : fixedOverheadCostPerUnit > 0
            ? "CUSTOM_OVERHEAD"
            : "WORK_CENTER_RUNTIME";
    const factoryOverheadCostPerUnit = machineOverheadCostPerUnit + fixedOverheadCostPerUnit;
    const hasCustomOverhead = factoryOverheadBasis !== "WORK_CENTER_RUNTIME";

    // 4. Total COGS calculation
    const unroundedBaseUnitCOGS = DecimalValue.from(directMaterialCostPerUnit)
        .add(directLaborCostPerUnit)
        .add(machineOverheadCostPerUnit)
        .add(fixedOverheadCostPerUnit);
    const baseUnitCOGS = roundManufacturingUnitCost(
        unroundedBaseUnitCOGS.toFixed(MANUFACTURING_UNIT_COST_DECIMAL_SCALE + 8)
    );
    const adjustedUnitCOGS = roundManufacturingUnitCost(
        unroundedBaseUnitCOGS.divideRounded(yieldFactor, MANUFACTURING_UNIT_COST_DECIMAL_SCALE + 8)
            .toFixed(MANUFACTURING_UNIT_COST_DECIMAL_SCALE + 8)
    );

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
        materialCostPerUnit: directMaterialCostPerUnit,
        directLaborCostPerUnit,
        factoryOverheadCostPerUnit,
        machineOverheadCostPerUnit,
        customOverheadCostPerUnit,
        fixedOverheadCostPerUnit,
        hasCustomOverhead,
        factoryOverheadBasis,
        baseUnitCOGS,
        adjustedUnitCOGS,
        targetSellingPrice,
        grossMarginAmount,
        grossMarginPercentage
    };
}

export function getFactoryOverheadBasisLabel(basis: FactoryOverheadBasis): string {
    switch (basis) {
        case "VERSION_OVERHEAD":
            return "Configured version overhead";
        case "CUSTOM_OVERHEAD":
            return "Custom overhead fallback";
        default:
            return "No configured fixed overhead";
    }
}
