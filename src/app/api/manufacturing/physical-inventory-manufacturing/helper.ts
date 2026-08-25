import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export interface MmPhysicalInventorySheet {
    physical_inventory_id: number;
    pi_no: string;
    starting_date: string;
    cutoff_date: string;
    stock_type: "OPENING" | "REGULAR";
    branch_id: number | { id?: number; branch_name?: string; branch_code?: string } | null;
    remarks?: string | null;
    status: "DRAFT" | "PENDING_REVIEW" | "COMMITTED" | "CANCELLED";
    encoder_id?: number | string | null;
    total_system_quantity?: number;
    total_physical_quantity?: number;
    total_variance?: number;
    total_difference_cost?: number;
    isCommitted?: number | boolean;
    committed_at?: string | null;
    committed_by?: number | string | null;
    isCancelled?: number | boolean;
    cancelled_at?: string | null;
    cancelled_by?: number | string | null;
    cancellation_reason?: string | null;
    created_at?: string | null;
    details?: MmPhysicalInventoryDetail[];
}

export interface MmPhysicalInventoryDetail {
    physical_inventory_detail_id?: number;
    id?: number;
    physical_inventory_id: number;
    inventory_lot_id: number | { inventory_lot_id?: number; batch_no?: string } | null;
    lot_id: number | { lot_id?: number; lot_name?: string } | null;
    product_id: number | { product_id?: number; product_name?: string; product_code?: string; unit_of_measurement?: number | string | { unit_id?: number; unit_shortcut?: string; unit_name?: string } } | null;
    unit_id: number | { unit_id?: number; unit_name?: string; unit_shortcut?: string } | null;
    batch_no?: string | null;
    manufacturing_date?: string | null;
    expiration_date?: string | null;
    inventory_condition: string;
    system_count: number;
    physical_count: number;
    variance?: number;
    unit_cost: number;
    difference_cost?: number;
    remarks?: string | null;
}

export interface MmLot {
    lot_id: number;
    lot_name: string;
    branch_id: number | { id?: number; branch_name?: string };
    unit_id: number | { unit_id?: number; unit_shortcut?: string; unit_name?: string };
    max_batch_capacity: number;
    description?: string | null;
    created_by?: number | string | null;
    status?: string | null;
    isActive?: number | boolean;
}

export interface MmInventoryLot {
    inventory_lot_id: number;
    lot_id: number | { lot_id?: number; lot_name?: string };
    branch_id: number | { id?: number; branch_name?: string };
    product_id: number | { product_id?: number; product_name?: string; product_code?: string; product_shelf_life?: number; unit_of_measurement?: number };
    batch_no: string;
    manufacturing_date?: string | null;
    expiry_date?: string | null;
    expiration_date?: string | null;
    unit_cost: number;
    qa_status?: string | null;
    status?: string | null;
    source_type?: string | null;
    source_reference?: string | null;
    created_by?: number | string | null;
}

export function parseBooleanFlag(value: unknown): boolean {
    if (value === true || value === 1 || value === "1" || value === "true" || value === "TRUE") {
        return true;
    }
    return false;
}

export function extractId(value: unknown, defaultKey = "id"): number {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const raw = record[defaultKey] ?? record.id ?? record.product_id ?? record.lot_id ?? record.inventory_lot_id ?? record.unit_id ?? record.branch_id;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function roundMoney(amount: number | string | null | undefined): number {
    const numeric = Number(amount || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 100) / 100;
}

export function roundQty(qty: number | string | null | undefined): number {
    const numeric = Number(qty || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 1000000) / 1000000;
}

export async function generateMmPiNo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `MM-PI-${year}-`;
    try {
        const url = `${DIRECTUS_URL}/items/mm_physical_inventory?filter[pi_no][_starts_with]=${prefix}&sort=-physical_inventory_id&limit=1&fields=pi_no`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (res.ok) {
            const json = await res.json();
            if (json.data && json.data.length > 0) {
                const latestNo: string = json.data[0].pi_no || "";
                const parts = latestNo.split("-");
                const lastNumStr = parts[parts.length - 1];
                const lastNum = parseInt(lastNumStr, 10);
                if (!isNaN(lastNum)) {
                    const nextNum = lastNum + 1;
                    return `${prefix}${String(nextNum).padStart(6, "0")}`;
                }
            }
        }
    } catch (e) {
        console.error("Error generating MM PI number:", e);
    }
    const randomSuffix = Math.floor(1 + Math.random() * 999999);
    return `${prefix}${String(randomSuffix).padStart(6, "0")}`;
}

