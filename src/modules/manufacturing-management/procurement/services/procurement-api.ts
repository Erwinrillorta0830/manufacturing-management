import { Supplier, SupplierCurrencyOption, IncomingShipment, ShipmentLineItem, ShipmentExpense, RawMaterial, LinkedProduct, LinkedProductPageResponse, PSGCItem, RegisterRawMaterialPayload, PackagingVariant, BFFCatalogProduct, LandedCostAllocationRule, LandedCostAttachmentRecord, LandedCostDraftResponse, LandedCostExpenseDraft, LandedCostAuditResponse, SupplierCatalogUpdatePayload, SupplierCatalogUpdateResult, SupplierPageResponse } from "../types";
import { normalizeProductRelationId } from "../product-relation";

export type SupplierStatusFilter = "active" | "inactive" | "all";
export type SupplierForeignFilter = "all" | "local" | "foreign";

export interface SupplierDirectoryQuery {
    status: SupplierStatusFilter;
    search: string;
    foreign: SupplierForeignFilter;
    page: number;
    pageSize: number;
}

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

export async function fetchSupplierPage(query: SupplierDirectoryQuery): Promise<SupplierPageResponse> {
    const params = new URLSearchParams({
        status: query.status,
        search: query.search,
        foreign: query.foreign,
        page: String(query.page),
        pageSize: String(query.pageSize)
    });
    const res = await fetchWithSessionRetry(`/api/manufacturing/procurement/suppliers?${params.toString()}`);
    return handleResponse(res, "Failed to fetch supplier page") as Promise<SupplierPageResponse>;
}

export async function fetchActiveSupplierCurrencies(): Promise<SupplierCurrencyOption[]> {
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/supplier-currencies");
    const body = await handleResponse(res, "Failed to fetch active supplier currencies");
    return Array.isArray(body?.currencies) ? body.currencies : [];
}

export async function createSupplier(supplierData: Partial<Supplier>): Promise<unknown> {
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierData)
    });
    return handleResponse(res, "Failed to create supplier");
}

export async function fetchShipments(options: { landedCostOnly?: boolean } = {}): Promise<IncomingShipment[]> {
    const query = options.landedCostOnly ? "?landedCostOnly=true" : "";
    const res = await fetchWithSessionRetry(`/api/manufacturing/procurement/shipments${query}`);
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
        body: JSON.stringify({ shipmentId, status, expenses, allocationMethod, allocationRule: allocationMethod.replace(/^By\s+/i, ""), lineItemUpdates })
    });
    return handleResponse(res, "Failed to save and allocate expenses");
}

export async function fetchLandedCostDraft(purchaseOrderId: number): Promise<LandedCostDraftResponse> {
    const res = await fetchWithSessionRetry(`/api/manufacturing/procurement/landed-cost?purchaseOrderId=${encodeURIComponent(purchaseOrderId)}`);
    return handleResponse(res, "Failed to load landed-cost computation");
}

export async function fetchLandedCostAudit(purchaseOrderId: number, signal?: AbortSignal): Promise<LandedCostAuditResponse> {
    const res = await fetchWithSessionRetry(`/api/manufacturing/procurement/landed-cost/audit?purchaseOrderId=${encodeURIComponent(purchaseOrderId)}`, { signal });
    return handleResponse(res, "Failed to load landed-cost audit");
}

export async function saveLandedCostDraft(
    purchaseOrderId: number,
    allocationRule: LandedCostAllocationRule,
    expenses: LandedCostExpenseDraft[],
    sourceFlow?: string
): Promise<LandedCostDraftResponse> {
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/landed-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseOrderId, allocationRule, expenses, sourceFlow })
    });
    return handleResponse(res, "Failed to save landed-cost inputs");
}

export async function uploadLandedCostAttachment(
    purchaseOrderId: number,
    computationId: number,
    documentType: LandedCostAttachmentRecord["document_type"],
    file: File
): Promise<LandedCostAttachmentRecord> {
    const formData = new FormData();
    formData.set("purchaseOrderId", String(purchaseOrderId));
    formData.set("computationId", String(computationId));
    formData.set("documentType", documentType);
    formData.set("file", file, file.name);
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/landed-cost/attachments", {
        method: "POST",
        body: formData
    });
    return handleResponse(res, "Failed to upload landed-cost document");
}

export async function deleteLandedCostAttachment(purchaseOrderId: number, attachmentId: number): Promise<void> {
    const res = await fetchWithSessionRetry(`/api/manufacturing/procurement/landed-cost/attachments/${attachmentId}?purchaseOrderId=${encodeURIComponent(purchaseOrderId)}`, {
        method: "DELETE"
    });
    if (!res.ok) await handleResponse(res, "Failed to delete landed-cost document");
}

