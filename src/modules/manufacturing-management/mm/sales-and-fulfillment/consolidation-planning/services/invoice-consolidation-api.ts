import { InvoiceConsolidation, CandidateInvoice, StatusSummary, CreateConsolidationPayload, AuditPayload, PickingSavePayload, Branch, AllocationPreview } from "../types";

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
    if (!refreshPromise) {
        refreshPromise = fetch("/api/auth/refresh", {
            method: "POST",
            cache: "no-store",
        })
            .then((res) => res.ok)
            .catch(() => false)
            .finally(() => {
                refreshPromise = null;
            });
    }
    return refreshPromise;
}

async function fetchWithSessionRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init);
    if (response.status !== 401) return response;
    const refreshed = await refreshAccessToken();
    if (!refreshed) return response;
    return fetch(input, init);
}

async function handleResponse(res: Response, fallback: string) {
    if (!res.ok) {
        let msg = fallback;
        try {
            const data = await res.json();
            if (data?.message) msg = data.message;
        } catch {}
        throw new Error(msg);
    }
    return res.json();
}

export async function fetchBranches(): Promise<Branch[]> {
    const res = await fetchWithSessionRetry("/api/manufacturing/branches");
    return handleResponse(res, "Failed to load branches");
}

export async function fetchConsolidations(params: {
    branchId: number;
    page?: number;
    size?: number;
    status?: string;
    search?: string;
}): Promise<{ content: InvoiceConsolidation[]; totalElements: number; totalPages: number }> {
    const qs = new URLSearchParams();
    qs.set("branchId", String(params.branchId));
    if (params.page != null) qs.set("page", String(params.page));
    if (params.size != null) qs.set("size", String(params.size));
    if (params.status) qs.set("status", params.status);
    if (params.search) qs.set("search", params.search);
    const res = await fetchWithSessionRetry(`/api/manufacturing/invoice-consolidation?${qs.toString()}`);
    return handleResponse(res, "Failed to load consolidations");
}

export async function fetchSummary(branchId: number): Promise<StatusSummary> {
    const res = await fetchWithSessionRetry(`/api/manufacturing/invoice-consolidation/summary?branchId=${branchId}`);
    return handleResponse(res, "Failed to load summary");
}

export async function fetchCandidates(branchId: number): Promise<CandidateInvoice[]> {
    const res = await fetchWithSessionRetry(`/api/manufacturing/invoice-consolidation/candidates?branchId=${branchId}`);
    return handleResponse(res, "Failed to load candidate invoices");
}

export async function fetchConsolidationByNo(consolidatorNo: string): Promise<InvoiceConsolidation> {
    const res = await fetchWithSessionRetry(`/api/manufacturing/invoice-consolidation/${encodeURIComponent(consolidatorNo)}`);
    return handleResponse(res, "Failed to load consolidation");
}

export async function createConsolidation(payload: CreateConsolidationPayload): Promise<InvoiceConsolidation> {
    const res = await fetchWithSessionRetry("/api/manufacturing/invoice-consolidation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    return handleResponse(res, "Failed to create consolidation");
}

export async function fetchAllocationPreview(
    payload: CreateConsolidationPayload,
    signal?: AbortSignal
): Promise<AllocationPreview> {
    const res = await fetchWithSessionRetry("/api/manufacturing/invoice-consolidation/allocation-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
    });
    return handleResponse(res, "Failed to preview lot allocations");
}

export async function auditBatch(payload: AuditPayload): Promise<{ success: boolean; message: string; checkedBy?: number }> {
    const res = await fetchWithSessionRetry("/api/manufacturing/invoice-consolidation/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    return handleResponse(res, "Failed to audit batch");
}

export interface ProductStockAvailability {
    productId: number;
    availableQuantity: number;
}

export async function fetchStockAvailability(batchId: number): Promise<ProductStockAvailability[]> {
    const res = await fetchWithSessionRetry(
        `/api/manufacturing/invoice-consolidation/validate-stock?batchId=${batchId}`
    );
    const data = await handleResponse(res, "Failed to validate stock");
    return data.availability ?? [];
}

export interface LotAllocation {
    productId: number;
    productName: string;
    lotId: number;
    lotName: string;
    batchNo: string;
    expiryDate: string | null;
    manufacturingDate: string | null;
    quantity: number;
}

export async function fetchAllocations(batchId: number): Promise<LotAllocation[]> {
    const res = await fetchWithSessionRetry(`/api/manufacturing/invoice-consolidation/allocations?batchId=${batchId}`);
    const data = await handleResponse(res, "Failed to load allocations");
    return data.allocations ?? [];
}

export async function repickBatch(batchId: number): Promise<{ success: boolean; message: string; compensatedCount?: number }> {
    const res = await fetchWithSessionRetry("/api/manufacturing/invoice-consolidation/audit/repick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
    });
    return handleResponse(res, "Failed to re-pick batch");
}

export async function revertBatch(batchId: number): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithSessionRetry("/api/manufacturing/invoice-consolidation/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
    });
    return handleResponse(res, "Failed to revert batch");
}

export async function startPicking(batchId: number): Promise<{ success: boolean; message: string; status: string }> {
    const res = await fetchWithSessionRetry("/api/manufacturing/invoice-consolidation/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, action: "start" }),
    });
    return handleResponse(res, "Failed to start picking");
}

export async function completePicking(batchId: number): Promise<{ success: boolean; message: string; status: string }> {
    const res = await fetchWithSessionRetry("/api/manufacturing/invoice-consolidation/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, action: "complete" }),
    });
    return handleResponse(res, "Failed to complete picking");
}

export async function savePickedQuantities(payload: PickingSavePayload): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithSessionRetry("/api/manufacturing/invoice-consolidation/pick", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    return handleResponse(res, "Failed to save quantities");
}
