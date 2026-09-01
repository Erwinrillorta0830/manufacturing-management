export interface StoreType {
    id: number;
    store_type: string;
}

export interface PaymentTerm {
    id: number | string;
    payment_name: string;
    payment_days?: number | null;
}

export interface Customer {
    id: number | string;
    customer_code: string;
    customer_name: string;
    customer_tin?: string;
    contact_number?: string;
    customer_email?: string;
    store_name?: string;
    store_type_id?: number | string | { id: number | string; store_type: string };
    store_type?: number | string | { id: number | string; store_type: string };
    payment_term?: number | string | { id: number | string; payment_name?: string; payment_days?: number | null };
    brgy?: string;
    city?: string;
    province?: string;
    isActive?: number | boolean;
    created_at?: string;
    updated_by?: number | null;
    updated_at?: string | null;
    updated_by_name?: string | null;
    latitude?: number | null;
    longitude?: number | null;
}
