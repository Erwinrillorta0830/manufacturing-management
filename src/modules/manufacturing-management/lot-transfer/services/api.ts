import type {
    BatchOption,
    BranchOption,
    LotOption,
    LotTransfer,
    LotTransferForm,
    LotTransferPreview,
    ProductOption
} from "../types";

interface ApiEnvelope<T> {
    success?: boolean;
    data?: T;
    totalCount?: number;
    preview?: LotTransferPreview;
    idempotent?: boolean;
}

interface LotTransferListResponse {
    data: LotTransfer[];
    totalCount: number;
}

function numberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...init,
        headers: {
            Accept: "application/json",
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...(init?.headers || {})
        },
        cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload
            ? String(payload.error)
            : `Request failed with HTTP ${response.status}.`;
        throw new Error(message);
    }
    return payload as T;
}

function unwrap<T>(payload: ApiEnvelope<T> | T): T {
    if (payload && typeof payload === "object" && "data" in payload && payload.data !== undefined) {
        return payload.data as T;
    }
    return payload as T;
}

export async function fetchLotTransfers(options: {
    status?: string;
    branchId?: number;
    search?: string;
} = {}): Promise<LotTransferListResponse> {
    const params = new URLSearchParams();
    if (options.status) params.set("status", options.status);
    if (options.branchId && options.branchId > 0) params.set("branchId", String(options.branchId));
    if (options.search?.trim()) params.set("search", options.search.trim());
    params.set("limit", "500");
    const payload = await requestJson<ApiEnvelope<LotTransfer[]>>(`/api/manufacturing/lot-transfers?${params.toString()}`);
    return {
        data: Array.isArray(payload.data) ? payload.data : [],
        totalCount: numberValue(payload.totalCount ?? payload.data?.length ?? 0)
    };
}

export async function fetchLotTransfer(id: number): Promise<LotTransfer> {
    const payload = await requestJson<ApiEnvelope<LotTransfer>>(`/api/manufacturing/lot-transfers/${id}`);
    return unwrap(payload);
}

export async function createLotTransfer(form: LotTransferForm): Promise<LotTransfer> {
    const payload = await requestJson<ApiEnvelope<LotTransfer>>("/api/manufacturing/lot-transfers", {
        method: "POST",
        body: JSON.stringify(toPayload(form))
    });
    return unwrap(payload);
}

export async function updateLotTransfer(id: number, form: LotTransferForm): Promise<LotTransfer> {
    const payload = await requestJson<ApiEnvelope<LotTransfer>>(`/api/manufacturing/lot-transfers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(toPayload(form))
    });
    return unwrap(payload);
}

export async function deleteLotTransfer(id: number): Promise<void> {
    await requestJson<{ success?: boolean }>(`/api/manufacturing/lot-transfers/${id}`, {
        method: "DELETE"
    });
}

function toPayload(form: LotTransferForm) {
    return {
        branchId: Number(form.branchId),
        productId: Number(form.productId),
        sourceLotId: Number(form.sourceLotId),
        sourceInventoryLotId: Number(form.sourceInventoryLotId),
        sourceBatchNo: form.sourceBatchNo,
        targetLotId: Number(form.targetLotId),
        targetInventoryLotId: Number(form.targetInventoryLotId),
        targetBatchNo: form.targetBatchNo,
        quantity: Number(form.quantity),
        reason: form.reason
    };
}

export async function submitLotTransfer(id: number): Promise<LotTransfer> {
    const payload = await requestJson<ApiEnvelope<LotTransfer>>(`/api/manufacturing/lot-transfers/${id}/submit`, {
        method: "POST",
        body: "{}"
    });
    return unwrap(payload);
}

export async function previewLotTransfer(id: number): Promise<LotTransferPreview> {
    const payload = await requestJson<ApiEnvelope<LotTransferPreview>>(`/api/manufacturing/lot-transfers/${id}/preview`, {
        method: "POST",
        body: "{}"
    });
    return unwrap(payload);
}

export async function approveLotTransfer(id: number): Promise<{ transfer: LotTransfer; preview: LotTransferPreview; idempotent: boolean }> {
    const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `lot-transfer-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = await requestJson<ApiEnvelope<LotTransfer>>(`/api/manufacturing/lot-transfers/${id}/approve`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: "{}"
    });
    if (!payload.data || !payload.preview) throw new Error("Approval response did not include the transfer audit result.");
    return {
        transfer: payload.data,
        preview: payload.preview,
        idempotent: Boolean(payload.idempotent)
    };
}

