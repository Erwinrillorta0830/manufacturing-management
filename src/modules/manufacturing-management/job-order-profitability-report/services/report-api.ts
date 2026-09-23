import type {
    JobOrderProfitabilityExportPayload,
    JobOrderProfitabilityFilters,
    JobOrderProfitabilityPayload,
    ProfitabilityBatchDetails,
    ProfitabilityOption
} from "../types";

const REPORT_URL = "/api/manufacturing/reports/job-order-profitability-report";

export async function fetchProfitabilityFilterOptions(signal?: AbortSignal): Promise<{
    branches: ProfitabilityOption[];
    products: ProfitabilityOption[];
    statuses: string[];
}> {
    const response = await fetch(`${REPORT_URL}/filters`, { cache: "no-store", signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `Filter lookup failed (HTTP ${response.status}).`);
    if (!Array.isArray(payload?.data?.branches) || !Array.isArray(payload?.data?.products) || !Array.isArray(payload?.data?.statuses)) {
        throw new Error("The report filter service returned an invalid response.");
    }
    return payload.data;
}

export async function fetchJobOrderProfitabilityReport(
    filters: JobOrderProfitabilityFilters,
    options: { page?: number; pageSize?: number; allRows?: boolean },
    signal?: AbortSignal
): Promise<JobOrderProfitabilityPayload> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value && value !== "all") params.set(key, value);
    }
    if (options.allRows) params.set("export", "all");
    else {
        params.set("page", String(options.page || 1));
        params.set("pageSize", String(options.pageSize || 20));
    }
    params.set("includeOptions", "false");
    const response = await fetch(`${REPORT_URL}?${params.toString()}`, { cache: "no-store", signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `Report request failed (HTTP ${response.status}).`);
    const data = payload?.data as JobOrderProfitabilityPayload | undefined;
    if (!data || !Array.isArray(data.rows) || !data.summary) {
        throw new Error("The report service returned an invalid response.");
    }
    return data;
}

export async function fetchJobOrderProfitabilityExport(
    filters: JobOrderProfitabilityFilters,
    signal?: AbortSignal
): Promise<JobOrderProfitabilityExportPayload> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value && value !== "all") params.set(key, value);
    }
    params.set("export", "all");
    params.set("includeOptions", "false");

    const response = await fetch(`${REPORT_URL}?${params.toString()}`, { cache: "no-store", signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `Report export request failed (HTTP ${response.status}).`);
    const data = payload?.data as JobOrderProfitabilityExportPayload | undefined;
    if (!data || !Array.isArray(data.rows) || !data.summary || data.rows.some((row) => !row.detail)) {
        throw new Error("The report export service returned an invalid response.");
    }
    return data;
}

export async function fetchProfitabilityBatchDetails(
    ledgerId: number,
    signal?: AbortSignal
): Promise<ProfitabilityBatchDetails> {
    const params = new URLSearchParams({ ledgerId: String(ledgerId) });
    const response = await fetch(`${REPORT_URL}/details?${params.toString()}`, { cache: "no-store", signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `Batch detail request failed (HTTP ${response.status}).`);
    const detail = payload?.data?.detail as ProfitabilityBatchDetails | undefined;
    if (!detail || !Array.isArray(detail.materials) || !Array.isArray(detail.labor) || !Array.isArray(detail.overhead)) {
        throw new Error("The batch detail service returned an invalid response.");
    }
    return detail;
}
