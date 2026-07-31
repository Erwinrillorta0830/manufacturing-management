export const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
export const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

export const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export const headersNoCache = { ...headers, "cache": "no-store" as const };

export interface DirectusJobOrder {
    jo_id: string;
    due_date?: string | null;
    status: string;
    is_batched: boolean;
    procurement_status: string;
    branch_id?: number | null;
    assigned_personnel?: unknown;
    shift_option?: string | null;
    daily_breakdown?: unknown;
    product_id?: number | null;
    product_name?: string | null;
    quantity?: number;
    bom?: unknown;
    components?: unknown;
    routings?: unknown;
    allocation_results?: unknown;
    products?: {
        product_id?: number | null;
        product_name?: string | null;
        quantity?: number;
        bom?: unknown;
        components?: unknown;
        routings?: unknown;
        allocation_results?: unknown;
    }[];
    sales_orders?: unknown[];
    [key: string]: unknown;
}

export async function getJobOrderIdByNo(joNo: string): Promise<{ id: number; productId: number; versionId: number } | null> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(joNo)}&limit=1`, { headers });
        if (res.ok) {
            const data = (await res.json()).data?.[0];
            if (data) {
                return {
                    id: Number(data.job_order_id),
                    productId: Number(data.product_id),
                    versionId: Number(data.version_id)
                };
            }
        }
    } catch (e) {
        console.error("Failed to resolve job_order_id for", joNo, e);
    }
    return null;
}

export async function getUomCountForProduct(productId: number): Promise<number> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/products/${productId}?fields=unit_of_measurement_count`, { headers });
        if (res.ok) {
            const data = (await res.json()).data;
            return data?.unit_of_measurement_count ? Number(data.unit_of_measurement_count) : 1;
        }
    } catch (e) {
        console.error("Error fetching uom count for product:", productId, e);
    }
    return 1;
}
