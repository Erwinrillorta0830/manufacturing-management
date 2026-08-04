import { VersionPosition } from "./types";

export interface CostingMaterialInput {
    quantity: number;
    unitCost: number;
    wastagePercent?: number | null;
    isByProduct?: boolean;
}

export interface CostingRouteInput {
    machineHourlyRate: number;
    stepBatchSize?: number | null;
    setupTimeHours: number;
    runTimeHours: number;
    baseQuantity: number;
    materials?: CostingMaterialInput[];
}

export interface CostingRouteBreakdown {
    materialsCost: number;
    machineHours: number;
    totalMachineCost: number;
    machineOverheadCost: number;
    machineCostPerUnit: number;
    stepBatchSize: number;
    totalCost: number;
}

export interface CostingBreakdown {
    baseQuantity: number;
    /** Yield-adjusted cost for one finished unit. */
    unitCost: number;
    /** Yield-adjusted cost for the configured base batch. */
    batchCost: number;
    materialsCost: number;
    directLaborCost: number;
    machineOverheadCost: number;
    machineHours: number;
    lineElapsedHours: number;
    totalMachineCost: number;
    customOverheadCost: number;
    preYieldDirectCost: number;
    yieldAdjustedUnitCost: number;
    yieldPercentage: number;
    yieldFactor: number;
    totalBaseCost: number;
}

export interface OverheadSummary {
    customOverhead: number;
    additionalOperatingOverhead: number;
    totalOverheadExpenses: number;
    includedInCogs: number;
    excludedFromCogs: number;
}

export interface MarginSummary {
    grossProfit: number;
    grossMarginPercent: number;
    netProfit: number;
    netMarginPercent: number;
    marginBasis: "sales";
}

export function calculateMaterialCost(input: CostingMaterialInput): number {
    const quantity = Number(input.quantity) || 0;
    const unitCost = Number(input.unitCost) || 0;
    const wastagePercent = Number(input.wastagePercent) || 0;
    const usableFactor = 1 - (wastagePercent / 100);
    const cost = (quantity * unitCost) / (usableFactor > 0 ? usableFactor : 1);

    return input.isByProduct ? -Math.abs(cost) : cost;
}

export function calculateRouteBreakdown(input: CostingRouteInput): CostingRouteBreakdown {
    const baseQuantity = Number(input.baseQuantity) > 0 ? Number(input.baseQuantity) : 1;
    const stepBatchSize = Number(input.stepBatchSize) > 0 ? Number(input.stepBatchSize) : 1;
    const setupHours = Math.max(0, Number(input.setupTimeHours) || 0);
    const runHours = Math.max(0, Number(input.runTimeHours) || 0);
    const machineHourlyRate = Math.max(0, Number(input.machineHourlyRate) || 0);

    const machineHours = setupHours + runHours;
    const totalMachineCost = machineHours * machineHourlyRate;
    const machineCostPerUnit = totalMachineCost / baseQuantity;

    const totalMaterialCostSum = (input.materials || []).reduce(
        (total, material) => total + calculateMaterialCost(material),
        0
    );
    const materialsCost = (totalMaterialCostSum > 500 && baseQuantity > 50)
        ? totalMaterialCostSum / baseQuantity
        : totalMaterialCostSum;
    const machineOverheadCost = machineCostPerUnit;

    return {
        materialsCost,
        machineHours,
        totalMachineCost,
        machineOverheadCost,
        machineCostPerUnit,
        stepBatchSize,
        totalCost: machineCostPerUnit
    };
}

export function calculatePositionBatchCost(pos: VersionPosition): number {
    const headcount = Math.max(0, Number(pos.manpower_count) || 0);
    const hourlyRate = Math.max(0, Number(pos.hourly_rate) || 0);
    const dailyRate = Math.max(0, Number(pos.daily_rate) || (hourlyRate * 8) || 0);
    const otHours = Math.max(0, Number(pos.ot_hours) || 0);
    const hoursRequired = Math.max(0, Number(pos.hours_required) || 0);

    if (pos.category === "maintenance") {
        return headcount * (dailyRate > 0 ? dailyRate : hourlyRate * (hoursRequired > 0 ? hoursRequired : 1));
    }

    // Direct Production Line Labor calculation matching Excel MPB454G:
    // Base Wage & OT Cost = Daily Rate * (Headcount + OT Hours)
    const wageCost = dailyRate > 0
        ? dailyRate * (headcount + otHours)
        : hourlyRate * ((hoursRequired > 0 ? hoursRequired : 8) * headcount + otHours);

    // Statutory Benefits Allowance (SSS 9.54%, PHIC 200/26 = ~7.69, HDMF 100/26 = ~3.85)
    let benefitsCost = 0;
    if (pos.include_mandates !== false) {
        const sss = Number(pos.sss_amount) || (dailyRate * 0.0954);
        const phic = Number(pos.phic_amount) || (200 / 26);
        const hdmf = Number(pos.hdmf_amount) || (100 / 26);
        benefitsCost = (sss + phic + hdmf) * headcount;
    }

    return wageCost + benefitsCost;
}

