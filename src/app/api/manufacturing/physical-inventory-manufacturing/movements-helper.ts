import { cookies } from "next/headers";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";
import { roundQty, roundMoney } from "./helper";

const SPRING_API_BASE = process.env.SPRING_API_BASE_URL || "http://100.95.246.18:8188";

export interface SpringMovement {
    movementKey?: string;
    transactionType?: string;
    movementDirection?: string; // "IN" | "OUT"
    sourceModule?: string;
    referenceId?: number;
    referenceDetailId?: number;
    referenceNo?: string;
    transactionDate?: string;
    postedAt?: string;
    postedBy?: number;
    branchId?: number;
    inventoryLotId?: number;
    lotId?: number;
    productId?: number;
    productCode?: string;
    productName?: string;
    productTypeId?: number;
    productTypeName?: string;
    unitId?: number;
    batchNo?: string;
    manufacturingDate?: string;
    expirationDate?: string;
    inventoryCondition?: string;
    quantityIn?: number;
    quantityOut?: number;
    unitCost?: number;
    differenceCost?: number;
    remarks?: string | null;
    stockType?: string;
    sourceStatus?: string;
}

export interface AggregatedMovementItem {
    branchId: number;
    inventoryLotId: number;
    lotId: number;
    productId: number;
    productCode: string;
    productName: string;
    productTypeId?: number;
    productTypeName?: string;
    unitId: number;
    batchNo: string;
    manufacturingDate?: string | null;
    expirationDate?: string | null;
    inventoryCondition: string;
    systemCount: number;
    unitCost: number;
}

/**
 * Fetches raw inventory movement items from the Spring Boot API.
 * GET http://100.95.246.18:8188/api/mm-inventory-movements/filter?branch={branchId}&productType={productTypeId}
 */
export async function fetchSpringMovements(branchId: number, productTypeId?: number | null, explicitToken?: string): Promise<SpringMovement[]> {
    try {
        let token = explicitToken;
        if (!token) {
            try {
                const cookieStore = await cookies();
                token = cookieStore.get("vos_access_token")?.value;
            } catch {
                // Ignore if cookies store unavailable outside request context
            }
        }

        const params = new URLSearchParams();
        if (branchId && branchId > 0) {
            params.append("branch", String(branchId));
        }
        if (productTypeId && productTypeId > 0) {
            params.append("productType", String(productTypeId));
        }

        const reqHeaders: Record<string, string> = {
            Accept: "application/json",
        };
        if (token) {
            reqHeaders["Authorization"] = `Bearer ${token}`;
            reqHeaders["Cookie"] = `vos_access_token=${token}`;
        }

        const endpointsToTry = [
            `${SPRING_API_BASE}/api/mm-inventory-movements/filter?${params.toString()}`,
            `${SPRING_API_BASE}/api/mm-inventory-movements/filter?branchId=${branchId}${productTypeId ? `&productTypeId=${productTypeId}` : ""}`,
            `${SPRING_API_BASE}/api/view-product-movements/filter?branchId=${branchId}`,
            `${SPRING_API_BASE}/api/mm-batch-onhand/filter?branch=${branchId}`,
            `${SPRING_API_BASE}/api/mm-batch-onhand/filter?branchId=${branchId}`,
        ];

        let list: SpringMovement[] = [];

        for (const url of endpointsToTry) {
            try {
                const res = await fetch(url, { headers: reqHeaders, cache: "no-store" });
                if (res.ok) {
                    const json = await res.json();
                    let rawData: SpringMovement[] = [];
                    if (Array.isArray(json)) {
                        rawData = json;
                    } else if (json.data && Array.isArray(json.data)) {
                        rawData = json.data;
                    }
                    if (rawData.length > 0) {
                        list = rawData;
                        break;
                    }
                }
            } catch (epErr) {
                console.warn(`[Spring API] Attempt failed for ${url}:`, epErr);
            }
        }

        if (productTypeId && productTypeId > 0 && list.length > 0) {
            list = list.filter((m) => {
                const ptId = Number(m.productTypeId || (m as Record<string, unknown>).product_type_id || 0);
                return ptId > 0 ? ptId === Number(productTypeId) : true;
            });
        }

        return list;
    } catch (err) {
        console.error("[Spring Movements API] Fetch error:", err);
        return [];
    }
}

/**
 * Aggregates a raw array of Spring movements into net on-hand item balances.
 * SUM(quantityIn - quantityOut) grouped per batch & lot.
 */
