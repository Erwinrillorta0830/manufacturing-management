import type {
    JobOrderDailyYieldDetails,
    JobOrderDailyYieldSummary,
} from "../types";

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
    const payload = await response.json().catch(() => null) as { data?: T; error?: string } | null;
    if (!response.ok) {
        throw new Error(payload?.error || fallback);
    }
    return (payload?.data ?? payload) as T;
}
export async function fetchJobOrderDailyYieldSummaries(
    signal?: AbortSignal
): Promise<JobOrderDailyYieldSummary[]> {
    const response = await fetch("/api/manufacturing/production/job-order-inspection-qa", {
        signal,
        cache: "no-store"
    });
    return readResponse<JobOrderDailyYieldSummary[]>(response, "Failed to load JO Daily Yields.");
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
