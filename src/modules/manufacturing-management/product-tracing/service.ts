import { directusFetch, getDirectusBase } from "@/app/api/arf/traceability-compliance/directus";
import {
    MMInventoryMovement,
    ProductTracingFiltersType,
    MovementSummaryStats
} from "./types";
import {
    fetchMovements,
    fetchBranches,
    fetchProductTypes,
    fetchProducts,
    fetchLots
} from "./providers/fetchProvider";

const DIRECTUS_URL = getDirectusBase();

export {
    fetchMovements,
    fetchBranches,
    fetchProductTypes,
    fetchProducts,
    fetchLots
};

/**
 * Computes KPI metric statistics from a list of movements
 */
export function computeMovementSummary(movements: MMInventoryMovement[]): MovementSummaryStats {
    let totalIn = 0;
    let totalOut = 0;
    let totalInValuation = 0;
    let totalOutValuation = 0;
    let goodBatchesCount = 0;
    let quarantinedBatchesCount = 0;
    let expiredBatchesCount = 0;
    let damagedBatchesCount = 0;

    const distinctProducts = new Set<number>();
    const distinctBatches = new Set<string>();

    movements.forEach((m) => {
        const qIn = Number(m.quantityIn || 0);
        const qOut = Number(m.quantityOut || 0);
        const cost = Number(m.unitCost || 0);

        totalIn += qIn;
        totalOut += qOut;

        totalInValuation += qIn * cost;
        totalOutValuation += qOut * cost;

        if (m.productId) distinctProducts.add(Number(m.productId));
        if (m.batchNo) distinctBatches.add(m.batchNo.trim().toLowerCase());

        const condition = String(m.inventoryCondition || "GOOD").toUpperCase();
        if (condition === "GOOD") {
            goodBatchesCount++;
        } else if (condition === "EXPIRED") {
            expiredBatchesCount++;
        } else if (condition === "DAMAGED") {
            damagedBatchesCount++;
        } else if (condition === "QUARANTINED") {
            quarantinedBatchesCount++;
        }
    });

    const netMovement = totalIn - totalOut;
    const netValuation = totalInValuation - totalOutValuation;

    return {
        totalRecords: movements.length,
        totalIn,
        totalOut,
        netMovement,
        totalInValuation,
        totalOutValuation,
        netValuation,
        goodBatchesCount,
        quarantinedBatchesCount,
        expiredBatchesCount,
        damagedBatchesCount,
        distinctProductsCount: distinctProducts.size,
        distinctBatchesCount: distinctBatches.size
    };
}

/**
 * Computes running inventory balance for each movement chronologically
 */
export function computeRunningBalances(movements: MMInventoryMovement[]): MMInventoryMovement[] {
    // Sort chronologically ascending
    const sorted = [...movements].sort((a, b) => {
        const timeA = new Date(a.transactionDate || a.postedAt || 0).getTime();
        const timeB = new Date(b.transactionDate || b.postedAt || 0).getTime();
        return timeA - timeB;
    });

    let currentBalance = 0;
    let currentValuation = 0;

    return sorted.map((m) => {
        const qIn = Number(m.quantityIn || 0);
        const qOut = Number(m.quantityOut || 0);
        const netDelta = qIn - qOut;
        const cost = Number(m.unitCost || 0);

        currentBalance += netDelta;
        currentValuation += netDelta * cost;

        return {
            ...m,
            runningBalance: currentBalance,
            runningValuation: currentValuation
        };
    });
}

// ─── Legacy Helper Functions for ARF Compatibility ───────────────────

export interface FamilyUnit {
    shortcut: string;
    name: string;
    count: number;
}

export interface ConsolidationItem {
    sales_invoice: string;
    product_name: string;
    customer_name: string;
    quantity: number;
    uom: string;
    unit_of_measurement_count: number;
    order_status: string;
    remarks: string | null;
}

interface DirectusUOM {
    unit_shortcut?: string;
    unit_name?: string;
}

interface DirectusProduct {
    product_id: number;
    parent_id: number | null;
    product_name?: string;
    unit_of_measurement?: DirectusUOM;
    unit_of_measurement_count?: number;
}

interface DirectusPIDetail {
    ph_id?: {
        id: number;
        ph_no: string;
        date_encoded: string;
    };
    product_id?: {
        product_id: number;
        parent_id: number | null;
        unit_of_measurement?: DirectusUOM;
        unit_of_measurement_count?: number;
    };
    system_count?: number;
    physical_count?: number;
}

export const isTrueStatus = (val: unknown): boolean => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val === 1;
    if (typeof val === 'string') return val === '1' || val.toLowerCase() === 'true';
    if (typeof val === 'object' && 'type' in val && (val as { type: string }).type === 'Buffer' && 'data' in val && Array.isArray((val as { data: unknown[] }).data)) {
        return (val as { data: number[] }).data[0] === 1;
    }
    return !!val;
};