export async function fetchRawMaterials(): Promise<RawMaterial[]> {
    const res = await fetchWithSessionRetry("/api/manufacturing/finished-goods/products?limit=250&excludeRollup=true");
    const products: BFFCatalogProduct[] = await handleResponse(res, "Failed to fetch raw materials");

    // Filter to exclude finished goods while retaining variants that inherit their
    // material classification from a raw-material or packaging parent.
    const rawItems = products.filter((p: BFFCatalogProduct) => {
        const ownType = Number(p.product_type);
        if (ownType === 389 || ownType === 390) return true;
        const parentId = normalizeProductRelationId(p.parent_id);
        const parent = parentId ? products.find(candidate => Number(candidate.product_id) === parentId) : null;
        const parentType = Number(parent?.product_type);
        return parentType === 389 || parentType === 390;
    });

    return rawItems.map((p: BFFCatalogProduct) => {
        const parentIdValue = normalizeProductRelationId(p.parent_id);
        const parentItem = parentIdValue ? products.find((x: BFFCatalogProduct) => Number(x.product_id) === Number(parentIdValue)) : null;

        let catId: number | null = null;
        let catName: string | undefined = undefined;
        if (p.product_category) {
            if (typeof p.product_category === "object") {
                const pCatObj = p.product_category as { category_id?: number; id?: number; category_name?: string };
                catId = Number(pCatObj.category_id || pCatObj.id) || null;
                catName = pCatObj.category_name;
            } else if (typeof p.product_category === "number" || typeof p.product_category === "string") {
                catId = Number(p.product_category) || null;
            }
        }
        if (!catName && (p as { category_name?: string }).category_name) {
            catName = (p as { category_name?: string }).category_name;
        }

        const itemGroup = p.item_group_id && typeof p.item_group_id === "object"
            ? p.item_group_id as { item_group_id?: number; id?: number; group_name?: string }
            : null;
        const taxRate = p.tax_rate_id && typeof p.tax_rate_id === "object"
            ? p.tax_rate_id as { TaxID?: number; tax_id?: number; id?: number; VATRate?: number | string; WithholdingRate?: number | string }
            : null;
        const priceControl = p.price_control && typeof p.price_control === "object"
            ? p.price_control as { priceTypeId?: number; priceTypeName?: string }
            : null;

        return {
            product_id: p.product_id,
            parent_id: parentIdValue,
            parent_name: parentItem ? parentItem.product_name : null,
            product_code: p.product_code || `SKU-${p.product_id}`,
            product_name: p.product_name,
            description: p.description || "",
            barcode: p.barcode || "",
            product_image: p.product_image || null,
            maintaining_quantity: p.maintaining_quantity === null || p.maintaining_quantity === undefined
                ? 0
                : Number(p.maintaining_quantity),
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
            net_weight: p.net_weight == null ? null : Number(p.net_weight),
            outer_carton_weight: p.outer_carton_weight == null ? null : Number(p.outer_carton_weight),
            pallet_weight: p.pallet_weight == null ? null : Number(p.pallet_weight),
            weight_unit_id: p.weight_unit_id ? (typeof p.weight_unit_id === "object" ? p.weight_unit_id : Number(p.weight_unit_id)) : null,
            product_category: catId,
            category_name: catName,
            product_brand: p.product_brand ? (typeof p.product_brand === "object" ? Number((p.product_brand as { brand_id?: number; id?: number }).brand_id || (p.product_brand as { brand_id?: number; id?: number }).id) : Number(p.product_brand)) : null,
            product_type: p.product_type ? Number(p.product_type) : null,
            product_class: p.product_class ? Number(typeof p.product_class === "object" ? (p.product_class as { class_id?: number; id?: number }).class_id || (p.product_class as { class_id?: number; id?: number }).id : p.product_class) : null,
            product_segment: p.product_segment ? Number(typeof p.product_segment === "object" ? (p.product_segment as { segment_id?: number; id?: number }).segment_id || (p.product_segment as { segment_id?: number; id?: number }).id : p.product_segment) : null,
            product_section: p.product_section ? Number(typeof p.product_section === "object" ? (p.product_section as { section_id?: number; id?: number }).section_id || (p.product_section as { section_id?: number; id?: number }).id : p.product_section) : null,
            item_group_id: itemGroup ? Number(itemGroup.item_group_id || itemGroup.id) : (typeof p.item_group_id === "number" || typeof p.item_group_id === "string" ? Number(p.item_group_id) : null),
            item_group_name: itemGroup?.group_name || null,
            tax_rate_id: taxRate ? Number(taxRate.TaxID || taxRate.tax_id || taxRate.id) : (typeof p.tax_rate_id === "number" || typeof p.tax_rate_id === "string" ? Number(p.tax_rate_id) : null),
            tax_rate: taxRate ? {
                vatRate: Number(taxRate.VATRate || 0),
                withholdingRate: Number(taxRate.WithholdingRate || 0)
            } : null,
            regulatory_code: p.regulatory_code || null,
            regulatory_notes: p.regulatory_notes || null,
            price_control: priceControl?.priceTypeId && priceControl.priceTypeName
                ? { priceTypeId: Number(priceControl.priceTypeId), priceTypeName: priceControl.priceTypeName }
                : null,
            isActive: p.isActive === false || p.isActive === 0 || String(p.isActive).trim().toLowerCase() === "false" || String(p.isActive).trim() === "0" ? 0 : 1,
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

export async function fetchLinkedProductsPage(
    supplierId: number,
    page: number,
    pageSize: number,
    search = "",
    signal?: AbortSignal
): Promise<LinkedProductPageResponse> {
    const params = new URLSearchParams({
        supplierId: String(supplierId),
        page: String(page),
        pageSize: String(pageSize)
    });
    if (search.trim()) params.set("search", search.trim());
    const res = await fetchWithSessionRetry(`/api/manufacturing/procurement/suppliers/products?${params.toString()}`, { signal });
    return handleResponse(res, "Failed to fetch linked product page") as Promise<LinkedProductPageResponse>;
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

export async function saveSupplierCatalogUpdates(
    payload: SupplierCatalogUpdatePayload
): Promise<SupplierCatalogUpdateResult> {
    const res = await fetchWithSessionRetry("/api/manufacturing/procurement/suppliers/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    return handleResponse(res, "Failed to save supplier catalog updates");
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
