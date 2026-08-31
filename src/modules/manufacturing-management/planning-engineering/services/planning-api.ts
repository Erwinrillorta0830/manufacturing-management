/* eslint-disable */
import { Branch, JobOrderMaterial, SalesOrder, SalesOrderDetail } from "../types";

export async function fetchBranches(): Promise<Branch[]> {
    const branchRes = await fetch("/api/manufacturing/branches", { cache: "no-store" });
    if (!branchRes.ok) {
        throw new Error("Failed to load branches list.");
    }

    const payload: unknown = await branchRes.json();
    if (!Array.isArray(payload)) {
        throw new Error("Branches endpoint returned an invalid response.");
    }

    return payload
        .map((row: {
            id?: number | string;
            branchName?: string | null;
            branchCode?: string | null;
            branch_name?: string | null;
            branch_code?: string | null;
        }): Branch => ({
            id: Number(row.id),
            branch_name: String(row.branchName ?? row.branch_name ?? "").trim(),
            branch_code: String(row.branchCode ?? row.branch_code ?? "").trim() || undefined,
            isActive: true,
        }))
        .filter((branch) => Number.isFinite(branch.id) && branch.id > 0 && Boolean(branch.branch_name));
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
    salesOrderDetailIds: number[];
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
