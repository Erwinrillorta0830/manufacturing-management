import type {
    InvoiceConsolidation,
    CandidateInvoice,
    StatusSummary,
    CreateConsolidationPayload,
    AuditPayload,
    PickingSavePayload,
    Branch,
    AllocationPreview,
} from "./consolidation-types";

// ─── Session-retry fetch ────────────────────────────────────────────────────

let _refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
    if (!_refreshPromise) {
        _refreshPromise = fetch("/api/auth/refresh", { method: "POST", cache: "no-store" })
            .then((r) => r.ok)
            .catch(() => false)
            .finally(() => { _refreshPromise = null; });
    }
    return _refreshPromise;
}

async function fetchWithSessionRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const res = await fetch(input, init);
    if (res.status !== 401) return res;
    const refreshed = await refreshAccessToken();
    if (!refreshed) return res;
    return fetch(input, init);
}

async function handleResponse(res: Response, fallback: string) {
    if (!res.ok) {
        let msg = fallback;
        try { const d = await res.json(); if (d?.message) msg = d.message; } catch {}
        throw new Error(msg);
    }
    return res.json();
}

// ─── Base paths ─────────────────────────────────────────────────────────────

const BASE = "/api/manufacturing/sales-and-fulfillment";
const LEGACY = "/api/manufacturing/invoice-consolidation";

// ─── Shared ─────────────────────────────────────────────────────────────────

export async function fetchBranches(): Promise<Branch[]> {
    const res = await fetchWithSessionRetry("/api/manufacturing/branches");
    return handleResponse(res, "Failed to load branches");
}

// ─── Consolidation Planning ──────────────────────────────────────────────────

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
    const res = await fetchWithSessionRetry(`${BASE}/consolidation-planning?${qs.toString()}`);
    return handleResponse(res, "Failed to load consolidations");
}

export async function fetchSummary(branchId: number): Promise<StatusSummary> {
    const res = await fetchWithSessionRetry(`${LEGACY}/summary?branchId=${branchId}`);
    return handleResponse(res, "Failed to load summary");
}

export async function fetchCandidates(branchId: number): Promise<CandidateInvoice[]> {
    const res = await fetchWithSessionRetry(`${LEGACY}/candidates?branchId=${branchId}`);
    return handleResponse(res, "Failed to load candidate invoices");
}

export async function fetchConsolidationByNo(consolidatorNo: string): Promise<InvoiceConsolidation> {
    const res = await fetchWithSessionRetry(`${LEGACY}/${encodeURIComponent(consolidatorNo)}`);
    return handleResponse(res, "Failed to load consolidation");
}

export async function createConsolidation(payload: CreateConsolidationPayload): Promise<InvoiceConsolidation> {
    const res = await fetchWithSessionRetry(`${BASE}/consolidation-planning`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    return handleResponse(res, "Failed to create consolidation");
}

export async function markReadyForPicking(batchId: number): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithSessionRetry(`${BASE}/consolidation-planning`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, action: "mark-ready" }),
    });
    return handleResponse(res, "Failed to mark batch ready for picking");
}

export async function revertBatch(batchId: number): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithSessionRetry(`${LEGACY}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
    });
    return handleResponse(res, "Failed to revert batch");
}

export async function fetchAllocationPreview(
    payload: CreateConsolidationPayload,
    signal?: AbortSignal
): Promise<AllocationPreview> {
    const res = await fetchWithSessionRetry(`${LEGACY}/allocation-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
    });
    return handleResponse(res, "Failed to preview lot allocations");
}

// ─── Consolidation Picking ───────────────────────────────────────────────────

export async function fetchPickingQueue(params: {
    branchId: number;
    page?: number;
    size?: number;
    search?: string;
}): Promise<{ content: InvoiceConsolidation[]; totalElements: number; totalPages: number }> {
    const qs = new URLSearchParams();
    qs.set("branchId", String(params.branchId));
    if (params.page != null) qs.set("page", String(params.page));
    if (params.size != null) qs.set("size", String(params.size));
    if (params.search) qs.set("search", params.search);
    const res = await fetchWithSessionRetry(`${BASE}/consolidation-picking?${qs.toString()}`);
    return handleResponse(res, "Failed to load picking queue");
}

