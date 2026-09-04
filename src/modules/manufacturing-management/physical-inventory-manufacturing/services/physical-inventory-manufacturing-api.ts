import {
    MmPhysicalInventorySheet,
    MmPhysicalInventoryDetail,
    MmOffsetPairing,
    MmLot,
    MmInventoryLot,
    Branch,
    Product,
    ProductType,
    PriceType,
    Unit,
    PhysicalInventoryFilters,
} from "../types";

const API_BASE = "/api/manufacturing/physical-inventory-manufacturing";

export async function fetchPhysicalInventorySheets(filters?: PhysicalInventoryFilters): Promise<MmPhysicalInventorySheet[]> {
    const params = new URLSearchParams();
    if (filters?.pi_no) params.append("pi_no", filters.pi_no);
    if (filters?.branch_id) params.append("branch_id", filters.branch_id);
    if (filters?.stock_type) params.append("stock_type", filters.stock_type);
    if (filters?.status) params.append("status", filters.status);
    if (filters?.search) params.append("search", filters.search);

    const res = await fetch(`${API_BASE}?${params.toString()}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to fetch physical inventory list");
    }
    return json.data || [];
}

export async function fetchPhysicalInventorySheet(id: number): Promise<MmPhysicalInventorySheet> {
    const res = await fetch(`${API_BASE}/${id}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to fetch physical inventory sheet");
    }
    return json.data;
}

export async function createPhysicalInventoryHeader(payload: {
    branch_id: number;
    stock_type?: "OPENING" | "REGULAR";
    product_type_id?: number | null;
    price_type_id?: number | null;
    starting_date?: string;
    cutoff_date?: string;
    remarks?: string;
}): Promise<MmPhysicalInventorySheet> {
    const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to create physical inventory header");
    }
    return json.data;
}

export async function updatePhysicalInventoryHeader(
    id: number,
    payload: { starting_date?: string; cutoff_date?: string; remarks?: string; stock_type?: "OPENING" | "REGULAR"; product_type_id?: number | null; price_type_id?: number | null }
): Promise<MmPhysicalInventorySheet> {
    const res = await fetch(`${API_BASE}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update physical inventory header");
    }
    return json.data;
}

export async function addPhysicalInventoryDetail(
    sheetId: number,
    payload: {
        inventory_lot_id: number;
        lot_id: number;
        product_id: number;
        is_draft?: boolean;
        draft_batch_id?: number;
        physical_count?: number | null;
        inventory_condition: string;
        remarks?: string;
        batch_no?: string;
        manufacturing_date?: string | null;
        expiry_date?: string | null;
        expiration_date?: string | null;
        unit_cost?: number;
    }
): Promise<MmPhysicalInventoryDetail> {
    const res = await fetch(`${API_BASE}/${sheetId}/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to add detail row");
    }
    return json.data;
}

export async function updatePhysicalInventoryDetail(
    sheetId: number,
    detailId: number,
    payload: { physical_count?: number | null; inventory_condition?: string; remarks?: string }
): Promise<MmPhysicalInventoryDetail> {
    const res = await fetch(`${API_BASE}/${sheetId}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ physical_inventory_detail_id: detailId, ...payload }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update detail row");
    }
    return json.data;
}

export async function removePhysicalInventoryDetail(sheetId: number, detailId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/${sheetId}/details?detail_id=${detailId}`, {
        method: "DELETE",
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to remove detail row");
    }
}

export async function populatePhysicalInventorySheet(id: number, productTypeId?: number | null): Promise<{ message?: string; count?: number }> {
    const res = await fetch(`${API_BASE}/${id}/populate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_type_id: productTypeId }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to populate physical inventory items");
    }
    return json;
}

export async function submitPhysicalInventorySheet(id: number): Promise<MmPhysicalInventorySheet> {
    const res = await fetch(`${API_BASE}/${id}/submit`, { method: "POST" });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to submit physical inventory sheet");
    }
    return json.data;
}

export async function returnToDraftPhysicalInventorySheet(id: number): Promise<MmPhysicalInventorySheet> {
    const res = await fetch(`${API_BASE}/${id}/return-to-draft`, { method: "POST" });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to return sheet to draft");
    }
    return json.data;
}

export async function commitPhysicalInventorySheet(id: number): Promise<MmPhysicalInventorySheet> {
    const res = await fetch(`${API_BASE}/${id}/commit`, { method: "POST" });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to commit physical inventory sheet");
    }
    return json.data;
}

export async function cancelPhysicalInventorySheet(id: number, cancellation_reason: string): Promise<MmPhysicalInventorySheet> {
    const res = await fetch(`${API_BASE}/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancellation_reason }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to cancel physical inventory sheet");
    }
    return json.data;
}

export async function fetchLotsByBranch(branchId: number): Promise<MmLot[]> {
    const res = await fetch(`${API_BASE}/lots?branch_id=${branchId}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to fetch lots");
    }
    return json.data || [];
}

export async function createMmLot(payload: {
    lot_name: string;
    branch_id: number;
    unit_id: number;
    max_batch_capacity: number;
    description?: string;
}): Promise<MmLot> {
    const res = await fetch(`${API_BASE}/lots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to create lot");
    }
    return json.data;
}

export async function fetchBatchesByLotAndProduct(lotId: number, productId: number): Promise<MmInventoryLot[]> {
    const res = await fetch(`${API_BASE}/batches?lot_id=${lotId}&product_id=${productId}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to fetch batches");
    }
    return json.data || [];
}

export async function createMmDraftBatch(payload: {
    physical_inventory_id?: number;
    lot_id: number;
    branch_id: number;
    product_id: number;
    batch_no: string;
    manufacturing_date?: string;
    expiry_date?: string;
    unit_cost?: number;
    source_reference?: string;
}): Promise<MmInventoryLot> {
    const res = await fetch(`${API_BASE}/batches/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to create draft batch");
    }
    return json.data;
}

