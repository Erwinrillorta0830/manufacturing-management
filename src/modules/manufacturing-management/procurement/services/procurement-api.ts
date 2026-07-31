import { Supplier, IncomingShipment, ShipmentLineItem, ShipmentExpense, RawMaterial, LinkedProduct, PSGCItem, RegisterRawMaterialPayload, PackagingVariant, BFFCatalogProduct } from "../types";

export type SupplierStatusFilter = "active" | "inactive" | "all";

let refreshPromise: Promise<boolean> | null = null;
let sessionRedirecting = false;

export class SessionExpiredError extends Error {
    constructor() {
        super("Your session has expired. Please sign in again.");
        this.name = "SessionExpiredError";
    }
}

async function refreshAccessToken(): Promise<boolean> {
    if (!refreshPromise) {
        refreshPromise = fetch("/api/auth/refresh", {
            method: "POST",
            cache: "no-store"
        })
            .then(response => response.ok)
            .catch(() => false)
            .finally(() => {
                refreshPromise = null;
            });
    }

    return refreshPromise;
}

function redirectToLogin(): void {
    if (typeof window === "undefined" || sessionRedirecting || window.location.pathname === "/login") return;

    sessionRedirecting = true;
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

async function fetchWithSessionRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init);
    if (response.status !== 401) return response;

    const refreshed = await refreshAccessToken();
    if (!refreshed) {
        redirectToLogin();
        throw new SessionExpiredError();
    }

    const retriedResponse = await fetch(input, init);
    if (retriedResponse.status === 401) {
        redirectToLogin();
        throw new SessionExpiredError();
    }

    return retriedResponse;
}

async function handleResponse(res: Response, fallbackMessage: string) {
    if (!res.ok) {
        let errMsg = fallbackMessage;
        try {
            const data = await res.json();
            if (typeof data?.error === "string") errMsg = data.error;
            else if (typeof data?.message === "string") errMsg = data.message;
        } catch { }
        throw new Error(errMsg);
    }
    return res.json();
}

export async function fetchSuppliers(status: SupplierStatusFilter = "active"): Promise<Supplier[]> {
    const res = await fetchWithSessionRetry(`/api/manufacturing/procurement/suppliers?status=${status}`);
    return handleResponse(res, "Failed to fetch suppliers");
}

export async function createSupplier(supplierData: Partial<Supplier>): Promise<unknown> {
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierData)
    });
    return handleResponse(res, "Failed to create supplier");
}

export async function fetchShipments(): Promise<IncomingShipment[]> {
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/shipments");
    return handleResponse(res, "Failed to fetch shipments");
}

export async function fetchShipmentLineItems(shipmentId: number): Promise<ShipmentLineItem[]> {
    const res = await fetchWithSessionRetry(`/api/manufacturing/procurement/shipments?shipmentId=${shipmentId}`);
    return handleResponse(res, "Failed to fetch shipment line items");
}

export async function createShipment(shipmentData: Partial<IncomingShipment>, lineItems: unknown[]): Promise<unknown> {
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentData, lineItems })
    });
    return handleResponse(res, "Failed to create shipment");
}

export async function fetchShipmentExpenses(shipmentId: number): Promise<ShipmentExpense[]> {
    const res = await fetchWithSessionRetry(`/api/manufacturing/procurement/expenses?shipmentId=${shipmentId}`);
    return handleResponse(res, "Failed to fetch shipment expenses");
}

export async function saveAndAllocateExpenses(
    shipmentId: number,
    status: string,
    expenses: Partial<ShipmentExpense>[],
    allocationMethod: string,
    lineItemUpdates?: unknown[]
): Promise<unknown> {
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId, status, expenses, allocationMethod, lineItemUpdates })
    });
    return handleResponse(res, "Failed to save and allocate expenses");
}

export async function fetchRawMaterials(): Promise<RawMaterial[]> {
    const res = await fetchWithSessionRetry("/api/manufacturing/finished-goods/products?limit=250&excludeRollup=true");
    const products: BFFCatalogProduct[] = await handleResponse(res, "Failed to fetch raw materials");

    // Filter to exclude finished goods (include only raw materials and packaging items)
    const rawItems = products.filter((p: BFFCatalogProduct) => Number(p.product_type) === 389 || Number(p.product_type) === 390);

    return rawItems.map((p: BFFCatalogProduct) => {
        const parentIdValue = p.parent_id ? (typeof p.parent_id === "object" ? (p.parent_id as { product_id: number }).product_id : p.parent_id) : null;
        const parentItem = parentIdValue ? products.find((x: BFFCatalogProduct) => Number(x.product_id) === Number(parentIdValue)) : null;
        return {
            product_id: p.product_id,
            parent_id: parentIdValue ? Number(parentIdValue) : null,
            parent_name: parentItem ? parentItem.product_name : null,
            product_code: p.product_code || `SKU-${p.product_id}`,
            product_name: p.product_name,
            description: p.description || "",
            barcode: p.barcode || "",
            unit_of_measurement: p.unit_of_measurement ? {
                unit_id: p.unit_of_measurement.unit_id,
                unit_shortcut: p.unit_of_measurement.unit_shortcut,
                unit_name: p.unit_of_measurement.unit_name || p.unit_of_measurement.unit_shortcut
            } : undefined,
            unit_of_measurement_count: p.unit_of_measurement_count ? Number(p.unit_of_measurement_count) : null,
            cost_per_unit: Number(p.cost_per_unit || 0),
            estimated_unit_cost: Number(p.estimated_unit_cost || 0),
            density_factor: Number(p.density_factor || 1.0),
            weight: Number(p.weight || 0),
            weight_unit_id: p.weight_unit_id ? (typeof p.weight_unit_id === "object" ? p.weight_unit_id : Number(p.weight_unit_id)) : null,
            product_category: p.product_category ? (typeof p.product_category === "object" ? Number((p.product_category as { category_id?: number; id?: number }).category_id || (p.product_category as { category_id?: number; id?: number }).id) : Number(p.product_category)) : null,
            product_brand: p.product_brand ? (typeof p.product_brand === "object" ? Number((p.product_brand as { brand_id?: number; id?: number }).brand_id || (p.product_brand as { brand_id?: number; id?: number }).id) : Number(p.product_brand)) : null,
            product_type: p.product_type ? Number(p.product_type) : null,
            date_added: p.date_added,
            last_updated: p.last_updated
        };
    });
}

