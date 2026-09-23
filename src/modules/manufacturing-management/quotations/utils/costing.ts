// VOS ERP - Quotations Module Costing Engine
// Duplicated from Finished Goods Master standard costing formulations

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

export interface VersionPosition {
    id?: number | string;
    version_id?: number;
    position_id?: number | null;
    position_name: string;
    category?: "direct_labor" | "maintenance";
    manpower_count: number | string;
    hourly_rate: number | string;
    hours_required?: number | string;
    daily_rate?: number | string;
    ot_hours?: number | string;
    include_mandates?: boolean;
    sss_amount?: number | string;
    phic_amount?: number | string;
    hdmf_amount?: number | string;
}

export interface CostingBreakdown {
    baseQuantity: number;
    unitCost: number;
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

    // Direct Production Line Labor calculation matching Finished Goods Master:
    const wageCost = dailyRate > 0
        ? dailyRate * (headcount + otHours)
        : hourlyRate * ((hoursRequired > 0 ? hoursRequired : 8) * headcount + otHours);

    // Statutory Benefits Allowance (SSS 9.54%, PHIC 200/26 = ~7.69, HDMF 100/26 = ~3.85)
    let benefitsCost = 0;
    if (pos.include_mandates !== false) {
        const configuredSss = Number(pos.sss_amount);
        const configuredPhic = Number(pos.phic_amount);
        const configuredHdmf = Number(pos.hdmf_amount);
        const sss = Number.isFinite(configuredSss) && configuredSss > 0 ? configuredSss : (dailyRate * 0.0954);
        const phic = Number.isFinite(configuredPhic) && configuredPhic > 0 ? configuredPhic : (200 / 26);
        const hdmf = Number.isFinite(configuredHdmf) && configuredHdmf > 0 ? configuredHdmf : (100 / 26);
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

/**
 * Calculates the exact yield-adjusted Standard COGS per unit given the full BOM version details
 * mirroring the exact logic in Finished Goods Master (FinishedGoodsModule.tsx).
 */
export function calculateProductVersionCOGS(
    versionData: Record<string, unknown>,
    workCenters: Array<{ work_center_id: number; overhead_cost_per_hour?: number | null }> = []
): number {
    const baseQuantity = Number(versionData.base_quantity) > 0 ? Number(versionData.base_quantity) : 1;
    const routes = (Array.isArray(versionData.routes) ? versionData.routes : []) as Array<Record<string, unknown>>;
    const laborPositions = (Array.isArray(versionData.labor_positions) ? versionData.labor_positions : []) as VersionPosition[];

    let materialsCost = 0;
    let machineOverheadCost = 0;
    let machineHours = 0;
    let lineElapsedHours = 0;
    let totalMachineCost = 0;

    routes.forEach(route => {
        const stepDur = (Number(route.setup_time_hours) || 0) + (Number(route.run_time_hours) || 0);
        if (stepDur > lineElapsedHours) {
            lineElapsedHours = stepDur;
        }

        const wcId = Number(route.work_center_id || 0);
        const workCenter = workCenters.find(wc => Number(wc.work_center_id) === wcId);
        const machineHourlyRate = workCenter ? Number(workCenter.overhead_cost_per_hour || 0) : 0;

        const bomItems = (Array.isArray(route.bom_items) ? route.bom_items : []) as Array<Record<string, unknown>>;
        const routeBreakdown = calculateRouteBreakdown({
            stepBatchSize: Number(route.step_batch_size) || 1,
            machineHourlyRate,
            setupTimeHours: Number(route.setup_time_hours) || 0,
            runTimeHours: Number(route.run_time_hours) || 0,
            baseQuantity,
            materials: bomItems.map(item => ({
                quantity: Number(item.quantity_required ?? item.quantity ?? 0),
                unitCost: Number(item.cost_per_unit ?? item.landedCost ?? item.unitCost ?? 0),
                wastagePercent: Number(item.wastage_factor_percentage ?? item.wastagePercent ?? 0)
            }))
        });

        materialsCost += routeBreakdown.materialsCost;
        machineOverheadCost += routeBreakdown.machineOverheadCost;
        machineHours += routeBreakdown.machineHours;
        totalMachineCost += routeBreakdown.totalMachineCost;
    });

    const directLaborCost = calculateDirectLaborCost(laborPositions, baseQuantity);

    const breakdown = calculateCostBreakdown({
        materialsCost,
        directLaborCost,
        machineOverheadCost,
        customOverheadCost: Number(versionData.custom_overhead) || 0,
        expectedYieldPercentage: Number(versionData.expected_yield_percentage) || 100,
        baseQuantity,
        machineHours,
        lineElapsedHours,
        totalMachineCost,
        laborPositions
    });

    return breakdown.unitCost;
}

