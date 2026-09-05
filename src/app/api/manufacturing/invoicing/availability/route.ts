import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";
import { getUserIdFromToken } from "@/app/api/manufacturing/invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPRING_API_BASE = process.env.SPRING_API_BASE_URL?.replace(/\/$/, "") || "http://100.95.246.18:8188";

export interface BatchItem {
    inventoryLotId?: number;
    lotId: number;
    lotName?: string;
    batchNo: string;
    inventoryCondition: string;
    manufacturingDate?: string | null;
    expirationDate?: string | null;
    onhandQuantity: number;
}

export interface LineAvailability {
    productId: number;
    productName: string;
    productCode: string;
    unitId?: number;
    requiredQuantity: number;
    onhandQuantity: number;
    isAvailable: boolean;
    batches: BatchItem[];
}

export interface SalesOrderAvailability {
    salesOrderId: number;
    branchId: number;
    isFullyAvailable: boolean;
    lines: LineAvailability[];
}

async function getAuthToken(): Promise<string | undefined> {
    try {
        const cookieStore = await cookies();
        return (
            cookieStore.get("springboot_token")?.value ||
            cookieStore.get("vos_access_token")?.value ||
            cookieStore.get("token")?.value
        );
    } catch {
        return undefined;
    }
}

export async function GET(request: Request) {
    try {
        if (!(await getUserIdFromToken())) {
            return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const salesOrderId = Number(searchParams.get("salesOrderId"));
        if (!Number.isSafeInteger(salesOrderId) || salesOrderId < 1) {
            return NextResponse.json({ error: "salesOrderId query parameter is required." }, { status: 400 });
        }

        // 1. Fetch Sales Order header
        const orderRes = await fetch(
            `${DIRECTUS_URL}/items/sales_order/${salesOrderId}?fields=order_id,branch_id,order_status`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!orderRes.ok) {
            return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
        }
        const order = (await orderRes.json()).data;
        const branchId = Number(order.branch_id);

        // 2. Fetch Sales Order Details
        const detailsRes = await fetch(
            `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${salesOrderId}&fields=detail_id,product_id,ordered_quantity&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!detailsRes.ok) {
            return NextResponse.json({ error: "Failed to fetch sales order details." }, { status: 502 });
        }
        const details: { detail_id: number; product_id: number; ordered_quantity: number }[] =
            (await detailsRes.json()).data || [];

        if (details.length === 0) {
            return NextResponse.json({
                salesOrderId,
                branchId,
                isFullyAvailable: true,
                lines: [],
            });
        }

        const productIds = [...new Set(details.map((d) => Number(d.product_id)).filter(Boolean))];

        // 3. Fetch Product metadata (name, code, description) from Directus
        let productMap = new Map<number, { product_name: string; product_code: string; description?: string }>();
        if (productIds.length > 0) {
            const prodRes = await fetch(
                `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,product_code,description&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (prodRes.ok) {
                const prodData: { product_id: number; product_name: string; product_code: string; description?: string }[] =
                    (await prodRes.json()).data || [];
                productMap = new Map(prodData.map((p) => [p.product_id, p]));
            }
        }

        // 4. Query mm_lots and mm_inventory_lots from Directus for batch metadata
        const masterLotMap = new Map<number, string>();
        const directusInventoryLots: Array<{
            inventory_lot_id?: number;
            id?: number;
            lot_id?: number | { lot_id: number; lot_name?: string };
            product_id?: number | { product_id: number };
            batch_no?: string;
            inventory_condition?: string;
            manufacturing_date?: string | null;
            expiration_date?: string | null;
            expiry_date?: string | null;
            onhand_quantity?: number;
            branch_id?: number;
        }> = [];

        try {
            const [lotRes, invLotRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/mm_lots?limit=-1&fields=lot_id,lot_name,branch_id`, {
                    headers: directusHeaders,
                    cache: "no-store",
                }),
                fetch(
                    `${DIRECTUS_URL}/items/mm_inventory_lots?filter[product_id][_in]=${productIds.join(",")}&limit=-1&fields=inventory_lot_id,id,lot_id,product_id,batch_no,inventory_condition,manufacturing_date,expiry_date,onhand_quantity,branch_id`,
                    { headers: directusHeaders, cache: "no-store" }
                ),
            ]);

            if (lotRes.ok) {
                const lotData = (await lotRes.json()).data || [];
                for (const l of lotData) {
                    masterLotMap.set(Number(l.lot_id), String(l.lot_name || ""));
                }
            }

            if (invLotRes.ok) {
                const invData = (await invLotRes.json()).data || [];
                directusInventoryLots.push(...invData);
            }
        } catch (dirErr) {
            console.warn("[Invoicing Availability] Warning fetching mm_lots/mm_inventory_lots:", dirErr);
        }

        // 5. Query live Spring Boot stock endpoints
        const token = await getAuthToken();
        const springHeaders: Record<string, string> = { Accept: "application/json" };
        if (token) springHeaders.Authorization = `Bearer ${token}`;

        let productOnhandList: Array<{
            branchId: number;
            productId: number;
            unitId?: number;
            onhandQuantity: number;
        }> = [];

        let batchOnhandList: Array<{
            branchId: number;
            inventoryLotId?: number;
            lotId: number;
            productId: number;
            unitId?: number;
            batchNo?: string;
            inventoryCondition?: string;
            manufacturingDate?: string | null;
            expirationDate?: string | null;
            onhandQuantity: number;
        }> = [];

        try {
            const [prodRes, batchRes] = await Promise.all([
                fetch(`${SPRING_API_BASE}/api/mm-product-onhand/all`, {
                    headers: springHeaders,
                    cache: "no-store",
                }),
                fetch(`${SPRING_API_BASE}/api/mm-batch-onhand/all`, {
                    headers: springHeaders,
                    cache: "no-store",
                }),
            ]);

            if (!prodRes.ok && !batchRes.ok) {
                return NextResponse.json(
                    { error: `Spring Boot inventory service error (Product: ${prodRes.status}, Batch: ${batchRes.status}). Ensure Spring Boot is running.` },
                    { status: 503 }
                );
            }

            if (prodRes.ok) {
                productOnhandList = (await prodRes.json()) || [];
            }
            if (batchRes.ok) {
                batchOnhandList = (await batchRes.json()) || [];
            }
        } catch (springErr) {
            console.error("[Invoicing Availability] Spring Boot network failure:", springErr);
            return NextResponse.json(
                { error: `Spring Boot inventory service unreachable at ${SPRING_API_BASE}. Please ensure the service is running.` },
                { status: 503 }
            );
        }

        // Aggregate on-hand by product for this branch from Spring Boot
        const onhandByProduct = new Map<number, number>();
        for (const item of productOnhandList) {
            if (Number(item.branchId) === branchId) {
                onhandByProduct.set(
                    Number(item.productId),
                    (onhandByProduct.get(Number(item.productId)) || 0) + Number(item.onhandQuantity || 0)
                );
            }
        }

        // Create lookup for Directus mm_inventory_lots to enrich dates/conditions
        const directusBatchLookup = new Map<string, typeof directusInventoryLots[0]>();
        for (const dil of directusInventoryLots) {
            const pId = typeof dil.product_id === "object" ? Number(dil.product_id?.product_id) : Number(dil.product_id);
            const bNo = String(dil.batch_no || "").trim();
            if (pId && bNo) {
                directusBatchLookup.set(`${pId}:${bNo}`, dil);
            }
        }

        // Aggregate batches by product for this branch from Spring Boot + enriched with mm_lots / mm_inventory_lots
        const batchesByProduct = new Map<number, BatchItem[]>();
        for (const b of batchOnhandList) {
            if (Number(b.branchId) === branchId && Number(b.onhandQuantity || 0) > 0) {
                const pId = Number(b.productId);
                const list = batchesByProduct.get(pId) || [];
                const lotId = Number(b.lotId);
                const batchNo = b.batchNo || `LOT-${lotId}`;
                const matchedDil = directusBatchLookup.get(`${pId}:${batchNo}`);

                const lotName = masterLotMap.get(lotId) || undefined;
                const expirationDate = b.expirationDate || matchedDil?.expiration_date || matchedDil?.expiry_date || null;
                const manufacturingDate = b.manufacturingDate || matchedDil?.manufacturing_date || null;
                const inventoryCondition = b.inventoryCondition || matchedDil?.inventory_condition || "GOOD";

                list.push({
                    inventoryLotId: b.inventoryLotId ? Number(b.inventoryLotId) : matchedDil?.inventory_lot_id || matchedDil?.id,
                    lotId,
                    lotName,
                    batchNo,
                    inventoryCondition,
                    manufacturingDate,
                    expirationDate,
                    onhandQuantity: Number(b.onhandQuantity || 0),
                });
                batchesByProduct.set(pId, list);
            }
        }

        // If productOnhandList had no direct product row, compute from batches
        for (const [pId, batchList] of batchesByProduct.entries()) {
            if (!onhandByProduct.has(pId)) {
                const sum = batchList.reduce((acc, curr) => acc + curr.onhandQuantity, 0);
                onhandByProduct.set(pId, sum);
            }
        }

        // 6. Aggregate order quantities per product
        const requiredMap = new Map<number, number>();
        for (const d of details) {
            const pId = Number(d.product_id);
            requiredMap.set(pId, (requiredMap.get(pId) || 0) + Number(d.ordered_quantity || 0));
        }

        let isFullyAvailable = true;
        const lines: LineAvailability[] = [];

        for (const [pId, reqQty] of requiredMap.entries()) {
            const prod = productMap.get(pId);
            const onhand = onhandByProduct.get(pId) || 0;
            const isAvail = onhand >= reqQty;
            if (!isAvail) isFullyAvailable = false;

            lines.push({
                productId: pId,
                productName: prod?.description || prod?.product_name || `Product #${pId}`,
                productCode: prod?.product_code || "",
                requiredQuantity: reqQty,
                onhandQuantity: onhand,
                isAvailable: isAvail,
                batches: batchesByProduct.get(pId) || [],
            });
        }

        const result: SalesOrderAvailability = {
            salesOrderId,
            branchId,
            isFullyAvailable,
            lines,
        };

        return NextResponse.json(result);
    } catch (error) {
        console.error("[Invoicing availability] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to calculate availability." },
            { status: 500 }
        );
    }
}
