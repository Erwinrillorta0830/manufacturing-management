import {
    MMInventoryMovement,
    ProductTracingFiltersType,
    BranchLookup,
    ProductTypeLookup,
    ProductLookup,
    LotLookup
} from "../types";

/**
 * Fetches branches lookup for filtering
 */
export async function fetchBranches(): Promise<BranchLookup[]> {
    try {
        const res = await fetch("/api/manufacturing/branches", { cache: "no-store" });
        if (!res.ok) {
            console.warn("[ProductTracing] Failed to fetch branches");
            return [];
        }
        const data = await res.json();
        return (data || []).map((b: { id: number; branchName?: string; branch_name?: string; branchCode?: string }) => ({
            id: b.id,
            branchName: b.branchName || b.branch_name || `Branch #${b.id}`,
            branchCode: b.branchCode,
        }));
    } catch (err) {
        console.error("[ProductTracing] Error fetching branches:", err);
        return [];
    }
}

/**
 * Fetches product types lookup (e.g. Finished Goods, Raw Materials, Packaging)
 */
export async function fetchProductTypes(): Promise<ProductTypeLookup[]> {
    try {
        const res = await fetch("/api/manufacturing/physical-inventory/product-types", { cache: "no-store" });
        if (!res.ok) {
            return [
                { id: 388, name: "Finished Goods", type_name: "Finished Goods" },
                { id: 389, name: "Raw Materials", type_name: "Raw Materials" },
                { id: 390, name: "Packaging Items", type_name: "Packaging Items" }
            ];
        }
        const data = await res.json();
        return data || [];
    } catch (err) {
        console.error("[ProductTracing] Error fetching product types:", err);
        return [
            { id: 388, name: "Finished Goods", type_name: "Finished Goods" },
            { id: 389, name: "Raw Materials", type_name: "Raw Materials" },
            { id: 390, name: "Packaging Items", type_name: "Packaging Items" }
        ];
    }
}

/**
 * Fetches products list lookup
 */
export async function fetchProducts(): Promise<ProductLookup[]> {
    try {
        const res = await fetch("/api/manufacturing/lots/products", { cache: "no-store" });
        if (!res.ok) {
            return [];
        }
        const data = await res.json();
        return (data || []).map((p: Record<string, unknown>) => ({
            productId: Number(p.productId || p.product_id || p.id),
            productName: String(p.productName || p.product_name || p.description || `Product #${p.productId || p.product_id || p.id}`),
            productCode: p.productCode ? String(p.productCode) : (p.skuCode ? String(p.skuCode) : undefined),
            skuCode: p.skuCode ? String(p.skuCode) : undefined,
            productTypeId: p.productTypeId ? Number(p.productTypeId) : undefined,
            unitName: p.unitName ? String(p.unitName) : undefined,
            costPerUnit: p.unitCost ? Number(p.unitCost) : (p.cost_per_unit ? Number(p.cost_per_unit) : null)
        }));
    } catch (err) {
        console.error("[ProductTracing] Error fetching products lookup:", err);
        return [];
    }
}

/**
 * Fetches lots list lookup
 */
export async function fetchLots(branchId?: number): Promise<LotLookup[]> {
    try {
        const query = branchId ? `?branch_id=${branchId}` : "";
        const res = await fetch(`/api/manufacturing/lots${query}`, { cache: "no-store" });
        if (!res.ok) {
            return [];
        }
        const data = await res.json();
        return (data || []).map((l: Record<string, unknown>) => ({
            lotId: Number(l.lotId || l.lot_id || l.id),
            lotName: String(l.lotName || l.lot_name || `Lot #${l.lotId || l.lot_id || l.id}`),
            branchId: Number(l.branchId || l.branch_id || 0),
            description: (l.description as string) || null,
            status: String(l.status || "ACTIVE")
        }));
    } catch (err) {
        console.error("[ProductTracing] Error fetching lots lookup:", err);
        return [];
    }
}

/**
 * Fetches movement ledger records directly from the Spring Boot API proxy endpoint.
 * Throws an error if the Spring Boot API fails (no Directus fallback).
 */
export async function fetchMovements(filters: ProductTracingFiltersType): Promise<MMInventoryMovement[]> {
    const params = new URLSearchParams();
    if (filters.branch_id !== null && filters.branch_id !== undefined) {
        params.set("branch", String(filters.branch_id));
    }
    if (filters.product_type_id !== null && filters.product_type_id !== undefined) {
        params.set("productType", String(filters.product_type_id));
    }
    if (filters.product_id !== null && filters.product_id !== undefined) {
        params.set("productId", String(filters.product_id));
    }
    if (filters.lot_id !== null && filters.lot_id !== undefined) {
        params.set("lotId", String(filters.lot_id));
    }
    if (filters.batch_no && filters.batch_no.trim()) {
        params.set("batchNo", filters.batch_no.trim());
    }
    if (filters.transaction_type && filters.transaction_type !== "ALL") {
        params.set("transactionType", filters.transaction_type);
    }
    if (filters.movement_direction && filters.movement_direction !== "ALL") {
        params.set("direction", filters.movement_direction);
    }
    if (filters.search_query && filters.search_query.trim()) {
        params.set("referenceNo", filters.search_query.trim());
    }

    params.set("_t", String(Date.now()));

    const requestUrl = `/api/manufacturing/inventory-movements?${params.toString()}`;

    console.groupCollapsed(`[MM-INVENTORY-MOVEMENTS FETCH] 🔍 Request to ${requestUrl}`);
    console.log("Active Filter State:", filters);
    console.log("Query Parameters:", Object.fromEntries(params.entries()));
    console.groupEnd();

    const res = await fetch(requestUrl, {
        cache: "no-store",
    });

    if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        const errorMessage = errorJson.error || `Spring Boot API returned status ${res.status}: ${res.statusText}`;
        console.error(`[MM-INVENTORY-MOVEMENTS ERROR] HTTP ${res.status}:`, errorMessage);
        throw new Error(errorMessage);
    }

    const data: MMInventoryMovement[] = await res.json();

    console.group(`[MM-INVENTORY-MOVEMENTS RESPONSE] ✅ Received ${data.length} Movements`);
    console.log("Total Count:", data.length);
    console.log("Movements Data Array:", data);
    if (data.length > 0) {
        console.log("Sample Item #1:", data[0]);
    }
    console.groupEnd();

    return data || [];
}
