// src/modules/manufacturing-management/mm/sales-and-fulfillment/fulfilment-and-deliveries/types.ts

export type FulfillmentStatus =
    | "Pending"
    | "Fulfilled"
    | "Fulfilled with Returns"
    | "Unfulfilled / Returns";

export type LineStatus =
    | "Fulfilled"
    | "Fulfilled with Returns"
    | "Unfulfilled / Returns";

export interface ClearanceLineItem {
    detail_id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    product_description?: string;
    uom?: string;
    ordered_quantity: number;
    received_quantity: number;
    returned_quantity: number;
    unit_price: number;
    has_concern: boolean;
    concern_notes: string;
    line_status: LineStatus;
}

export interface LinkedSalesReturn {
    return_id: number;
    return_number: string;
    status: string;
    return_date?: string | null;
    total_amount?: number | null;
}

export interface ConsolidatedSalesOrderRecord {
    order_id: number;
    order_no: string;
    order_status: string;
    invoice_id: number;
    invoice_no: string;
    invoice_date: string;
    customer_code: string;
    customer_name: string;
    amount: number;
    remarks: string;
    fulfillment_status: FulfillmentStatus;
    is_cleared: boolean;
    cleared_at?: string | null;
    cleared_by?: number | null;
    linked_sales_return?: LinkedSalesReturn | null;
    items: ClearanceLineItem[];
}

export interface ConsolidatedDeliveryRecord {
    consolidator_id: number;
    consolidator_no: string;
    status: string;
    branch_id: number;
    branch_name: string;
    dispatch_date: string;
    total_orders: number;
    total_items: number;
    total_amount: number;
    fulfillment_status: FulfillmentStatus;
    is_cleared: boolean;
    cleared_at?: string | null;
    orders: ConsolidatedSalesOrderRecord[];
}

export interface ClearanceMetrics {
    total_dispatched: number;
    pending_clearance: number;
    fulfilled_count: number;
    concerns_and_returns_count: number;
}

export interface Branch {
    id: number;
    branch_name: string;
    branch_code: string;
}

export interface ConsolidatedClearanceSubmissionPayload {
    consolidator_id: number;
    clearance_remarks?: string;
    orders: {
        order_id: number;
        invoice_id: number;
        clearance_remarks?: string;
        items: {
            detail_id: number;
            product_id: number;
            received_quantity: number;
            returned_quantity: number;
            has_concern: boolean;
            concern_notes: string;
        }[];
    }[];
}

// Backward-compatible alias
export type DeliveryClearanceRecord = ConsolidatedDeliveryRecord;
export type ClearanceSubmissionPayload = ConsolidatedClearanceSubmissionPayload;

// Backward-compatible types to preserve legacy component references without deletion
export interface Vehicle {
    id: number;
    name: string;
    plate: string;
    type: string;
}

export interface User {
    user_id: number;
    Firstname?: string;
    first_name?: string;
    LastName?: string;
    last_name?: string;
    email: string;
    role?: string;
}

export interface PendingInvoice {
    invoice_id: number;
    invoice_no: string;
    order_id: number;
    order_no?: string;
    customer_code: string;
    customer_name?: string;
    customer_address?: string;
    customer_city?: string;
    customer_latitude?: number | null;
    customer_longitude?: number | null;
    total_amount: number;
    net_amount: number;
    invoice_date: string;
    branch_id: number;
    status: string;
    items_count?: number;
    weight_kg?: number;
    lat?: number;
    lng?: number;
}

export interface DispatchPlanStaff {
    id: number;
    staff_id?: number;
    plan_id?: number;
    user_id: number;
    user_name?: string;
    role: "Driver" | "Helper";
    user?: User;
}

export interface DispatchInvoice {
    id: number;
    dispatch_invoice_id?: number;
    plan_id: number;
    invoice_id: number;
    invoice_no?: string;
    customer_name?: string;
    delivery_address?: string;
    stop_order: number;
    sequence?: number;
    delivery_status: string;
    status?: string;
    remarks?: string;
    delivered_at?: string;
    total_amount?: number;
    distance?: number;
    pod_signature_url?: string;
    pod_photo_url?: string;
    lat?: number;
    lng?: number;
    invoice?: {
        invoice_no?: string;
        customer_name?: string;
        delivery_address?: string;
        total_amount?: number;
        items?: unknown[];
    };
}

export interface DispatchPlan {
    id: number;
    plan_id: number;
    plan_code: string;
    doc_no?: string;
    branch_id: number;
    branch_name?: string;
    starting_point_name?: string;
    vehicle_id: number;
    vehicle_name?: string;
    vehicle_plate?: string;
    vehicle?: { name?: string; plate?: string; type?: string };
    driver_id?: number;
    driver_user_id: number;
    driver_name?: string;
    dispatch_date: string;
    dispatch_time?: string;
    arrival_time?: string;
    status: string;
    remarks?: string;
    amount?: number;
    total_distance?: number;
    total_invoices?: number;
    total_amount?: number;
    staff?: DispatchPlanStaff[];
    invoices?: DispatchInvoice[];
}
