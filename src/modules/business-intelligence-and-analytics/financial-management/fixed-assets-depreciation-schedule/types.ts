export type AssetCondition = "Good" | "Bad" | "Under Maintenance" | "Discontinued" | "-";

export type AssetType = "Administrative" | "Production";

export type DepreciationMethod = "Straight Line" | "Units of Production";

export type AssetOrigin = "New" | "Existing";

export type AssetReportingStatus =
    | "Active"
    | "Fully Depreciated"
    | "Discontinued"
    | "Under Maintenance"
    | "Bad"
    | "-";

export type PeriodPreset =
    | "custom"
    | "current_month"
    | "current_quarter"
    | "fy_ytd"
    | "current_year"
    | "prior_year";

export interface DepartmentOption {
    department_id: number;
    department_name: string;
}

export interface DepreciationFiltersState {
    asOfDate: string; // ISO format: YYYY-MM-DD
    periodStartDate: string; // ISO format: YYYY-MM-DD
    periodPreset: PeriodPreset;
    searchQuery: string;
    assetType: "ALL" | AssetType;
    depreciationMethod: "ALL" | DepreciationMethod;
    departmentId: "ALL" | string;
    statusFilter: "ALL" | AssetReportingStatus;
}

export interface AssetDepreciationRecord {
    id: number;
    item_id: number;
    item_name: string;
    item_image: string | null;
    serial: string | null;
    barcode: string | null;
    rfid_code: string | null;
    asset_type: AssetType;
    depreciation_method: DepreciationMethod;
    condition: AssetCondition;
    department_id: number | null;
    department_name: string;
    employee_id: number | null;
    employee_name: string;
    date_acquired: string;
    depreciation_start_date: string;
    asset_origin: AssetOrigin;

    // Historical & Book Values
    acquisition_cost: number;
    residual_value: number;
    depreciable_base: number;
    life_span_years: number;
    life_span_months: number;

    // Cutover Migration Values
    opening_book_value: number | null;
    opening_accumulated_depreciation: number;
    opening_production_units: number;
    opening_production_date: string | null;

    // Units of Production Specifics
    maximum_unit_produced_capacity: number | null;
    production_unit_id: number | null;
    production_unit_name: string | null;
    production_unit_shortcut: string | null;
    actual_units_produced: number;
    remaining_production_capacity: number;
    depreciation_per_unit: number;

    // Calculated Period Metrics (Authoritative from API)
    beginning_accumulated_depreciation: number;
    current_period_depreciation: number;
    ending_accumulated_depreciation: number;
    net_book_value: number;
    depreciated_percent: number;
    status: AssetReportingStatus;
    is_fully_depreciated: boolean;
    months_in_service: number;
    remaining_life_years: number;
    annual_depreciation_rate: number;
}

export interface DepreciationScheduleSummary {
    total_assets_count: number;
    active_assets_count: number;
    fully_depreciated_count: number;
    discontinued_count: number;
    under_maintenance_count: number;
    total_acquisition_cost: number;
    total_salvage_value: number;
    total_depreciable_base: number;
    total_beginning_accum_depreciation: number;
    total_current_period_depreciation: number;
    total_ending_accum_depreciation: number;
    total_net_book_value: number;
}

export interface AmortizationScheduleRow {
    period_index: number;
    period_label: string; // e.g. "2025" or "Year 1"
    period_start_date: string;
    period_end_date: string;
    opening_nbv: number;
    depreciation_expense: number;
    ending_accumulated_depreciation: number;
    ending_nbv: number;
    production_units_period?: number;
    is_cutoff_period: boolean;
    percent_depreciated: number;
}

export interface AssetAmortizationAuditTrail {
    formula_used: string;
    depreciable_base: number;
    rate_description: string;
    notes: string[];
}

export interface AssetAmortizationDetail {
    asset: AssetDepreciationRecord;
    schedule: AmortizationScheduleRow[];
    audit_trail: AssetAmortizationAuditTrail;
}

export interface DepreciationApiResponse {
    ok: boolean;
    data: AssetDepreciationRecord[];
    summary: DepreciationScheduleSummary;
    departments: DepartmentOption[];
    asOfDate: string;
    periodStartDate: string;
    periodPreset: PeriodPreset;
    meta: {
        generatedAt: string;
        totalCount: number;
    };
    error?: string;
}
