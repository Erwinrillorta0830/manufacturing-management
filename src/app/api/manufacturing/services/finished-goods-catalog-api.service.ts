// VOS ERP - Finished Goods Catalog API Service

import { DIRECTUS_URL, headers } from "./core-api.service";
import { productUpdateAuditFields } from "../product-audit";

// Data Interfaces
export interface DirectusProductCurrencyProfile {
    id: number;
    product_id: number;
    is_foreign_sourced: boolean;
    purchase_currency: "PHP" | "USD";
    purchase_price: number | null;
}

export interface DirectusProduct {
    product_id: number;
    product_name: string;
    product_code: string;
    description: string;
    short_description?: string | null;
    unit_of_measurement: { unit_id: number; unit_name: string; unit_shortcut: string } | null;
    cost_per_unit: number;
    price_per_unit: number;
    barcode?: string | null;
    parent_id?: number | null;
    density_factor?: number | null;
    weight?: number | null;
    net_weight?: number | null;
    outer_carton_weight?: number | null;
    pallet_weight?: number | null;
    weight_unit_id?: number | { id?: number; unit_id?: number; code?: string; unit_shortcut?: string; name?: string; unit_name?: string } | null;
    has_versions?: boolean;
    currency_profile?: DirectusProductCurrencyProfile | null;
    created_at?: string | null;
    created_by?: number | string | null;
    updated_at?: string | null;
    updated_by?: number | string | null;
}

export interface DirectusBOM {
    bom_id: number;
    product_id: number;
    bom_name: string;
    base_quantity: number;
    expected_yield_percentage: number;
    is_active: boolean;
    version: { id: number; version_name: string; created_at?: string; custom_overhead?: number | null } | number | null;
    custom_overhead?: number | null;
    valid_from?: string;
    valid_to?: string;
}

export interface DirectusUnit {
    unit_id: number;
    unit_name: string;
    unit_shortcut: string;
}

export interface DirectusBOMComponent {
    component_id: number;
    bom_id: number;
    component_product_id: number;
    quantity_required: number;
    unit_of_measurement: { unit_id: number; unit_name: string; unit_shortcut: string } | null;
    wastage_factor_percentage: number;
    component_type: "raw_material" | "sub_assembly" | "by_product";
    landed_cost?: number | null;
}

export interface DirectusOperation {
    id: number;
    operation_name: string;
}

export interface DirectusRouting {
    routing_id: number;
    bom_id: number;
    operation_name: string;
    operation_id?: number | null;
    step_batch_size?: number;
    estimated_overhead_cost: number;
    duration_hours: number;
    sequence_order: number;
}

export interface DirectusBOMComponentInput {
    id?: string | number;
    productId: number;
    quantity: number;
    uom?: string | null;
    uomId?: number | null;
    wastagePercent: number;
    type?: "raw_material" | "sub_assembly" | "by_product" | null;
    landedCost?: number | null;
}

export interface DirectusRoutingStepInput {
    id?: string | number;
    sequence: number;
    name: string;
    operationId?: number | null;
    stepBatchSize?: number;
    machineHourlyRate: number;
    durationHours: number;
}

export interface CostRollupResult {
    productId: number;
    productName: string;
    sku: string;
    bomId: number | null;
    bomVersion: string | number;
    materialsCost: number;
    stepBatchSize?: number;
    machineOverheadCost: number;
    customOverheadCost: number;
    additionalOperatingOverhead: number;
    totalOverheadExpenses: number;
    includedInCogs: number;
    excludedFromCogs: number;
    preYieldDirectCost: number;
    routingsCost: number;
    yieldPercentage: number;
    yieldFactor: number;
    totalBaseCost: number;
    targetSellingPrice: number;
    grossProfit: number;
    grossMarginPercent: number;
    netProfit: number;
    netMarginPercent: number;
    marginBasis: "sales";
    costTree: CostNode[];
}

export interface CostNode {
    id: string;
    name: string;
    type: "ingredient" | "by_product" | "routing" | "sub_assembly";
    quantity: number;
    uom: string;
    unitCost: number;
    wastagePercent: number;
    totalCost: number;
    stepBatchSize?: number;
    machineRate?: number;
    machineHours?: number;
    children?: CostNode[];
}

