import type {
    JobOrderDailyYieldDetails,
    JobOrderDailyYieldSummary,
    JobOrderDailyYieldSummaryPage,
    JobOrderDailyYieldSummaryQuery,
} from "../types";

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
    const payload = await response.json().catch(() => null) as { data?: T; error?: string } | null;
    if (!response.ok) {
        throw new Error(payload?.error || fallback);
    }
    return (payload && "data" in payload ? payload.data : payload) as T;
}
export async function fetchJobOrderDailyYieldSummaries(
    query: JobOrderDailyYieldSummaryQuery,
    signal?: AbortSignal
): Promise<JobOrderDailyYieldSummaryPage> {
    const params = new URLSearchParams({
        page: String(query.page),
        pageSize: String(query.pageSize),
        search: query.search,
        status: query.status,
        productId: query.productId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        flaggedOnly: String(query.flaggedOnly),
    });
    const response = await fetch(`/api/manufacturing/production/job-order-inspection-qa?${params.toString()}`, {
        signal,
        cache: "no-store"
    });
    return readResponse<JobOrderDailyYieldSummaryPage>(response, "Failed to load JO Daily Yields.");
}

export async function fetchJobOrderDailyYieldSummaryByNumber(
    jobOrderNo: string,
    signal?: AbortSignal
): Promise<JobOrderDailyYieldSummary | null> {
    const query = new URLSearchParams({ jobOrderNo });
    const response = await fetch(`/api/manufacturing/production/job-order-inspection-qa?${query.toString()}`, {
        signal,
        cache: "no-store"
    });
    return readResponse<JobOrderDailyYieldSummary | null>(response, "Failed to load Job Order summary.");
}

export async function fetchJobOrderDailyYieldDetails(
    jobOrderId: number,
    signal?: AbortSignal
): Promise<JobOrderDailyYieldDetails> {
    const query = new URLSearchParams({ joId: String(jobOrderId) });
    const response = await fetch(`/api/manufacturing/production/job-order-inspection-qa?${query.toString()}`, {
        signal,
        cache: "no-store"
    });
    return readResponse<JobOrderDailyYieldDetails>(response, "Failed to load Job Order details.");
}

export async function revokeJobOrderYieldAudit(input: {
    jobOrderId: number;
    ledgerId: number;
    reason: string;
}): Promise<void> {
    const response = await fetch("/api/manufacturing/production/daily-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revokeJobOrderYieldAudit", ...input })
    });
    await readResponse(response, "Failed to revoke the QA release.");
}

export async function closeJobOrder(
    jobOrderId: number,
    idempotencyKey: string
): Promise<{ status: string; idempotent: boolean }> {
    const response = await fetch(`/api/manufacturing/job-orders/${encodeURIComponent(String(jobOrderId))}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", idempotencyKey })
    });
    const payload = await response.json().catch(() => null) as {
        data?: { status?: string; newStatus?: string; idempotent?: boolean };
        error?: string;
    } | null;
    if (!response.ok) {
        throw new Error(payload?.error || "Failed to close the Job Order.");
    }
    return {
        status: payload?.data?.status || payload?.data?.newStatus || "Closed",
        idempotent: payload?.data?.idempotent === true
    };
}
