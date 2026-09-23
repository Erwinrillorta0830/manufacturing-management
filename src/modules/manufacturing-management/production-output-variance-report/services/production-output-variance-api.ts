import type {
    ProductionOutputVarianceExportPayload,
    ProductionOutputVarianceFilterOptions,
    ProductionOutputVariancePayload,
    ProductionOutputVarianceRequest
} from "../types";

const REPORT_URL = "/api/manufacturing/reports/production-output-variance";

function addRequestParams(params: URLSearchParams, request: ProductionOutputVarianceRequest) {
    params.set("page", String(request.page));
    params.set("pageSize", String(request.pageSize));
    params.set("sortBy", request.sortKey);
    params.set("sortDirection", request.sortDirection);
    for (const [key, value] of Object.entries(request.filters)) {
        if (value && value !== "all") params.set(key, value);
    }
}

async function readResponse<T>(response: Response, invalidMessage: string): Promise<T> {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.error || `Report request failed (HTTP ${response.status}).`);
    }
    if (!payload?.data) throw new Error(invalidMessage);
    return payload.data as T;
}

export async function fetchProductionOutputVarianceReport(
    request: ProductionOutputVarianceRequest,
    signal?: AbortSignal
): Promise<ProductionOutputVariancePayload> {
    const params = new URLSearchParams();
    addRequestParams(params, request);
    const response = await fetch(`${REPORT_URL}?${params.toString()}`, { cache: "no-store", signal });
    const data = await readResponse<ProductionOutputVariancePayload>(response, "The report service returned an invalid response.");
    if (!Array.isArray(data.rows) || !data.summary || typeof data.totalCount !== "number") {
        throw new Error("The report service returned an invalid response.");
    }
    return data;
}

export async function fetchProductionOutputVarianceFilterOptions(
    signal?: AbortSignal
): Promise<ProductionOutputVarianceFilterOptions> {
    const response = await fetch(`${REPORT_URL}/filters`, { cache: "no-store", signal });
    const data = await readResponse<ProductionOutputVarianceFilterOptions>(response, "The report filter service returned an invalid response.");
    if (!Array.isArray(data.branches) || !Array.isArray(data.products) || !Array.isArray(data.statuses)) {
        throw new Error("The report filter service returned an invalid response.");
    }
    return data;
}

export async function fetchAllProductionOutputVarianceRows(
    request: ProductionOutputVarianceRequest,
    signal?: AbortSignal
): Promise<ProductionOutputVarianceExportPayload> {
    const params = new URLSearchParams();
    addRequestParams(params, request);
    params.set("export", "all");
    const response = await fetch(`${REPORT_URL}?${params.toString()}`, { cache: "no-store", signal });
    const data = await readResponse<ProductionOutputVarianceExportPayload>(response, "The report export service returned an invalid response.");
    if (!Array.isArray(data.rows) || typeof data.totalCount !== "number") {
        throw new Error("The report export service returned an invalid response.");
    }
    return data;
}