export async function rejectLotTransfer(id: number, rejectionReason: string, qaEvidence?: string): Promise<LotTransfer> {
    const payload = await requestJson<ApiEnvelope<LotTransfer>>(`/api/manufacturing/lot-transfers/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejectionReason, qaEvidence })
    });
    return unwrap(payload);
}

export async function fetchProducts(): Promise<ProductOption[]> {
    const payload = await requestJson<unknown>("/api/manufacturing/lots/products");
    const rows = Array.isArray(payload) ? payload : unwrap<ProductOption[]>(payload as ApiEnvelope<ProductOption[]>);
    return (Array.isArray(rows) ? rows : [])
        .map((row) => ({
            productId: numberValue((row as ProductOption).productId ?? (row as unknown as Record<string, unknown>).product_id),
            productName: stringValue((row as ProductOption).productName ?? (row as unknown as Record<string, unknown>).product_name),
            skuCode: stringValue((row as ProductOption).skuCode ?? (row as unknown as Record<string, unknown>).sku_code),
            unitCost: numberValue((row as ProductOption).unitCost ?? (row as unknown as Record<string, unknown>).unit_cost)
        }))
        .filter((row) => row.productId > 0);
}

export async function fetchLots(branchId?: number): Promise<LotOption[]> {
    const query = branchId && branchId > 0 ? `?branch_id=${encodeURIComponent(String(branchId))}` : "";
    const payload = await requestJson<unknown>(`/api/manufacturing/lots${query}`);
    const rows = Array.isArray(payload) ? payload : unwrap<LotOption[]>(payload as ApiEnvelope<LotOption[]>);
    return (Array.isArray(rows) ? rows : [])
        .map((row) => {
            const raw = row as unknown as Record<string, unknown>;
            return {
                lotId: numberValue((row as LotOption).lotId ?? raw.lot_id),
                lotName: stringValue((row as LotOption).lotName ?? raw.lot_name),
                branchId: numberValue((row as LotOption).branchId ?? raw.branch_id),
                maxBatchCapacity: numberValue((row as LotOption).maxBatchCapacity ?? raw.max_batch_capacity),
                status: stringValue((row as LotOption).status || "ACTIVE")
            };
        })
        .filter((row) => row.lotId > 0);
}

export async function fetchBatches(lotId: number): Promise<BatchOption[]> {
    const payload = await requestJson<unknown>(`/api/manufacturing/lots/batches?lotId=${encodeURIComponent(String(lotId))}`);
    const rows = Array.isArray(payload) ? payload : unwrap<BatchOption[]>(payload as ApiEnvelope<BatchOption[]>);
    return (Array.isArray(rows) ? rows : [])
        .map((row) => {
            const raw = row as unknown as Record<string, unknown>;
            return {
                batchId: numberValue((row as BatchOption).batchId ?? raw.inventory_lot_id),
                batchNumber: stringValue((row as BatchOption).batchNumber ?? raw.batch_no),
                lotId: numberValue((row as BatchOption).lotId ?? raw.lot_id),
                lotName: stringValue((row as BatchOption).lotName ?? raw.lot_name),
                branchId: numberValue((row as BatchOption).branchId ?? raw.branch_id),
                productId: numberValue((row as BatchOption).productId ?? raw.product_id),
                productName: stringValue((row as BatchOption).productName ?? raw.product_name),
                quantity: numberValue((row as BatchOption).quantity ?? raw.quantity),
                unitCost: numberValue((row as BatchOption).unitCost ?? raw.unit_cost),
                uomId: numberValue((row as BatchOption).uomId ?? raw.uom_id) || null,
                uomName: stringValue((row as BatchOption).uomName ?? raw.uom_name),
                manufacturingDate: stringValue((row as BatchOption).manufacturingDate ?? raw.manufacturing_date),
                expirationDate: stringValue((row as BatchOption).expirationDate ?? raw.expiry_date),
                qaStatus: stringValue((row as BatchOption).qaStatus ?? raw.qa_status ?? "GOOD"),
                status: stringValue((row as BatchOption).status ?? raw.status ?? "ACTIVE")
            };
        })
        .filter((row) => row.batchId > 0 && row.batchNumber && row.lotId > 0);
}

export async function fetchBranches(): Promise<BranchOption[]> {
    const payload = await requestJson<unknown>("/api/manufacturing/branches");
    const rows = Array.isArray(payload) ? payload : unwrap<BranchOption[]>(payload as ApiEnvelope<BranchOption[]>);
    return (Array.isArray(rows) ? rows : [])
        .map((row) => {
            const raw = row as unknown as Record<string, unknown>;
            return {
                id: numberValue((row as BranchOption).id ?? raw.branch_id),
                branchName: stringValue((row as BranchOption).branchName ?? raw.branch_name),
                branchCode: stringValue((row as BranchOption).branchCode ?? raw.branch_code)
            };
        })
        .filter((row) => row.id > 0);
}
