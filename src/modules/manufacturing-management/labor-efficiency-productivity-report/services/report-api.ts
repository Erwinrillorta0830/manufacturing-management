import type {
    LaborEfficiencyFilters,
    LaborEfficiencyExportFormat,
    LaborEfficiencyOption,
    LaborEfficiencyReportPayload,
    LaborEfficiencyReportRequest
} from "../types";

const REPORT_URL = "/api/manufacturing/reports/labor-efficiency-productivity";

async function readData<T>(response: Response, invalidMessage: string): Promise<T> {
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `Report request failed (HTTP ${response.status}).`);
    if (!payload?.data) throw new Error(invalidMessage);
    return payload.data as T;
}

function addFilters(params: URLSearchParams, filters: LaborEfficiencyFilters) {
    for (const [key, value] of Object.entries(filters)) {
        if (value && value !== "all") params.set(key, value.trim());
    }
}

export async function fetchLaborEfficiencyReportFilters(signal?: AbortSignal): Promise<{
    branches: LaborEfficiencyOption[];
    products: LaborEfficiencyOption[];
}> {
    const response = await fetch(`${REPORT_URL}/filters`, { cache: "no-store", signal });
    const data = await readData<{ branches: LaborEfficiencyOption[]; products: LaborEfficiencyOption[] }>(response, "The report filter service returned an invalid response.");
    if (!Array.isArray(data.branches) || !Array.isArray(data.products)) throw new Error("The report filter service returned an invalid response.");
    return data;
}

export async function fetchLaborEfficiencyReport(
    request: LaborEfficiencyReportRequest,
    signal?: AbortSignal
): Promise<LaborEfficiencyReportPayload> {
    const params = new URLSearchParams();
    addFilters(params, request.filters);
    params.set("page", String(request.page || 1));
    params.set("pageSize", String(request.pageSize || 20));
    params.set("sortBy", request.sortKey || "jobOrderNo");
    params.set("sortDirection", request.sortDirection || "asc");
    params.set("includeOptions", "false");
    const response = await fetch(`${REPORT_URL}?${params.toString()}`, { cache: "no-store", signal });
    const data = await readData<LaborEfficiencyReportPayload>(response, "The report service returned an invalid response.");
    if (!Array.isArray(data.rows) || !data.summary || typeof data.totalRows !== "number") throw new Error("The report service returned an invalid response.");
    return data;
}

export async function downloadLaborEfficiencyReport(
    filters: LaborEfficiencyFilters,
    format: LaborEfficiencyExportFormat,
    sortKey: LaborEfficiencyReportRequest["sortKey"],
    sortDirection: LaborEfficiencyReportRequest["sortDirection"]
): Promise<boolean> {
    const params = new URLSearchParams();
    addFilters(params, filters);
    params.set("format", format);
    params.set("sortBy", sortKey || "jobOrderNo");
    params.set("sortDirection", sortDirection || "asc");
    params.set("includeOptions", "false");
    const response = await fetch(`${REPORT_URL}/export?${params.toString()}`, { cache: "no-store" });
    if (response.status === 204) return false;
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Report export failed (HTTP ${response.status}).`);
    }

    const blob = await response.blob();
    const fallbackName = `labor-efficiency-productivity-${new Date().toISOString().slice(0, 10)}.${format}`;
    const disposition = response.headers.get("content-disposition") || "";
    const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] || fallbackName;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    return true;
}