export interface DirectusProductVersion {
    id: number;
    product_id: number;
    version_name: string;
}

/**
 * 1. Fetches all products registered in the database.
 */
export async function fetchAllProducts(search?: string, limit: number = -1): Promise<DirectusProduct[]> {
    try {
        const explicitFields = "product_id,product_name,product_code,description,isActive,cost_per_unit,price_per_unit,product_brand,barcode,parent_id.product_id,parent_id.product_name,product_category.category_name,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name,unit_of_measurement_count,product_image,density_factor,weight,net_weight,outer_carton_weight,pallet_weight,weight_unit_id,product_type,created_at,created_by,updated_at,updated_by";
        let url = `${DIRECTUS_URL}/items/products?limit=${limit}&fields=${explicitFields}`;
        if (search && search.trim()) {
            url += `&search=${encodeURIComponent(search.trim())}`;
        }
        
        const [prodRes, versionsRes, profilesRes] = await Promise.all([
            fetch(url, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_product_version?limit=-1&fields=product_id`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/product_currency_profiles?limit=-1`, { headers, cache: "no-store" })
        ]);

        if (!prodRes.ok) throw new Error(`Directus failed to fetch products: ${prodRes.status}`);
        const prodJson = await prodRes.json();
        const products: DirectusProduct[] = prodJson.data || [];

        const versionProductIds = new Set<number>();
        if (versionsRes.ok) {
            const versionsJson = await versionsRes.json();
            const versions = versionsJson.data || [];
            versions.forEach((v: { product_id: number }) => {
                if (v.product_id) {
                    versionProductIds.add(Number(v.product_id));
                }
            });
        }

        const profiles = profilesRes.ok ? (await profilesRes.json()).data || [] : [];
        const profilesMap = new Map<number, DirectusProductCurrencyProfile>();
        profiles.forEach((p: DirectusProductCurrencyProfile) => {
            profilesMap.set(Number(p.product_id), p);
        });

        products.forEach((p: DirectusProduct) => {
            p.has_versions = versionProductIds.has(Number(p.product_id));
            p.currency_profile = profilesMap.get(Number(p.product_id)) || null;
        });

        products.sort((a: DirectusProduct, b: DirectusProduct) => {
            if (a.has_versions && !b.has_versions) return -1;
            if (!a.has_versions && b.has_versions) return 1;
            return a.product_name.localeCompare(b.product_name);
        });

        return products;
    } catch (error) {
        console.error("[Manufacturing Directus API] Error fetching products:", error);
        return [];
    }
}

/**
 * 1b. Fetches all unit definitions registered in the database.
 */
export async function fetchAllUnits(): Promise<DirectusUnit[]> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, next: { revalidate: 60 } });
        if (!res.ok) throw new Error(`Directus failed to fetch units: ${res.status}`);
        const json = await res.json();
        return json.data || [];
    } catch (error) {
        console.error("[Manufacturing Directus API] Error fetching units:", error);
        return [];
    }
}

/**
 * Utility to update product cost field.
 */
