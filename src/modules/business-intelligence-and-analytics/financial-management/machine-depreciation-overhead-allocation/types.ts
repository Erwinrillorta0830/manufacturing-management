// Types for BIA Financial Management: Machine Depreciation Overhead Allocation Report

export type CalculationBasis = "STRAIGHT_LINE" | "UNITS_OF_PRODUCTION";

export interface ProductionAssetMaster {
    asset_id: number;
    item_id?: number | null;
    item_name: string;
    serial?: string | null;
    barcode?: string | null;
    rfid_code?: string | null;
    department_id?: number | null;
    department_name?: string | null;
    date_acquired?: string | null;
    depreciation_start_date?: string | null;
    depreciation_method: "Straight Line" | "Units of Production";
    acquisition_cost: number;
    residual_value: number;
    depreciable_amount: number;
    life_span?: number | null; // Useful life in years (SL)
    maximum_unit_produced_capacity?: number | null; // (UOP)
    production_unit_id?: number | null;
    production_unit?: string | null;
    production_unit_shortcut?: string | null;
    depreciation_per_unit?: number | null;
    production_units?: number;
    remaining_production_capacity?: number | null;
    production_depreciation?: number | null;
    // Linked Work Center
    work_center_id?: number | null;
    work_center_name?: string | null;
    current_work_center_rate?: number; // manufacturing_work_centers.overhead_cost_per_hour
    work_center_capacity_per_hour?: number | null;
}

export interface WorkCenterOption {
    work_center_id: number;
    work_center_name: string;
    asset_id?: number | null;
    overhead_cost_per_hour: number;
    capacity_per_hour?: number | null;
    is_active: boolean;
}

export interface MachineCapacityConfig {
    shifts_per_day: number;
    hours_per_shift: number;
    working_days_per_year: number;
    utilization_percent: number;
    // Computed
    annual_scheduled_hours: number;
    annual_productive_hours: number;
}

export interface MachineOverheadBurdenBreakdown {
    depreciation_burden_per_hour: number;
    power_assumption_per_hour: number;
    maintenance_assumption_per_hour: number;
    other_overhead_assumption_per_hour: number;
    total_burden_per_hour: number;
    variance_against_current: number;
}

export interface MachineDepreciationSummaryMetrics {
    total_production_assets: number;
    total_annual_depreciation: number;
    average_hourly_burden: number;
    assigned_work_centers_count: number;
    unassigned_assets_count: number;
}

export interface ReportFilters {
    period: string; // e.g. "2026-09"
    asset_type: string; // "Production" or "ALL"
    work_center_id: string; // "ALL" or string number
    asset_id: string; // "ALL" or string number
    search: string;
}

/**
 * Real-time costing impact simulation for routing steps utilizing a work center.
 * Strictly read-only simulation; does NOT alter BOM or routing records.
 */
export interface RoutingCostingImpact {
    route_id: number;
    sequence_order: number;
    operation_name: string;
    product_id: number;
    product_name: string;
    version_id: number;
    version_name: string;
    version_number?: string | null;
    work_center_id: number;
    work_center_name: string;
    setup_time_hours: number;
    run_time_hours: number;
    cycle_time_hours: number; // setup_time_hours + run_time_hours
    step_batch_size: number;
    current_overhead_cost_per_batch: number;
    current_overhead_cost_per_unit: number;
    simulated_overhead_cost_per_batch: number;
    simulated_overhead_cost_per_unit: number;
    cogm_variance_per_batch: number;
    cogm_variance_per_unit: number;
}

export interface WorkCenterImpactSummary {
    work_center_id: number;
    work_center_name: string;
    current_rate: number;
    calculated_burden_rate: number;
    simulated_rate: number;
    hourly_variance: number;
    total_affected_products: number;
    total_affected_routes: number;
    routes: RoutingCostingImpact[];
}

export interface ApplyRatePayload {
    work_center_id: number;
    asset_id?: number;
    new_overhead_cost_per_hour: number;
    expected_current_rate: number;
    notes?: string;
}
