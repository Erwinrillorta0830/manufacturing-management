// src/modules/manufacturing-management/deliveries/types.ts

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

export interface Branch {
    id: number;
    branch_name: string;
    branch_code: string;
}

export interface DispatchPlanStaff {
    id: number;
    user_id: number;
    role: "Driver" | "Helper";
    is_present: boolean;
    user_name: string;
}

export interface DispatchPlan {
    id: number;
    doc_no: string;
    driver_id: number | null;
    driver_name?: string;
    vehicle_id: number | null;
    vehicle?: Vehicle | null;
    encoder_id: number | null;
    encoder_name?: string;
    starting_point: number | null;
    starting_point_name?: string;
    total_distance: number;
    status: "For Approval" | "For Dispatch" | "For Inbound" | "For Clearance" | "Posted" | "Reject";
    amount: number;
    estimated_time_of_dispatch?: string | null;
    estimated_time_of_arrival?: string | null;
    time_of_dispatch?: string | null;
    time_of_arrival?: string | null;
    date_encoded?: string;
    remarks?: string;
    staff?: DispatchPlanStaff[];
}

export interface DispatchInvoice {
    id: number;
    post_dispatch_plan_id: number;
    invoice_id: number;
    distance: number;
    status: "Not Fulfilled" | "Fulfilled" | "Fulfilled With Returns" | "Fulfilled With Concerns";
    sequence: number;
    invoiceAt: number | null;
    isCleared: number | null;
    remarks?: string;
    invoice?: {
        invoice_id: number;
        invoice_no: string;
        net_amount: number;
        customer_name: string;
        customer_code: string;
    } | null;
}

export interface PendingInvoice {
    invoice_id: number;
    invoice_no: string;
    invoice_date: string;
    customer_name: string;
    customer_code: string;
    net_amount: number;
    customer_latitude: string | number | null;
    customer_longitude: string | number | null;
    customer_location: string | null;
    customer_city: string | null;
}