export function calculateDirectLaborCost(
    laborPositions?: VersionPosition[] | null,
    baseQuantity: number = 1
): number {
    if (!laborPositions || laborPositions.length === 0) return 0;
    const baseQty = Number(baseQuantity) > 0 ? Number(baseQuantity) : 1;
    const totalLabor = laborPositions.reduce((total, pos) => {
        return total + calculatePositionBatchCost(pos);
    }, 0);
    return totalLabor / baseQty;
}

export function calculateCostBreakdown(input: {
    materialsCost: number;
    directLaborCost?: number | null;
    machineOverheadCost: number;
    customOverheadCost?: number | null;
    expectedYieldPercentage?: number | null;
    baseQuantity?: number | null;
    machineHours?: number | null;
    lineElapsedHours?: number | null;
    totalMachineCost?: number | null;
    laborPositions?: VersionPosition[] | null;
}): CostingBreakdown {
    const baseQuantity = Number(input.baseQuantity) > 0 ? Number(input.baseQuantity) : 1;
    const materialsCost = Number(input.materialsCost) || 0;
    const computedLaborCost = input.laborPositions && input.laborPositions.length > 0
        ? calculateDirectLaborCost(input.laborPositions, baseQuantity)
        : Number(input.directLaborCost) || 0;
    const directLaborCost = computedLaborCost;
    const machineOverheadCost = Number(input.machineOverheadCost) || 0;
    const customOverheadCost = Math.max(0, Number(input.customOverheadCost) || 0);
    const yieldPercentage = Number(input.expectedYieldPercentage) > 0
        ? Number(input.expectedYieldPercentage)
        : 100;
    const yieldFactor = yieldPercentage / 100;
    const preYieldDirectCost = materialsCost + directLaborCost + machineOverheadCost + customOverheadCost;
    const yieldAdjustedUnitCost = preYieldDirectCost / (yieldFactor > 0 ? yieldFactor : 1);
    const batchCost = yieldAdjustedUnitCost * baseQuantity;

    return {
        baseQuantity,
        unitCost: yieldAdjustedUnitCost,
        batchCost,
        materialsCost,
        directLaborCost,
        machineOverheadCost,
        machineHours: Math.max(0, Number(input.machineHours) || 0),
        lineElapsedHours: Math.max(0, Number(input.lineElapsedHours) || 0),
        totalMachineCost: Math.max(0, Number(input.totalMachineCost) || 0),
        customOverheadCost,
        preYieldDirectCost,
        yieldAdjustedUnitCost,
        yieldPercentage,
        yieldFactor,
        totalBaseCost: batchCost
    };
}

export function calculateOverheadSummary(
    customOverheadCost: number,
    additionalOverheadAmounts: number[] = []
): OverheadSummary {
    const customOverhead = Math.max(0, Number(customOverheadCost) || 0);
    const additionalOperatingOverhead = additionalOverheadAmounts.reduce(
        (total, amount) => total + Math.max(0, Number(amount) || 0),
        0
    );

    return {
        customOverhead,
        additionalOperatingOverhead,
        totalOverheadExpenses: customOverhead + additionalOperatingOverhead,
        includedInCogs: customOverhead,
        excludedFromCogs: additionalOperatingOverhead
    };
}

export function calculateMarginSummary(
    sellingPrice: number,
    cogs: number,
    excludedOperatingOverhead: number = 0
): MarginSummary {
    const price = Number(sellingPrice) || 0;
    const cost = Number(cogs) || 0;
    const operatingOverhead = Math.max(0, Number(excludedOperatingOverhead) || 0);
    const grossProfit = price - cost;
    const netProfit = grossProfit - operatingOverhead;
    const marginPercent = (profit: number) => price > 0 ? (profit / price) * 100 : 0;

    return {
        grossProfit,
        grossMarginPercent: marginPercent(grossProfit),
        netProfit,
        netMarginPercent: marginPercent(netProfit),
        marginBasis: "sales"
    };
}
