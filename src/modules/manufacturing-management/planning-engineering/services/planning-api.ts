/* eslint-disable */
import { Branch, JobOrderMaterial, SalesOrder, SalesOrderDetail } from "../types";

export async function fetchBranches(): Promise<Branch[]> {
    const invRes = await fetch("/api/manufacturing/inventory");
    if (!invRes.ok) {
        throw new Error("Failed to load branches list.");
    }
    const invData = await invRes.json();
    return (invData.branches || []).filter(
        (b: Branch) => b.isActive === true || b.isActive === 1 || b.isActive === undefined
    );
}

export async function fetchSalesOrders(): Promise<{ data: SalesOrder[]; detailsMap: Record<number, SalesOrderDetail[]> }> {
    const soRes = await fetch("/api/manufacturing/sales-order?excludeHasJo=true&limit=200");
    if (!soRes.ok) {
        throw new Error("Failed to fetch unfulfilled sales orders.");
    }
    const soData = await soRes.json();
    return {
        data: soData.data || [],
        detailsMap: soData.detailsMap || {}
    };
}

export async function fetchNetRequirementsRaw(productIds: number[], branchId: number): Promise<any[]> {
    const productIdsStr = productIds.join(",");
    const res = await fetch(
        `/api/manufacturing/planning-engineering?action=net-requirements&productIds=${productIdsStr}&branchId=${branchId}`
    );
    if (!res.ok) {
        throw new Error("Failed to load net requirements from API.");
    }
    return res.json();
}

export async function fetchJobMaterials(joId: number | string, signal?: AbortSignal): Promise<JobOrderMaterial[]> {
    const res = await fetch(
        `/api/manufacturing/planning-engineering?action=job-materials&joId=${encodeURIComponent(String(joId))}`,
        { cache: "no-store", signal }
    );
    const payload = await res.json().catch(() => null);

    if (!res.ok) {
        throw new Error(payload?.error || "Required material data is temporarily unavailable.");
    }

    if (!Array.isArray(payload)) {
        throw new Error("Materials lookup returned an invalid response.");
    }

    return payload;
}

export interface ReleaseJOPayload {
    jo: {
        jo_id: string;
        product_id: number;
        product_name: string;
        quantity: number;
        due_date: string;
        status: string;
        is_batched: boolean;
        branch_id: number;
        shiftOption: string;
        remarks: string;
        bom: {
            version_id: number | null | undefined;
        };
        products: Array<{
            product_id: number;
            product_name: string;
            quantity: number;
            bom: {
                version_id: number | null | undefined;
            };
        }>;
    };
    salesOrderIds: number[];
}

export async function releaseJobOrder(payload: ReleaseJOPayload): Promise<void> {
    const res = await fetch("/api/manufacturing/planning-engineering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to release Job Order.");
    }
}

export async function directAllocate(payload: {
    branchId: number;
    productId: number;
    recipeVersionId: number;
    lines: Array<{ detail_id: number; ordered_quantity: number }>;
}): Promise<void> {
    const res = await fetch("/api/manufacturing/planning-engineering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action: "direct-allocate",
            ...payload
        })
    });
    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to directly allocate Sales Order lines.");
    }
}
