import type { CanonicalJobOrderStatus } from "../job-order-status";

export interface DailyBreakdownItem {
    day: number;
    date: string;
    status: string;
    quantity: number;
}

export interface RoutingStep {
    routing_id: number;
    sequence_order: number;
    operation_name: string;
    duration_hours: number;
}

export interface JobOrder {
    jo_id: string;
    order_no: string;
    product_id: number;
    product_name: string;
    quantity: number;
    due_date: string;
    status: CanonicalJobOrderStatus;
    is_batched?: boolean;
    bom?: unknown;
    routings?: RoutingStep[];
    shiftOption?: string;
    dailyBreakdown?: DailyBreakdownItem[] | null;
}

export interface IncomingShipment {
    shipment_id: number;
    reference_number: string;
    purchase_order_no?: string;
    shipper: string;
    carrier: string;
    estimated_delivery_date: string;
    actual_delivery_date?: string;
    status: string;
    notes?: string;
    lead_time_receiving?: string;
    date_received?: string;
    created_at?: string;
}
