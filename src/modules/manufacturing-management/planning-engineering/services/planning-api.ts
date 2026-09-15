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

export type PlanningSalesOrderQueue = "for-production" | "in-production";

export async function fetchSalesOrders(
    queue: PlanningSalesOrderQueue = "for-production"
): Promise<{ data: SalesOrder[]; detailsMap: Record<number, SalesOrderDetail[]> }> {
    const soRes = await fetch(`/api/manufacturing/sales-order?queue=${encodeURIComponent(queue)}&limit=200`, { cache: "no-store" });
    if (!soRes.ok) {
        throw new Error(queue === "in-production"
            ? "Failed to fetch Sales Orders in production."
            : "Failed to fetch For Production Sales Orders.");
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
    initialize?: boolean;
    idempotencyKey?: string;
    force?: boolean;
    overrideReason?: string;
    jo: {
        jo_id: string;
        product_id: number;
        product_name: string;
        quantity: number;
        due_date: string;
        start_date?: string;
        uom_id?: number | null;
        priority?: number;
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
        subAssemblyVersionMap?: Record<number, number>;
        assignments?: Record<number, number[]>;
    };
    salesOrderIds: number[];
    salesOrderDetailIds: number[];
}

export interface ReleaseJOResult {
    job_order_id?: number | null;
    jo_id?: string | null;
    status?: string;
    shortfalls?: Array<{ name: string; required: number; available: number; shortage: number }>;
}

export interface ReleaseMultipleJob {
    productId: number;
    productName: string;
    bomVersionId: number;
    quantity: number;
    salesOrderIds: number[];
    salesOrderDetailIds: number[];
    subAssemblyVersionMap?: Record<number, number>;
    assignments?: Record<number, number[]>;
}

export interface ReleaseMultiplePayload {
    action: "release-multiple";
    initialize?: boolean;
    idempotencyKey?: string;
    force?: boolean;
    overrideReason?: string;
    baseJoNumber: string;
    shared: {
        branchId: number;
        dueDate: string;
        plannedDate?: string;
        priority?: number;
        shiftOption: string;
        remarks: string;
    };
    jobs: ReleaseMultipleJob[];
}

export interface ReleaseMultipleResult {
    jobs?: ReleaseJOResult[];
}

export async function releaseJobOrder(payload: ReleaseJOPayload): Promise<ReleaseJOResult> {
    const res = await fetch("/api/manufacturing/planning-engineering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to release Job Order.");
    }
    const json = await res.json().catch(() => null);
    return json?.data ?? {};
}

export async function releaseMultipleJobOrders(payload: ReleaseMultiplePayload): Promise<ReleaseMultipleResult> {
    const res = await fetch("/api/manufacturing/planning-engineering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(json?.error || "Failed to release the Job Orders.");
    }
    return json?.data ?? { jobs: [] };
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
