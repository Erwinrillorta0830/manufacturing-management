import { OffsetPairing } from "../types";

export interface CreateSheetPayload {
    branch_id: number;
    starting_date?: string;
    cutoff_date: string;
    inventory_type?: string;
    product_type_id?: number | string;
    stock_type?: string;
    price_type?: string;
    supplier_id?: number;
    category_id?: number;
    remarks?: string;
}

export interface UpdateLineItemPayload {
    id: string | number;
    physical_count: number | null;
    lot_id?: number | string | null;
    version_id?: number | string | null;
    batch_no?: string | null;
    product_id?: number | string | null;
    unit_price?: number;
    system_count?: number;
    offset_qty?: number;
}

export async function fetchCountSheets(params?: {
    branch_id?: number;
    status?: string;
    inventory_type?: string;
    product_type_id?: number | string;
    stock_type?: string;
    supplier_id?: number;
    search?: string;
}) {
    const searchParams = new URLSearchParams();
    if (params?.branch_id) searchParams.set("branch_id", String(params.branch_id));
    if (params?.status) searchParams.set("status", params.status);
    if (params?.inventory_type) searchParams.set("inventory_type", params.inventory_type);
    if (params?.product_type_id) searchParams.set("product_type_id", String(params.product_type_id));
    if (params?.stock_type) searchParams.set("stock_type", params.stock_type);
    if (params?.supplier_id) searchParams.set("supplier_id", String(params.supplier_id));
    if (params?.search) searchParams.set("search", params.search);

    const res = await fetch(`/api/manufacturing/physical-inventory?${searchParams.toString()}`, { cache: "no-store" });
    if (!res.ok) {
        throw new Error(`Failed to fetch count sheets: ${res.statusText}`);
    }
    const json = await res.json();
    return json.data || [];
}

export async function fetchCountSheetById(id: string | number) {
    const res = await fetch(`/api/manufacturing/physical-inventory/${id}`, { cache: "no-store" });
    if (!res.ok) {
        throw new Error(`Failed to fetch count sheet #${id}: ${res.statusText}`);
    }
    const json = await res.json();
    return json.data;
}

export async function createCountSheet(payload: CreateSheetPayload) {
    const res = await fetch(`/api/manufacturing/physical-inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to create count sheet`);
    }
    const json = await res.json();
    return json.data;
}

export async function updateCountSheetDraft(
    id: string | number,
    items: UpdateLineItemPayload[],
    remarks?: string,
    offsetPairings?: OffsetPairing[]
) {
    const res = await fetch(`/api/manufacturing/physical-inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, remarks, offset_pairings: offsetPairings }),
    });
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to save count sheet draft`);
    }
    const json = await res.json();
    return json.data;
}

export async function commitCountSheet(id: string | number) {
    const res = await fetch(`/api/manufacturing/physical-inventory/${id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to commit count sheet`);
    }
    const json = await res.json();
    return json.data;
}

export async function cancelCountSheet(id: string | number) {
    const res = await fetch(`/api/manufacturing/physical-inventory/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to cancel count sheet`);
    }
    const json = await res.json();
    return json.data;
}

export async function fetchBranches() {
    try {
        const res = await fetch(`/api/manufacturing/branches`, { cache: "no-store" });
        if (!res.ok) return [];
        const json = await res.json();
        return json.data || json || [];
    } catch {
        return [];
    }
}

export async function fetchSuppliers() {
    try {
        const res = await fetch(`/api/manufacturing/suppliers`, { cache: "no-store" });
        if (!res.ok) return [];
        const json = await res.json();
        return json.data || json || [];
    } catch {
        return [];
    }
}

export async function fetchProductTypes() {
    try {
        const res = await fetch(`/api/manufacturing/physical-inventory/product-types`, { cache: "no-store" });
        if (!res.ok) return [];
        const json = await res.json();
        return Array.isArray(json) ? json : (json.data || []);
    } catch {
        return [];
    }
}
