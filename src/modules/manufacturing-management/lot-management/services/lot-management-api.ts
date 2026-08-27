import {
    Lot,
    CreateLotPayload,
    UpdateLotPayload,
    UnitOfMeasure,
    Batch,
    CreateBatchPayload,
    UpdateBatchPayload,
    Branch,
    ProductItem,
    InventoryMovement
} from "../types";

export async function fetchBranches(): Promise<Branch[]> {
    const res = await fetch("/api/manufacturing/branches", { cache: "no-store" });
    if (!res.ok) {
        throw new Error("Failed to fetch branches lookup from BFF");
    }
    return await res.json();
}

export async function fetchProducts(): Promise<ProductItem[]> {
    const res = await fetch("/api/manufacturing/lots/products", { cache: "no-store" });
    if (!res.ok) {
        throw new Error("Failed to fetch products lookup from BFF");
    }
    return await res.json();
}

export async function fetchLots(): Promise<Lot[]> {
    const res = await fetch(`/api/manufacturing/lots?_t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) {
        throw new Error("Failed to fetch lots from BFF");
    }
    return await res.json();
}

export async function createLot(payload: CreateLotPayload): Promise<{ success: boolean; data: Lot }> {
    const res = await fetch("/api/manufacturing/lots", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to create lot via BFF");
    }
    return await res.json();
}

export async function updateLot(
    lotId: number,
    payload: UpdateLotPayload
): Promise<{ success: boolean; data: Lot }> {
    const res = await fetch(`/api/manufacturing/lots/${lotId}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to update lot ${lotId} via BFF`);
    }
    const data = await res.json();
    return { success: true, data };
}

export async function deleteLot(lotId: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/manufacturing/lots/${lotId}`, {
        method: "DELETE"
    });
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to delete lot ${lotId} via BFF`);
    }
    return await res.json();
}

export async function fetchUoms(): Promise<UnitOfMeasure[]> {
    const res = await fetch("/api/manufacturing/lots/uoms", { cache: "no-store" });
    if (!res.ok) {
        throw new Error("Failed to fetch UOM lookup from BFF");
    }
    return await res.json();
}

// ─── Batch API Functions ─────────────────────────────────────────────

export async function fetchBatches(lotId?: number): Promise<Batch[]> {
    const query = lotId ? `?lotId=${lotId}&_t=${Date.now()}` : `?_t=${Date.now()}`;
    const res = await fetch(`/api/manufacturing/lots/batches${query}`, { cache: "no-store" });
    if (!res.ok) {
        throw new Error("Failed to fetch batches from BFF");
    }
    return await res.json();
}

export async function createBatch(payload: CreateBatchPayload): Promise<{ success: boolean; data: Batch }> {
    const res = await fetch("/api/manufacturing/lots/batches", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to register batch via BFF");
    }
    return await res.json();
}

export async function updateBatch(
    batchId: number,
    payload: UpdateBatchPayload
): Promise<{ success: boolean; data: Batch }> {
    const res = await fetch(`/api/manufacturing/lots/batches/${batchId}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to update batch ${batchId} via BFF`);
    }
    return await res.json();
}

export async function deleteBatch(batchId: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/manufacturing/lots/batches/${batchId}`, {
        method: "DELETE"
    });
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to delete batch ${batchId} via BFF`);
    }
    return await res.json();
}

// ─── Inventory Movement API Functions (/api/mm-inventory-movements/all) ───

export async function fetchInventoryMovements(params?: {
    branchId?: number;
    lotId?: number;
    productId?: number;
    batchNo?: string;
    direction?: string;
    transactionType?: string;
    referenceNo?: string;
}): Promise<InventoryMovement[]> {
    const searchParams = new URLSearchParams();
    if (params?.branchId) searchParams.append("branch", String(params.branchId));
    if (params?.lotId) searchParams.append("lotId", String(params.lotId));
    if (params?.productId) searchParams.append("productId", String(params.productId));
    if (params?.batchNo) searchParams.append("batchNo", params.batchNo);
    if (params?.direction && params.direction !== "ALL") searchParams.append("direction", params.direction);
    if (params?.transactionType && params.transactionType !== "ALL") searchParams.append("transactionType", params.transactionType);
    if (params?.referenceNo) searchParams.append("referenceNo", params.referenceNo);
    searchParams.append("_t", String(Date.now()));

    const queryStr = searchParams.toString();
    const res = await fetch(`/api/manufacturing/inventory-movements?${queryStr}`, { cache: "no-store" });
    if (!res.ok) {
        throw new Error("Failed to fetch inventory movements from BFF");
    }
    return await res.json();
}

