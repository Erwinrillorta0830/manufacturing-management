export interface ChartOfAccount {
    coa_id?: number;
    id?: number;
    account_code?: string;
    gl_code?: string;
    account_title?: string;
    account_name?: string;
    account_type?: number;
}

export interface ExpenseTypeOption {
    id: number;
    label: string;
}

export interface POLineItem {
    purchase_order_product_id: number;
    product_id: number | {
        product_id: number;
        product_name?: string;
        category?: string;
        weight?: number;
        cbm_height?: number | string | null;
        cbm_width?: number | string | null;
        cbm_length?: number | string | null;
    };
    product_name?: string;
    product_category?: string;
    category_type?: "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOODS";
    received_quantity: number;
    /** Persisted PHP base cost; never treat this as the invoice currency price. */
    unit_price: number;
    unit_price_foreign?: number | null;
    base_unit_cost_php: number;
    accepted_quantity?: number;
    quantity_received?: number;
    quantity_rejected?: number;
    currency_code?: string;
    exchange_rate?: number;
    gross_weight?: number | null;
    net_weight?: number | null;
    outer_carton_weight?: number | null;
    pallet_weight?: number | null;
    unit_gross_weight_kg?: number;
    unit_net_weight_kg?: number | null;
    unit_outer_carton_weight_kg?: number | null;
    unit_pallet_weight_kg?: number | null;
    line_gross_weight_kg?: number;
    discount_type?: number;
    discounted_amount?: number;
    vat_amount?: number;
    withholding_amount?: number;
    total_amount?: number;
    allocated_expense_php?: number;
    final_landed_unit_cost?: number;
}

export interface LandedExpenseRow {
    id: string;
    overhead_id: number | null;
    expense_type: string;
    amount: number;
    allocation_method: string;
    /** Legacy account association retained only for displaying old records. */
    legacyChartOfAccountId?: number | null;
}

export interface PurchaseOrderHeader {
    purchase_order_id: number;
    purchase_order_no: string;
    currency_code?: string;
    exchange_rate?: number;
    is_import?: number;
    supplier_name?: number | { id?: number; supplier_name?: string; is_foreign?: number; country?: string };
    total_amount?: number;
    total_foreign_currency?: number;
    is_posted_amounts?: number;
}

export interface LineCalculationItem extends POLineItem {
    allocated_amount: number;
    variance_adjustment: number;
    allocated_expense_php: number;
    final_landed_unit_cost: number;
}

export interface HybridCalculationResult {
    lineCalculations: LineCalculationItem[];
    rmSubPool: number;
    pkgSubPool: number;
    fgSubPool: number;
    totalLandedFee: number;
    roundingVariance: number;
    hasMissingWeight: boolean;
    missingWeightItems: string[];
}

import type { IncomingShipment } from "@/modules/manufacturing-management/procurement/types";

export interface PurchaseAmountPostingModuleProps {
    shipments?: (IncomingShipment | PurchaseOrderHeader)[];
    selectedShipment?: IncomingShipment | PurchaseOrderHeader | null;
    setSelectedShipment?: (shipment: IncomingShipment | PurchaseOrderHeader | null) => void;
}
