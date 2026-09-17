import { WipApiResponse, WipFilterState } from "../types";

export async function fetchWipTrackingData(filters: WipFilterState): Promise<WipApiResponse> {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.workCenterId !== null) params.set("workCenterId", String(filters.workCenterId));
    if (filters.productId !== null) params.set("productId", String(filters.productId));
    if (filters.branchId !== null) params.set("branchId", String(filters.branchId));
    if (filters.delayedOnly) params.set("delayedOnly", "true");

    const res = await fetch(`/api/bia/costing/wip-tracking-report?${params.toString()}`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json"
        },
        cache: "no-store"
    });

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(errorData.message || `Failed to fetch WIP Tracking Report (${res.status})`);
    }

    return res.json();
}