export function aggregateMovementsToItems(movements: SpringMovement[]): AggregatedMovementItem[] {
    const groupMap = new Map<string, AggregatedMovementItem>();

    for (const m of movements) {
        const bId = Number(m.branchId || 0);
        const invLotId = Number(m.inventoryLotId || 0);
        const lId = Number(m.lotId || 0);
        const pId = Number(m.productId || 0);
        const batchNo = (m.batchNo || "").trim();
        const cond = (m.inventoryCondition || "GOOD").trim().toUpperCase();

        if (!pId) continue;

        const key = invLotId > 0 ? `${bId}:${invLotId}:${cond}` : `${bId}:${pId}:${lId}:${batchNo}:${cond}`;

        const qIn = Number(m.quantityIn || 0);
        const qOut = Number(m.quantityOut || 0);
        const netQty = qIn - qOut;

        const existing = groupMap.get(key);
        if (existing) {
            existing.systemCount += netQty;
            if (Number(m.unitCost || 0) > 0) existing.unitCost = Number(m.unitCost);
        } else {
            groupMap.set(key, {
                branchId: bId,
                inventoryLotId: invLotId,
                lotId: lId,
                productId: pId,
                productCode: m.productCode || `PROD-${pId}`,
                productName: m.productName || `Product #${pId}`,
                productTypeId: m.productTypeId,
                productTypeName: m.productTypeName,
                unitId: Number(m.unitId || 1),
                batchNo: batchNo || `BATCH-${invLotId || pId}`,
                manufacturingDate: m.manufacturingDate || null,
                expirationDate: m.expirationDate || null,
                inventoryCondition: cond,
                systemCount: netQty,
                unitCost: Number(m.unitCost || 0),
            });
        }
    }

    const items: AggregatedMovementItem[] = [];
    for (const item of groupMap.values()) {
        item.systemCount = roundQty(item.systemCount);
        item.unitCost = roundMoney(item.unitCost);
        items.push(item);
    }
    return items;
}

/**
 * Returns net system count onhand for a specific item/batch/lot in a branch.
 * First queries Spring API, and falls back to Directus v_mm_batch_onhand if no movements found.
 */
export async function getSingleItemSystemOnhand(
    branchId: number,
    inventoryLotId?: number | null,
    lotId?: number | null,
    productId?: number | null,
    condition: string = "GOOD",
    productTypeId?: number | null,
    batchNo?: string | null
): Promise<number> {
    const condUpper = (condition || "GOOD").trim().toUpperCase();
    const cleanBatch = (batchNo || "").trim().toLowerCase();
    const invLotIdNum = inventoryLotId ? Number(inventoryLotId) : 0;
    const lotIdNum = lotId ? Number(lotId) : 0;
    const prodIdNum = productId ? Number(productId) : 0;

    const movements = await fetchSpringMovements(branchId, productTypeId);
    if (movements.length > 0) {
        let total = 0;
        let matched = false;

        for (const m of movements) {
            const mBranch = Number(m.branchId || 0);
            if (mBranch !== branchId) continue;

            const mProd = Number(m.productId || 0);
            if (prodIdNum > 0 && mProd !== prodIdNum) continue;

            const mLot = Number(m.lotId || 0);
            if (lotIdNum > 0 && mLot > 0 && mLot !== lotIdNum) continue;

            const mCond = (m.inventoryCondition || "GOOD").trim().toUpperCase();
            if (condUpper && mCond !== condUpper) continue;

            const mInvLot = Number(m.inventoryLotId || 0);
            const mBatch = (m.batchNo || "").trim().toLowerCase();

            // Strict Hierarchy Match Criteria (Lot ID + Batch No + Product Code)
            let isMatch = false;

            if (invLotIdNum > 0 && mInvLot > 0) {
                if (mInvLot === invLotIdNum) {
                    isMatch = true;
                }
            } else if (cleanBatch && mBatch) {
                if (mBatch === cleanBatch && (lotIdNum === 0 || mLot === lotIdNum)) {
                    isMatch = true;
                }
            } else if (invLotIdNum === 0 && !cleanBatch) {
                if (prodIdNum > 0 && mProd === prodIdNum && (lotIdNum === 0 || mLot === lotIdNum)) {
                    isMatch = true;
                }
            }

            if (isMatch) {
                total += Number(m.quantityIn || 0) - Number(m.quantityOut || 0);
                matched = true;
            }
        }

        if (matched) return roundQty(total);
    }

    // Directus Fallback - Query strictly by hierarchy
    try {
        const filterParts: string[] = [`filter[branch_id][_eq]=${encodeURIComponent(branchId)}`];

        if (invLotIdNum > 0) {
            filterParts.push(`filter[inventory_lot_id][_eq]=${encodeURIComponent(invLotIdNum)}`);
        } else {
            if (lotIdNum > 0) filterParts.push(`filter[lot_id][_eq]=${encodeURIComponent(lotIdNum)}`);
            if (prodIdNum > 0) filterParts.push(`filter[product_id][_eq]=${encodeURIComponent(prodIdNum)}`);
            if (cleanBatch) filterParts.push(`filter[batch_no][_eq]=${encodeURIComponent(cleanBatch)}`);
        }

        if (condUpper) filterParts.push(`filter[inventory_condition][_eq]=${encodeURIComponent(condUpper)}`);

        const url = `${DIRECTUS_URL}/items/v_mm_batch_onhand?${filterParts.join("&")}&limit=1`;
        const res = await fetch(url, { headers: directusHeaders, cache: "no-store" });
        if (res.ok) {
            const json = await res.json();
            if (json.data && json.data.length > 0) {
                return roundQty(json.data[0].onhand_quantity || 0);
            }
        }
    } catch (e) {
        console.error("[Movements Helper] Directus fallback error:", e);
    }

    return 0;
}
