import {
    DepreciationApiResponse,
    DepreciationFiltersState
} from "../types";

export async function fetchDepreciationSchedule(
    filters: DepreciationFiltersState
): Promise<DepreciationApiResponse> {
    const params = new URLSearchParams();

    if (filters.asOfDate) {
        params.set("asOfDate", filters.asOfDate);
    }
    if (filters.periodPreset) {
        params.set("periodPreset", filters.periodPreset);
    }
    if (filters.periodStartDate) {
        params.set("periodStartDate", filters.periodStartDate);
    }
    if (filters.searchQuery) {
        params.set("search", filters.searchQuery.trim());
    }
    if (filters.assetType && filters.assetType !== "ALL") {
        params.set("assetType", filters.assetType);
    }
    if (filters.depreciationMethod && filters.depreciationMethod !== "ALL") {
        params.set("depreciationMethod", filters.depreciationMethod);
    }
    if (filters.departmentId && filters.departmentId !== "ALL") {
        params.set("departmentId", filters.departmentId);
    }
    if (filters.statusFilter && filters.statusFilter !== "ALL") {
        params.set("status", filters.statusFilter);
    }

    const queryString = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(
        `/api/bia/financial-management/fixed-assets-depreciation-schedule${queryString}`,
        {
            cache: "no-store",
            headers: {
                "Content-Type": "application/json"
            }
        }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
        throw new Error(data.error || `Failed to fetch depreciation schedule (${response.status})`);
    }

    return data as DepreciationApiResponse;
}