export async function fetchProductInventoryDetails(productId: number): Promise<Record<string, unknown>[]> {
    const res = await fetch(`/api/manufacturing/procurement/qa-receiving?productId=${encodeURIComponent(productId)}`);
    const data = await handleResponse(res, "Failed to load inventory details");
    return Array.isArray(data) ? data as Record<string, unknown>[] : [];
}

export async function registerRawMaterial(
    productDetails: RegisterRawMaterialPayload,
    supplierIds?: number[],
    packagingVariants?: PackagingVariant[]
): Promise<{ success: boolean; productId: number }> {
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/raw-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productDetails, supplierIds, packagingVariants })
    });
    return handleResponse(res, "Failed to register raw material");
}

export async function updateRawMaterial(
    productId: number,
    productDetails: RegisterRawMaterialPayload,
    supplierIds?: number[],
    packagingVariants?: PackagingVariant[]
): Promise<{ success: boolean }> {
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/raw-materials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, productDetails, supplierIds, packagingVariants })
    });
    return handleResponse(res, "Failed to update raw material");
}

export async function updateShipmentStatus(shipmentId: number, status: string): Promise<unknown> {
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/shipments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId, status })
    });
    return handleResponse(res, "Failed to update shipment status");
}

export async function updateSupplier(supplierId: number, supplierData: Partial<Supplier>): Promise<unknown> {
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/suppliers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: supplierId, ...supplierData })
    });
    return handleResponse(res, "Failed to update supplier");
}

export async function fetchLinkedProducts(supplierId: number): Promise<LinkedProduct[]> {
    const res = await fetchWithSessionRetry(`/api/manufacturing/procurement/suppliers/products?supplierId=${supplierId}`);
    return handleResponse(res, "Failed to fetch linked products");
}

export async function linkProductToSupplier(supplierId: number, productId: number): Promise<unknown> {
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/suppliers/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, productId })
    });
    return handleResponse(res, "Failed to link product to supplier");
}

export async function unlinkProductFromSupplier(linkId: number): Promise<unknown> {
    const res = await fetchWithSessionRetry(`/api/manufacturing/procurement/suppliers/products?linkId=${linkId}`, {
        method: "DELETE"
    });
    return handleResponse(res, "Failed to unlink product from supplier");
}

interface PSGCResponseItem {
    code: string;
    name: string;
}

export async function fetchPHProvinces(): Promise<PSGCItem[]> {
    try {
        const res = await fetch("https://psgc.gitlab.io/api/provinces/", { cache: "force-cache" });
        if (!res.ok) throw new Error("Failed to fetch provinces");
        const data = await res.json();

        const list = Array.isArray(data) ? data : [];
        return list.map((item: PSGCResponseItem) => ({
            code: item.code,
            name: item.name
        })).sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        console.error("[PSGC API] Error loading provinces:", e);
        return [];
    }
}

export async function fetchPHCities(provinceCode: string): Promise<PSGCItem[]> {
    if (!provinceCode) return [];
    try {
        const res = await fetch(`https://psgc.gitlab.io/api/provinces/${provinceCode}/cities-municipalities/`, { cache: "force-cache" });
        if (!res.ok) throw new Error("Failed to fetch cities");
        const data = await res.json();

        const list = Array.isArray(data) ? data : [];
        return list.map((item: PSGCResponseItem) => ({
            code: item.code,
            name: item.name
        })).sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        console.error(`[PSGC API] Error loading cities for province ${provinceCode}:`, e);
        return [];
    }
}

export async function fetchPHBarangays(cityCode: string): Promise<PSGCItem[]> {
    if (!cityCode) return [];
    try {
        const res = await fetch(`https://psgc.gitlab.io/api/cities-municipalities/${cityCode}/barangays/`, { cache: "force-cache" });
        if (!res.ok) throw new Error("Failed to fetch barangays");
        const data = await res.json();

        const list = Array.isArray(data) ? data : [];
        return list.map((item: PSGCResponseItem) => ({
            code: item.code,
            name: item.name
        })).sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        console.error(`[PSGC API] Error loading barangays for city ${cityCode}:`, e);
        return [];
    }
}