export async function recalculateHeaderTotals(sheetId: number): Promise<{
    total_system_quantity: number;
    total_physical_quantity: number;
    total_variance: number;
    total_difference_cost: number;
}> {
    const detailsUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details?filter[physical_inventory_id][_eq]=${sheetId}&limit=-1`;
    const res = await fetch(detailsUrl, { headers, cache: "no-store" });
    if (!res.ok) {
        return { total_system_quantity: 0, total_physical_quantity: 0, total_variance: 0, total_difference_cost: 0 };
    }
    const json = await res.json();
    const details: MmPhysicalInventoryDetail[] = json.data || [];

    let totalSys = 0;
    let totalPhys = 0;
    let totalVar = 0;
    let totalDiffCost = 0;

    for (const d of details) {
        const sys = roundQty(d.system_count);
        const phys = roundQty(d.physical_count);
        const variance = roundQty(phys - sys);
        const cost = roundMoney(d.unit_cost);
        const diffCost = roundMoney(variance * cost);

        totalSys += sys;
        totalPhys += phys;
        totalVar += variance;
        totalDiffCost += diffCost;
    }

    totalSys = roundQty(totalSys);
    totalPhys = roundQty(totalPhys);
    totalVar = roundQty(totalVar);
    totalDiffCost = roundMoney(totalDiffCost);

    const updateUrl = `${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}`;
    await fetch(updateUrl, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
            total_system_quantity: totalSys,
            total_physical_quantity: totalPhys,
            total_variance: totalVar,
            total_difference_cost: totalDiffCost,
        }),
    });

    return {
        total_system_quantity: totalSys,
        total_physical_quantity: totalPhys,
        total_variance: totalVar,
        total_difference_cost: totalDiffCost,
    };
}

/**
 * Resolves unit price for a list of product IDs under the specified priceTypeId.
 * Checks product_per_price_type first, then product_version_prices, then fallback cost_per_unit on products, defaulting to 0.
 */
export async function resolveBatchPrices(productIds: number[], priceTypeId?: number | null): Promise<Map<number, number>> {
    const priceMap = new Map<number, number>();
    if (!productIds || productIds.length === 0) return priceMap;
    const uniqueProductIds = Array.from(new Set(productIds.map((id) => Number(id)).filter((id) => id > 0)));

    if (priceTypeId && priceTypeId > 0 && uniqueProductIds.length > 0) {
        // 1. Check product_per_price_type
        try {
            const filterUrl = `${DIRECTUS_URL}/items/product_per_price_type?filter[price_type_id][_eq]=${priceTypeId}&filter[product_id][_in]=${uniqueProductIds.join(",")}&limit=-1`;
            const res = await fetch(filterUrl, { headers, cache: "no-store" });
            if (res.ok) {
                const json = await res.json();
                const list: Array<Record<string, unknown>> = json.data || [];
                list.forEach((row) => {
                    const pId = extractId(row.product_id);
                    const val = Number(row.price ?? row.cost_per_unit ?? 0);
                    if (pId > 0 && !isNaN(val) && val > 0) {
                        priceMap.set(pId, roundMoney(val));
                    }
                });
            }
        } catch (e) {
            console.error("[resolveBatchPrices] product_per_price_type error:", e);
        }

        // 2. Check product_version_prices for remaining missing products
        const missingIds = uniqueProductIds.filter((id) => !priceMap.has(id));
        if (missingIds.length > 0) {
            try {
                const pvpUrl = `${DIRECTUS_URL}/items/product_version_prices?filter[price_type_id][_eq]=${priceTypeId}&filter[version_id][product_id][_in]=${missingIds.join(",")}&limit=-1`;
                const pvpRes = await fetch(pvpUrl, { headers, cache: "no-store" });
                if (pvpRes.ok) {
                    const pvpJson = await pvpRes.json();
                    const list: Array<Record<string, unknown>> = pvpJson.data || [];
                    list.forEach((row) => {
                        const vObj = row.version_id;
                        const pId = typeof vObj === "object" && vObj !== null ? extractId((vObj as Record<string, unknown>).product_id) : 0;
                        const val = Number(row.cost_per_unit ?? row.price_per_unit ?? 0);
                        if (pId > 0 && !priceMap.has(pId) && !isNaN(val) && val > 0) {
                            priceMap.set(pId, roundMoney(val));
                        }
                    });
                }
            } catch (e) {
                console.error("[resolveBatchPrices] product_version_prices error:", e);
            }
        }
    }

    // 3. Fallback: products table cost_per_unit
    const stillMissing = uniqueProductIds.filter((id) => !priceMap.has(id));
    if (stillMissing.length > 0) {
        try {
            const prodUrl = `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${stillMissing.join(",")}&fields=product_id,cost_per_unit&limit=-1`;
            const prodRes = await fetch(prodUrl, { headers, cache: "no-store" });
            if (prodRes.ok) {
                const pJson = await prodRes.json();
                const list: Array<Record<string, unknown>> = pJson.data || [];
                list.forEach((p) => {
                    const pId = extractId(p.product_id);
                    const val = Number(p.cost_per_unit || 0);
                    if (pId > 0 && !priceMap.has(pId)) {
                        priceMap.set(pId, !isNaN(val) && val > 0 ? roundMoney(val) : 0);
                    }
                });
            }
        } catch (e) {
            console.error("[resolveBatchPrices] products fallback error:", e);
        }
    }

    // Default to 0 for any unpriced products
    uniqueProductIds.forEach((id) => {
        if (!priceMap.has(id)) priceMap.set(id, 0);
    });

    return priceMap;
}

export async function resolveProductPrice(productId: number, priceTypeId?: number | null): Promise<number> {
    const map = await resolveBatchPrices([productId], priceTypeId);
    return map.get(productId) || 0;
}
