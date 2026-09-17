import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export interface RawJobOrder {
    job_order_id: number;
    job_order_no: string;
    parent_job_order_id?: number | null;
    branch_id: number;
    product_id: number;
    version_id?: number | null;
    target_quantity?: number | string | null;
    actual_quantity_produced?: number | string | null;
    completed_quantity?: number | string | null;
    rejected_quantity?: number | string | null;
    status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    created_at?: string | null;
    initialized_at?: string | null;
    production_started_at?: string | null;
    production_completed_at?: string | null;
    qa_started_at?: string | null;
    closed_at?: string | null;
    remarks?: string | null;
}

export interface RawInspectionLog {
    id: number;
    job_order_id: number;
    inspected_quantity?: number | string | null;
    passed_quantity?: number | string | null;
    rejected_quantity?: number | string | null;
    rejection_reason_id?: number | null;
    rework_job_order_id?: number | null;
    inspected_by?: number | null;
    inspected_at?: string | null;
    status?: string | null;
    remarks?: string | null;
}

export interface RawRejectionReason {
    id: number;
    reason_code?: string | null;
    reason_name?: string | null;
    category?: string | null;
}

export interface RawYieldLedger {
    ledger_id: number;
    job_order_id: number;
    shift_name?: string | null;
    yield_quantity?: number | string | null;
    rejected_quantity?: number | string | null;
    scrap_quantity?: number | string | null;
    qa_status?: string | null;
    lot_number?: string | null;
    logged_at?: string | null;
    production_date?: string | null;
    remarks?: string | null;
}

export interface RawRoute {
    jo_route_id: number;
    job_order_id: number;
    sequence_order?: number | null;
    work_center_id?: number | null;
    operation_id?: number | null;
    planned_run_hours?: number | string | null;
    actual_run_hours?: number | string | null;
    status?: string | null;
    completed_at?: string | null;
    requires_qa?: boolean | null;
}

export interface RawQaRecord {
    qa_record_id: number;
    job_order_id: number;
    jo_route_id?: number | null;
    parameter_id?: number | null;
    value_text?: string | null;
    value_numeric?: number | string | null;
    value_boolean?: boolean | null;
    is_passed?: boolean | null;
    inspected_at?: string | null;
    remarks?: string | null;
}

export interface RawProduct {
    product_id: number;
    product_name?: string | null;
    product_code?: string | null;
    unit_of_measurement?: string | null;
}

export interface RawBranch {
    id: number;
    branch_name?: string | null;
    branch_code?: string | null;
}

export interface RawWorkCenter {
    work_center_id: number;
    work_center_name?: string | null;
}

export interface RawOperation {
    id: number;
    operation_name?: string | null;
}

export interface RawUser {
    user_id: number;
    user_fname?: string | null;
    user_lname?: string | null;
    user_email?: string | null;
}

export interface RawQualityParam {
    parameter_id: number;
    test_name?: string | null;
}

export async function fetchAllJobOrders(): Promise<RawJobOrder[]> {
    const url = `${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&fields=job_order_id,job_order_no,parent_job_order_id,branch_id,product_id,version_id,target_quantity,actual_quantity_produced,completed_quantity,rejected_quantity,status,start_date,end_date,created_at,initialized_at,production_started_at,production_completed_at,qa_started_at,closed_at,remarks&sort=-job_order_id`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchJobOrderById(jobOrderId: number): Promise<RawJobOrder | null> {
    const url = `${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}?fields=*`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
}

export async function fetchQAInspectionLogs(jobOrderIds?: number[]): Promise<RawInspectionLog[]> {
    let url = `${DIRECTUS_URL}/items/qa_jo_inspection_logs?limit=-1&sort=-id`;
    if (jobOrderIds && jobOrderIds.length > 0) {
        url = `${DIRECTUS_URL}/items/qa_jo_inspection_logs?filter[job_order_id][_in]=${jobOrderIds.join(",")}&limit=-1&sort=-id`;
    }
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchQARejectionReasons(): Promise<RawRejectionReason[]> {
    const url = `${DIRECTUS_URL}/items/qa_rejection_reasons?limit=-1&sort=reason_code`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchYieldLedgers(jobOrderIds?: number[]): Promise<RawYieldLedger[]> {
    let url = `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1&sort=-ledger_id`;
    if (jobOrderIds && jobOrderIds.length > 0) {
        url = `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_in]=${jobOrderIds.join(",")}&limit=-1&sort=-ledger_id`;
    }
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchJobOrderRoutes(jobOrderId: number): Promise<RawRoute[]> {
    const url = `${DIRECTUS_URL}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderId}&sort=sequence_order&limit=-1`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchJobOrderQaRecords(jobOrderId: number): Promise<RawQaRecord[]> {
    const url = `${DIRECTUS_URL}/items/manufacturing_job_order_qa_records?filter[job_order_id][_eq]=${jobOrderId}&limit=-1`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchProducts(): Promise<RawProduct[]> {
    const url = `${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,unit_of_measurement`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchBranches(): Promise<RawBranch[]> {
    const url = `${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchWorkCenters(): Promise<RawWorkCenter[]> {
    const url = `${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchOperations(): Promise<RawOperation[]> {
    const url = `${DIRECTUS_URL}/items/manufacturing_operations?limit=-1&fields=id,operation_name`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchUsers(): Promise<RawUser[]> {
    const url = `${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname,user_email`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchQualityParameters(): Promise<RawQualityParam[]> {
    const url = `${DIRECTUS_URL}/items/quality_inspection_parameters?limit=-1&fields=parameter_id,test_name`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}