export async function startPicking(batchId: number): Promise<{ success: boolean; message: string; status: string }> {
    const res = await fetchWithSessionRetry(`${BASE}/consolidation-picking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, action: "start" }),
    });
    return handleResponse(res, "Failed to start picking");
}

export async function completePicking(batchId: number): Promise<{ success: boolean; message: string; status: string }> {
    const res = await fetchWithSessionRetry(`${BASE}/consolidation-picking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, action: "complete" }),
    });
    return handleResponse(res, "Failed to complete picking");
}

export async function savePickedQuantities(payload: PickingSavePayload): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithSessionRetry(`${BASE}/consolidation-picking`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    return handleResponse(res, "Failed to save quantities");
}

export interface ProductStockAvailability { productId: number; availableQuantity: number; }

export async function fetchStockAvailability(batchId: number): Promise<ProductStockAvailability[]> {
    const res = await fetchWithSessionRetry(`${LEGACY}/validate-stock?batchId=${batchId}`);
    const data = await handleResponse(res, "Failed to validate stock");
    return data.availability ?? [];
}

export interface LotAllocation {
    productId: number; productName: string; lotId: number; lotName: string;
    batchNo: string; expiryDate: string | null; manufacturingDate: string | null; quantity: number;
}

export async function fetchAllocations(batchId: number): Promise<LotAllocation[]> {
    const res = await fetchWithSessionRetry(`${LEGACY}/allocations?batchId=${batchId}`);
    const data = await handleResponse(res, "Failed to load allocations");
    return data.allocations ?? [];
}

// ─── Consolidation Approval ──────────────────────────────────────────────────

export async function fetchApprovalQueue(params: {
    branchId: number;
    page?: number;
    size?: number;
    search?: string;
}): Promise<{ content: InvoiceConsolidation[]; totalElements: number; totalPages: number }> {
    const qs = new URLSearchParams();
    qs.set("branchId", String(params.branchId));
    if (params.page != null) qs.set("page", String(params.page));
    if (params.size != null) qs.set("size", String(params.size));
    if (params.search) qs.set("search", params.search);
    const res = await fetchWithSessionRetry(`${BASE}/consolidation-approval?${qs.toString()}`);
    return handleResponse(res, "Failed to load approval queue");
}

export async function approveBatch(payload: AuditPayload): Promise<{ success: boolean; message: string; checkedBy?: number }> {
    const res = await fetchWithSessionRetry(`${BASE}/consolidation-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action: "approve" }),
    });
    return handleResponse(res, "Failed to approve batch");
}

export async function repickBatch(batchId: number): Promise<{ success: boolean; message: string; compensatedCount?: number }> {
    const res = await fetchWithSessionRetry(`${BASE}/consolidation-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, action: "repick" }),
    });
    return handleResponse(res, "Failed to request re-pick");
}

// ─── Fulfillment & Deliveries ────────────────────────────────────────────────

export async function fetchFulfilmentQueue(params: {
    branchId: number;
    page?: number;
    size?: number;
    search?: string;
}): Promise<{ content: InvoiceConsolidation[]; totalElements: number; totalPages: number }> {
    const qs = new URLSearchParams();
    qs.set("branchId", String(params.branchId));
    if (params.page != null) qs.set("page", String(params.page));
    if (params.size != null) qs.set("size", String(params.size));
    if (params.search) qs.set("search", params.search);
    const res = await fetchWithSessionRetry(`${BASE}/fulfilment-and-deliveries?${qs.toString()}`);
    return handleResponse(res, "Failed to load fulfilment queue");
}

export async function dispatchBatch(batchId: number): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithSessionRetry(`${BASE}/fulfilment-and-deliveries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, action: "dispatch" }),
    });
    return handleResponse(res, "Failed to dispatch batch");
}

export async function deliverBatch(batchId: number): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithSessionRetry(`${BASE}/fulfilment-and-deliveries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, action: "deliver" }),
    });
    return handleResponse(res, "Failed to mark batch as delivered");
}
