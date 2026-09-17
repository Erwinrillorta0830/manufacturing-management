import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function fetchAllJobOrders(): Promise<any[]> {
    const url = `${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&fields=job_order_id,job_order_no,parent_job_order_id,branch_id,product_id,version_id,target_quantity,actual_quantity_produced,completed_quantity,rejected_quantity,status,start_date,end_date,created_at,initialized_at,production_started_at,production_completed_at,qa_started_at,closed_at,remarks&sort=-job_order_id`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchJobOrderById(jobOrderId: number): Promise<any | null> {
    const url = `${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}?fields=*`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
}

export async function fetchQAInspectionLogs(jobOrderIds?: number[]): Promise<any[]> {
    let url = `${DIRECTUS_URL}/items/qa_jo_inspection_logs?limit=-1&sort=-id`;
    if (jobOrderIds && jobOrderIds.length > 0) {
        url = `${DIRECTUS_URL}/items/qa_jo_inspection_logs?filter[job_order_id][_in]=${jobOrderIds.join(",")}&limit=-1&sort=-id`;
    }
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchQARejectionReasons(): Promise<any[]> {
    const url = `${DIRECTUS_URL}/items/qa_rejection_reasons?limit=-1&sort=reason_code`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchYieldLedgers(jobOrderIds?: number[]): Promise<any[]> {
    let url = `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1&sort=-ledger_id`;
    if (jobOrderIds && jobOrderIds.length > 0) {
        url = `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_in]=${jobOrderIds.join(",")}&limit=-1&sort=-ledger_id`;
    }
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchJobOrderRoutes(jobOrderId: number): Promise<any[]> {
    const url = `${DIRECTUS_URL}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderId}&sort=sequence_order&limit=-1`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchJobOrderQaRecords(jobOrderId: number): Promise<any[]> {
    const url = `${DIRECTUS_URL}/items/manufacturing_job_order_qa_records?filter[job_order_id][_eq]=${jobOrderId}&limit=-1`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchProducts(): Promise<any[]> {
    const url = `${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,unit_of_measurement`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchBranches(): Promise<any[]> {
    const url = `${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchWorkCenters(): Promise<any[]> {
    const url = `${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchOperations(): Promise<any[]> {
    const url = `${DIRECTUS_URL}/items/manufacturing_operations?limit=-1&fields=id,operation_name`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchUsers(): Promise<any[]> {
    const url = `${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname,user_email`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

export async function fetchQualityParameters(): Promise<any[]> {
    const url = `${DIRECTUS_URL}/items/quality_inspection_parameters?limit=-1&fields=parameter_id,test_name`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}