export async function updateProductStandardCost(productId: number, standardCost: number, userId?: number | null): Promise<boolean> {
    try {
        const url = `${DIRECTUS_URL}/items/products/${productId}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                cost_per_unit: standardCost,
                ...productUpdateAuditFields(userId)
            })
        });
        return res.ok;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed standard cost update:", e);
        return false;
    }
}

/**
 * Registers a new product version in the database.
 */
export async function createProductVersion(productId: number, versionName: string): Promise<number | null> {
    try {
        const url = `${DIRECTUS_URL}/items/manufacturing_product_version`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                product_id: productId,
                version_name: versionName,
                created_at: new Date().toISOString()
            })
        });
        if (!res.ok) throw new Error("Failed to create product version");
        const json = await res.json();
        return json.data?.id || null;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed product version registration:", e);
        return null;
    }
}

/**
 * Updates product overheads.
 */
export async function getProductOverheads(productId: number, versionId: number): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/product_overheads?filter[product_id][_eq]=${productId}&filter[version_id][_eq]=${versionId}&fields=*,overhead_id.*&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        const json = res.ok ? await res.json() : { data: [] };
        let data = json.data || [];
        
        if (data.length === 0) {
            const latestUrl = `${DIRECTUS_URL}/items/product_overheads?filter[product_id][_eq]=${productId}&sort=-date_created&fields=*,overhead_id.*&limit=100`;
            const resLatest = await fetch(latestUrl, { headers, cache: "no-store" });
            const latestData = resLatest.ok ? (await resLatest.json()).data || [] : [];
            if (latestData.length > 0) {
                const latestVersionId = latestData[0].version_id;
                data = latestData.filter((o: { version_id?: unknown }) => o.version_id === latestVersionId);
            }
        }
        return data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed fetching product overheads:", e);
        return [];
    }
}

export async function syncProductOverheads(
    productId: number,
    versionId: number,
    overheads: { id?: string | number; overheadId: number; amount: number }[]
): Promise<boolean> {
    try {
        const url = `${DIRECTUS_URL}/items/product_overheads?filter[product_id][_eq]=${productId}&filter[version_id][_eq]=${versionId}&limit=-1`;
        const resGet = await fetch(url, { headers, cache: "no-store" });
        const existing: { id: number }[] = resGet.ok ? (await resGet.json()).data || [] : [];
        const uiIds = new Set(overheads.map(o => String(o.id)));
        
        const toDelete = existing.filter(e => !uiIds.has(String(e.id)));
        for (const item of toDelete) {
            await fetch(`${DIRECTUS_URL}/items/product_overheads/${item.id}`, { method: "DELETE", headers });
        }
        
        for (const item of overheads) {
            const payload = {
                product_id: productId,
                version_id: versionId,
                overhead_id: Number(item.overheadId),
                amount: Number(item.amount) || 0
            };
            const isNew = isNaN(Number(item.id));
            if (isNew) {
                await fetch(`${DIRECTUS_URL}/items/product_overheads`, { method: "POST", headers, body: JSON.stringify(payload) });
            } else {
                await fetch(`${DIRECTUS_URL}/items/product_overheads/${item.id}`, { method: "PATCH", headers, body: JSON.stringify(payload) });
            }
        }
        return true;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed syncing product overheads:", e);
        return false;
    }
}

/**
 * Fetch all reusable overhead types.
 */
export async function fetchAllOverheadTypes(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/overhead_types?limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed fetching overhead types:", e);
        return [];
    }
}

/**
 * Creates a new overhead type variable.
 */
export async function createOverheadType(name: string): Promise<unknown> {
    try {
        const url = `${DIRECTUS_URL}/items/overhead_types`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ overhead_name: name })
        });
        if (!res.ok) return null;
        return (await res.json()).data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create overhead type:", e);
        return null;
    }
}

/**
 * Fetch operations.
 */
export async function fetchAllOperations(): Promise<DirectusOperation[]> {
    try {
        const url = `${DIRECTUS_URL}/items/manufacturing_operations?limit=-1&sort=operation_name`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed fetching operations:", e);
        return [];
    }
}

/**
 * Creates a new manufacturing operation.
 */
export async function createOperation(name: string): Promise<DirectusOperation | null> {
    try {
        const url = `${DIRECTUS_URL}/items/manufacturing_operations`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ operation_name: name })
        });
        if (!res.ok) return null;
        return (await res.json()).data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create manufacturing operation:", e);
        return null;
    }
}

/**
 * Updates product details.
 */
export async function updateProductDetails(
    productId: number,
    details: {
        product_name?: string;
        product_code?: string;
        description?: string;
        barcode?: string;
        price_per_unit?: number;
        density_factor?: number;
        product_brand?: number;
        product_category?: number;
        cost_per_unit?: number;
        product_class?: number;
        product_segment?: number;
        product_section?: number;
        product_shelf_life?: number;
        unit_of_measurement_count?: number;
        product_image?: string;
    },
    userId?: number | null
): Promise<boolean> {
    try {
        const url = `${DIRECTUS_URL}/items/products/${productId}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                ...details,
                ...productUpdateAuditFields(userId)
            })
        });
        return res.ok;
    } catch (e) {
        console.error(`[Manufacturing Directus API] Failed updating product details:`, e);
        return false;
    }
}
