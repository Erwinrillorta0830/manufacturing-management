import type { CostVarianceOption, StandardVsActualCostReportPayload, StandardVsActualCostReportRequest } from "../types";

export async function fetchStandardVsActualCostReportFilters(
    signal?: AbortSignal
): Promise<{ branches: CostVarianceOption[]; products: CostVarianceOption[] }> {
    const response = await fetch("/api/manufacturing/reports/standard-vs-actual-cost-variance/filters", {
        cache: "no-store",
        signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.error || `Failed to load cost report filters (HTTP ${response.status}).`);
    }
    if (!Array.isArray(payload?.data?.branches) || !Array.isArray(payload?.data?.products)) {
        throw new Error("The cost report filter service returned an invalid response.");
    }
    return payload.data;
}

export async function fetchStandardVsActualCostReport(
    request: StandardVsActualCostReportRequest,
    signal?: AbortSignal
): Promise<StandardVsActualCostReportPayload> {
    const params = new URLSearchParams();
    const { filters } = request;
    if (filters.branchId !== "all") params.set("branchId", filters.branchId);
    if (filters.productId !== "all") params.set("productId", filters.productId);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.jobOrder.trim()) params.set("jobOrder", filters.jobOrder.trim());
    if (request.allRows) params.set("export", "all");
    else {
        params.set("page", String(request.page || 1));
        params.set("pageSize", String(request.pageSize || 20));
    }
    if (request.includeOptions === false) params.set("includeOptions", "false");

    const response = await fetch(`/api/manufacturing/reports/standard-vs-actual-cost-variance?${params.toString()}`, {
        cache: "no-store",
        signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.error || `Failed to load the cost report (HTTP ${response.status}).`);
    }
    if (!Array.isArray(payload?.data?.rows) || !payload?.data?.summary) {
        throw new Error("The cost report service returned an invalid response.");
    }
    return payload.data as StandardVsActualCostReportPayload;
}
