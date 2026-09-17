import { InventoryReportApiResponse, InventoryReportFilterState } from "../types";

export async function fetchInventoryReports(
    filters: InventoryReportFilterState
): Promise<InventoryReportApiResponse> {
    const params = new URLSearchParams();

    if (filters.branchId !== null && filters.branchId > 0) {
        params.set("branch_id", String(filters.branchId));
    }

    if (filters.categoryId !== null && filters.categoryId > 0) {
        params.set("category_id", String(filters.categoryId));
    }

    if (filters.productTypeId !== null && filters.productTypeId > 0) {
        params.set("product_type", String(filters.productTypeId));
    }

    if (filters.status) {
        params.set("status", filters.status);
    }

    if (filters.search && filters.search.trim()) {
        params.set("search", filters.search.trim());
    }

    params.set("_t", String(Date.now()));

    const response = await fetch(
        `/api/manufacturing/inventory-warehousing/inventory-reports?${params.toString()}`,
        {
            cache: "no-store",
            headers: {
                Accept: "application/json",
            },
        }
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
            errorData.error || `Failed to fetch inventory reports (HTTP ${response.status})`
        );
    }

    return await response.json();
}
