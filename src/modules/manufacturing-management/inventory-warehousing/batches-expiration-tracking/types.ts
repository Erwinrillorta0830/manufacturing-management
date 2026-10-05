export type ExpirationStatus =
    | "EXPIRED"
    | "EXPIRING_TODAY"
    | "CRITICAL"
    | "WARNING"
    | "UPCOMING"
    | "SAFE"
    | "NO_EXPIRY";

export interface BatchExpirationItem {
    inventory_lot_id: number;
    lot_id: number;
    lot_name: string;
    product_id: number;
    product_code: string;
    product_name: string;
    product_type_id: number | null;
    product_type_name: string | null;
    category_name?: string | null;
    batch_no: string;
    manufacturing_date: string | null;
    expiry_date: string | null;
    days_remaining: number | null;
    expiration_status: ExpirationStatus;
    branch_id: number;
    branch_name: string;
    branch_code: string | null;
    unit_id: number | null;
    unit_name: string | null;
    unit_shortcut: string | null;
    on_hand_quantity: number;
    unit_cost: number;
    inventory_value: number;
    qa_status: string;
    status: string;
    remarks?: string | null;
    source_reference?: string | null;
    warning_threshold_days?: number;
    critical_threshold_days?: number;
    rotation_policy?: "FEFO" | "FIFO";
}

export interface CategoryThresholdConfig {
    criticalDays: number; // e.g. 30 days
    warningDays: number;  // e.g. 90 days
    horizonDays: number;  // e.g. 180 days (6 months)
    rotationPolicy: "FEFO" | "FIFO";
}

export const CATEGORY_EXPIRATION_THRESHOLDS: Record<"RAW_MATERIALS" | "PACKAGING" | "FINISHED_GOODS", CategoryThresholdConfig> = {
    // Raw Materials & Ingredients: 180-day (6 months) shelf life window (PM confirmed), FEFO prioritized
    RAW_MATERIALS: {
        criticalDays: 30,
        warningDays: 90,
        horizonDays: 180,
        rotationPolicy: "FEFO",
    },
    // Packaging Materials: 90-day (3 months) window (FIFO prioritized)
    PACKAGING: {
        criticalDays: 14,
        warningDays: 45,
        horizonDays: 90,
        rotationPolicy: "FIFO",
    },
    // Finished Goods: 30-day window (FEFO prioritized)
    FINISHED_GOODS: {
        criticalDays: 3,
        warningDays: 14,
        horizonDays: 30,
        rotationPolicy: "FEFO",
    },
};

export interface BatchExpirationKpis {
    expired_count: number;
    expired_value: number;
    critical_count: number;
    critical_value: number;
    next_7_days_count?: number;
    next_7_days_value?: number;
    next_30_days_count: number;
    next_30_days_value: number;
    next_90_days_count: number;
    next_90_days_value: number;
    next_180_days_count: number;
    next_180_days_value: number;
    warning_count?: number;
    warning_value?: number;
    upcoming_count?: number;
    upcoming_value?: number;
    total_batches_monitored: number;
    total_inventory_value: number;
}

export interface TimelineWindow {
    id: string;
    label: string;
    sublabel: string;
    count: number;
    value: number;
    color: string;
    bgClass: string;
    borderClass: string;
    textClass: string;
    barColorClass: string;
    percentage: number;
}

export interface BatchExpirationFilters {
    status: ExpirationStatus | "ALL";
    branch_id: number | "ALL";
    product_type: string | "ALL";
    only_with_on_hand: boolean;
    search: string;
    date_from?: string;
    date_to?: string;
}

export interface BatchExpirationApiResponse {
    success: boolean;
    data: BatchExpirationItem[];
    kpis: BatchExpirationKpis;
    timeline: TimelineWindow[];
    branches: Array<{ id: number; branch_name: string; branch_code: string }>;
    product_types: Array<{ id: number; name: string }>;
    timestamp: string;
    error?: string;
}