export async function createMmBatch(payload: {
    lot_id: number;
    branch_id: number;
    product_id: number;
    batch_no: string;
    manufacturing_date?: string;
    expiry_date?: string;
    unit_cost?: number;
    source_reference?: string;
}): Promise<MmInventoryLot> {
    const res = await fetch(`${API_BASE}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to create batch");
    }
    return json.data;
}

export async function fetchSystemOnhand(branchId: number, lotId: number, productId: number, condition = "GOOD", inventoryLotId?: number): Promise<number> {
    const params = new URLSearchParams({
        branch_id: String(branchId),
        lot_id: String(lotId),
        product_id: String(productId),
        condition,
    });
    if (inventoryLotId) params.append("inventory_lot_id", String(inventoryLotId));

    const res = await fetch(`${API_BASE}/onhand?${params.toString()}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json.success) return 0;
    return json.data?.onhand_quantity || 0;
}

export async function fetchMasterData(): Promise<{ branches: Branch[]; products: Product[]; units: Unit[]; product_types: ProductType[]; price_types: PriceType[] }> {
    try {
        const res = await fetch(`${API_BASE}/master-data`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json.success) {
            return { branches: [], products: [], units: [], product_types: [], price_types: [] };
        }
        return {
            branches: json.data?.branches || [],
            products: json.data?.products || [],
            units: json.data?.units || [],
            product_types: json.data?.product_types || [],
            price_types: json.data?.price_types || [],
        };
    } catch {
        return { branches: [], products: [], units: [], product_types: [], price_types: [] };
    }
}

export async function fetchMasterPriceTypes(): Promise<PriceType[]> {
    try {
        const data = await fetchMasterData();
        return data.price_types;
    } catch {
        return [];
    }
}

export async function fetchMasterBranches(): Promise<Branch[]> {
    try {
        const res = await fetch("/api/manufacturing/branches", { cache: "no-store" });
        if (!res.ok) return [];
        const json = await res.json();
        const list: Array<Record<string, unknown>> = Array.isArray(json) ? json : (json.data || json.branches || []);
        return list.map((b) => ({
            id: Number(b.id || 0),
            branch_name: String(b.branch_name || b.branchName || `Branch #${b.id}`),
            branchName: String(b.branchName || b.branch_name || `Branch #${b.id}`),
            branch_code: String(b.branch_code || b.branchCode || ""),
            branchCode: String(b.branchCode || b.branch_code || ""),
            isActive: typeof b.isActive === "boolean" || typeof b.isActive === "number" ? b.isActive : 1,
        }));
    } catch (e) {
        console.error("Error fetching branches:", e);
        return [];
    }
}

export async function fetchMasterProducts(): Promise<Product[]> {
    try {
        const res = await fetch(`${API_BASE}/master-data`, { cache: "no-store" });
        const json = await res.json();
        return json.data?.products || [];
    } catch {
        return [];
    }
}

export async function fetchMasterProductTypes(): Promise<ProductType[]> {
    try {
        const res = await fetch(`${API_BASE}/master-data`, { cache: "no-store" });
        const json = await res.json();
        const pts = json.data?.product_types || [];
        if (pts.length > 0) return pts;

        const fallbackRes = await fetch("/api/manufacturing/physical-inventory/product-types", { cache: "no-store" });
        if (fallbackRes.ok) {
            const fallbackJson = await fallbackRes.json();
            return Array.isArray(fallbackJson) ? fallbackJson : [];
        }
        return [];
    } catch {
        return [];
    }
}

export async function fetchMasterUnits(): Promise<Unit[]> {
    try {
        const res = await fetch("/api/manufacturing/lots/uoms", { cache: "no-store" });
        if (res.ok) {
            const json = await res.json();
            const list: Array<Record<string, unknown>> = Array.isArray(json) ? json : (json.data || []);
            if (list.length > 0) {
                return list.map((u) => ({
                    unit_id: Number(u.unit_id || u.unitId || u.id || 0),
                    unit_name: String(u.unit_name || u.unitName || `Unit #${u.unit_id || u.unitId}`),
                    unit_shortcut: String(u.unit_shortcut || u.unitShortcut || u.unit_name || u.unitName || ""),
                }));
            }
        }

        const mdRes = await fetch(`${API_BASE}/master-data`, { cache: "no-store" });
        if (mdRes.ok) {
            const mdJson = await mdRes.json();
            const rawUnits: Array<Record<string, unknown>> = mdJson.data?.units || [];
            return rawUnits.map((u) => ({
                unit_id: Number(u.unit_id || u.unitId || u.id || 0),
                unit_name: String(u.unit_name || u.unitName || `Unit #${u.unit_id || u.unitId}`),
                unit_shortcut: String(u.unit_shortcut || u.unitShortcut || u.unit_name || u.unitName || ""),
            }));
        }
        return [];
    } catch {
        return [];
    }
}

export async function savePhysicalInventoryOffsetPairings(
    piId: number,
    pairings: MmOffsetPairing[]
): Promise<MmOffsetPairing[]> {
    try {
        const res = await fetch(`${API_BASE}/${piId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ offset_pairings: pairings }),
        });
        if (res.ok) {
            const json = await res.json();
            return json.data?.offset_pairings || pairings;
        }
        return pairings;
    } catch (e) {
        console.error("Failed to save offset pairings to backend:", e);
        return pairings;
    }
}

