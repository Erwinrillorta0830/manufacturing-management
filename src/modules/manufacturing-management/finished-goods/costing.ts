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

export interface BottleneckStepCapacity {
    stepIndex: number;
    stepNum: number;
    operationName?: string;
    workCenterName?: string;
    stepBatchSize: number;
    totalHours: number;
    calculatedRate: number;
    workCenterCapacity?: number | null;
    hourlyRate: number;
    isCapped: boolean;
}

export interface BottleneckCalculationResult {
    bottleneckRate: number;
    bottleneckStepIndex: number;
    averageRate: number;
    stepCapacities: BottleneckStepCapacity[];
    netProductionHours: number;
    grossOutput: number;
    computedBaseQuantity: number;
    cappedSteps: BottleneckStepCapacity[];
}

export function calculateNetRunTime(
    shiftHours: number = 18,
    shiftMinutes: number = 0,
    downtimeMinutes: number = 16,
    downtimeSeconds: number = 7
): {
    shiftDecimalHours: number;
    downtimeDecimalHours: number;
    netProductionHours: number;
} {
    const shiftDecimalHours = Math.max(0, Number(shiftHours) || 0) + (Math.max(0, Number(shiftMinutes) || 0) / 60);
    const downtimeDecimalHours = (Math.max(0, Number(downtimeMinutes) || 0) / 60) + (Math.max(0, Number(downtimeSeconds) || 0) / 3600);
    const netProductionHours = Math.max(0, shiftDecimalHours - downtimeDecimalHours);
    return {
        shiftDecimalHours,
        downtimeDecimalHours,
        netProductionHours
    };
}

export function calculateBottleneckBaseQuantity(input: {
    routes: Array<{
        work_center_id?: number | null;
        operation_id?: number | null;
        step_batch_size?: number | null;
        setup_time_hours?: number | null;
        run_time_hours?: number | null;
        operation?: { operation_name?: string } | null;
        work_center?: { work_center_name?: string; capacity_per_hour?: number | null } | null;
    }>;
    workCenters?: Array<{ work_center_id: number; work_center_name?: string; capacity_per_hour?: number | null }>;
    operationTypes?: Array<{ id: number; operation_name: string }>;
    shiftHours?: number;
    shiftMinutes?: number;
    downtimeMinutes?: number;
    downtimeSeconds?: number;
    expectedYieldPercentage?: number | null;
}): BottleneckCalculationResult {
    const routes = input.routes || [];
    const stepCapacities: BottleneckStepCapacity[] = routes.map((r, index) => {
        const stepBatchSize = Math.max(0.0001, Number(r.step_batch_size) || 1);
        const totalHours = Math.max(0.0001, (Number(r.setup_time_hours) || 0) + (Number(r.run_time_hours) || 0));
        const calculatedRate = stepBatchSize / totalHours;

        // Option 3: Check Work Center rated capacity ceiling
        const matchedWc = input.workCenters?.find(wc => Number(wc.work_center_id) === Number(r.work_center_id)) || r.work_center;
        const matchedOp = input.operationTypes?.find(op => Number(op.id) === Number(r.operation_id));
        const wcCap = Number(matchedWc?.capacity_per_hour);
        const hasWcCap = Number.isFinite(wcCap) && wcCap > 0;

        let hourlyRate = calculatedRate;
        let isCapped = false;
        if (hasWcCap && calculatedRate > wcCap) {
            hourlyRate = wcCap;
            isCapped = true;
        }

        return {
            stepIndex: index,
            stepNum: index + 1,
            operationName: matchedOp?.operation_name || r.operation?.operation_name || `Step #${index + 1}`,
            workCenterName: matchedWc?.work_center_name || r.work_center?.work_center_name || "Work Center",
            stepBatchSize,
            totalHours,
            calculatedRate,
            workCenterCapacity: hasWcCap ? wcCap : null,
            hourlyRate,
            isCapped
        };
    });

    let bottleneckRate = 0;
    let bottleneckStepIndex = -1;
    if (stepCapacities.length > 0) {
        bottleneckRate = stepCapacities[0].hourlyRate;
        bottleneckStepIndex = 0;
        for (let i = 1; i < stepCapacities.length; i++) {
            if (stepCapacities[i].hourlyRate < bottleneckRate) {
                bottleneckRate = stepCapacities[i].hourlyRate;
                bottleneckStepIndex = i;
            }
        }
    }

    const totalRates = stepCapacities.reduce((sum, s) => sum + s.hourlyRate, 0);
    const averageRate = stepCapacities.length > 0 ? totalRates / stepCapacities.length : 0;

    const { netProductionHours } = calculateNetRunTime(
        input.shiftHours ?? 18,
        input.shiftMinutes ?? 0,
        input.downtimeMinutes ?? 16,
        input.downtimeSeconds ?? 7
    );

    const grossOutput = bottleneckRate * netProductionHours;
    const yieldPct = Number(input.expectedYieldPercentage) > 0 ? Number(input.expectedYieldPercentage) : 100;
    const computedBaseQuantity = grossOutput * (yieldPct / 100);
    const cappedSteps = stepCapacities.filter(s => s.isCapped);

    return {
        bottleneckRate,
        bottleneckStepIndex,
        averageRate,
        stepCapacities,
        netProductionHours,
        grossOutput,
        computedBaseQuantity,
        cappedSteps
    };
}