export async function getFamilyUnit(productId: number | string): Promise<FamilyUnit> {
    const defaultUnit = { shortcut: "PCS", name: "Pieces", count: 1 };
    try {
        const productRes = await directusFetch<{ data: DirectusProduct[] }>(`${DIRECTUS_URL}/items/products?fields=product_id,parent_id&filter[product_id][_eq]=${productId}`);
        const mainProduct = productRes.data?.[0];
        if (!mainProduct) return defaultUnit;

        const familyRootId = mainProduct.parent_id || mainProduct.product_id;
        const familyRes = await directusFetch<{ data: DirectusProduct[] }>(`${DIRECTUS_URL}/items/products?fields=unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name,unit_of_measurement_count&filter[_or][0][product_id][_eq]=${familyRootId}&filter[_or][1][parent_id][_eq]=${familyRootId}&sort=-unit_of_measurement_count`);
        const familyProducts = familyRes.data || [];

        let bestProduct = familyProducts[0];
        let maxCount = 1;
        for (const p of familyProducts) {
            const count = p.unit_of_measurement_count || 1;
            if (count > maxCount) {
                maxCount = count;
                bestProduct = p;
            }
        }

        if (bestProduct) {
            return {
                shortcut: bestProduct.unit_of_measurement?.unit_shortcut || "PCS",
                name: bestProduct.unit_of_measurement?.unit_name || "Pieces",
                count: bestProduct.unit_of_measurement_count || 1
            };
        }
    } catch (err) {
        console.error("[Product Tracing Service] Failed to get family unit:", err);
    }
    return defaultUnit;
}

export async function fetchConsolidationItems(
    docNo: string,
    productId: number | string,
    protocolNo?: string | null,
    orderNo?: string | null,
    token?: string | null,
    inProductName?: string | null
): Promise<ConsolidationItem[]> {
    const SPRING_API = process.env.SPRING_API_BASE_URL;

    if (SPRING_API && token) {
        try {
            let finalProductName = inProductName;
            if (!finalProductName) {
                const productRes = await directusFetch<{ data: DirectusProduct[] }>(`${DIRECTUS_URL}/items/products?fields=product_name&filter[product_id][_eq]=${productId}`);
                finalProductName = productRes.data?.[0]?.product_name;
            }

            if (finalProductName) {
                const url = new URL(`${SPRING_API.replace(/\/$/, "")}/api/view-product-ledger-consolidator/filter`);
                url.searchParams.set("productName", finalProductName);
                url.searchParams.set("consolidatorNo", docNo);
                if (protocolNo) url.searchParams.set("dispatchNo", protocolNo);

                const response = await fetch(url.toString(), {
                    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
                    cache: "no-store",
                });

                if (response.ok) {
                    const data = await response.json();
                    const list = Array.isArray(data) ? data : (data ? [data] : []);

                    return list.map((item: {
                        salesInvoice?: string;
                        productName?: string;
                        customerName?: string;
                        quantity?: number;
                        uom?: string;
                        unitOfMeasurementCount?: number;
                        orderStatus?: string;
                        remarks?: string;
                    }) => ({
                        sales_invoice: String(item.salesInvoice || "No Invoice"),
                        product_name: String(item.productName || finalProductName),
                        customer_name: String(item.customerName || "N/A"),
                        quantity: Number(item.quantity || 0),
                        uom: String(item.uom || "PCS"),
                        unit_of_measurement_count: Number(item.unitOfMeasurementCount || 1),
                        order_status: String(item.orderStatus || "N/A"),
                        remarks: item.remarks || null
                    }));
                }
            }
        } catch (springErr) {
            console.error("[Product Tracing Service] Optimized Spring Path failed:", springErr);
        }
    }
    return [];
}

export async function fetchPHCountsForTracing(phNo: string) {
    if (!DIRECTUS_URL) return null;
    try {
        const cleanPhNo = phNo.trim();
        const phRes = await directusFetch<{ data: { id: number }[] }>(`${DIRECTUS_URL}/items/physical_inventory?filter[ph_no][_eq]=${encodeURIComponent(cleanPhNo)}&fields=id`);
        const phId = phRes.data?.[0]?.id;
        if (!phId) return null;

        const detailsRes = await directusFetch<{ data: DirectusPIDetail[] }>(`${DIRECTUS_URL}/items/physical_inventory_details?filter[ph_id][_eq]=${phId}&fields=product_id.product_id,product_id.parent_id,product_id.unit_of_measurement.unit_name,product_id.unit_of_measurement_count,system_count,physical_count`);
        return detailsRes.data || [];
    } catch (err) {
        console.error("[Product Tracing Service] Failed to fetch PH counts:", err);
        return null;
    }
}

export async function fetchAllFamilyPHs(branchId: number | string, parentId: number | string) {
    if (!DIRECTUS_URL) return null;
    try {
        const familyRes = await directusFetch<{ data: DirectusProduct[] }>(`${DIRECTUS_URL}/items/products?fields=product_id&filter[_or][0][product_id][_eq]=${parentId}&filter[_or][1][parent_id][_eq]=${parentId}&limit=-1`);
        const productIds = (familyRes.data || []).map((p) => p.product_id);
        if (productIds.length === 0) return null;

        const filter = {
            _and: [
                { product_id: { _in: productIds } },
                {
                    ph_id: {
                        branch_id: { _eq: Number(branchId) },
                        isCancelled: { _eq: 0 },
                        isComitted: { _eq: 1 }
                    }
                }
            ]
        };

        const detailsRes = await directusFetch<{ data: DirectusPIDetail[] }>(`${DIRECTUS_URL}/items/physical_inventory_details?filter=${encodeURIComponent(JSON.stringify(filter))}&fields=ph_id.id,ph_id.ph_no,ph_id.date_encoded,product_id.product_id,product_id.parent_id,product_id.unit_of_measurement.unit_name,product_id.unit_of_measurement_count,system_count,physical_count&limit=-1`);

        const grouped = new Map<string, DirectusPIDetail[]>();
        (detailsRes.data || []).forEach((det) => {
            const phNo = det.ph_id?.ph_no;
            if (!phNo) return;
            if (!grouped.has(phNo)) grouped.set(phNo, []);
            grouped.get(phNo)!.push(det);
        });

        return grouped;
    } catch (err) {
        console.error("[Product Tracing Service] fetchAllFamilyPHs failed:", err);
        return null;
    }
}
