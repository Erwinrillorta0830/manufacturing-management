import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken, SPRING_API_BASE, getSpringAuthHeaders } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface LotAllocationDetail {
    productId: number;
    productName: string;
    lotId: number;
    lotName: string;
    batchNo: string;
    expiryDate: string | null;
    manufacturingDate: string | null;
    quantity: number;
    pickedQuantity?: number;
    inventoryLotId?: number;
    reservationIds?: number[];
    status?: string;
}

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const batchId = searchParams.get("batchId");

        if (!batchId) {
            return NextResponse.json({ message: "batchId is required" }, { status: 400 });
        }

        let invoiceIds: number[] = [];
        let batchProductIds: number[] = [];
        let explicitDetailIds: number[] = [];

        try {
            const [linksRes, conDetRes] = await Promise.all([
                fetch(
                    `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&fields=invoice_id&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                ),
                fetch(
                    `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_eq]=${batchId}&fields=id,product_id,sales_order_detail_id,ordered_quantity,picked_quantity,applied_quantity,picked_at,picked_by&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                ),
            ]);
            if (linksRes.ok) {
                const linkData = (await linksRes.json()).data || [];
                invoiceIds = linkData.map((row: { invoice_id: number }) => Number(row.invoice_id)).filter(Boolean);
            }
            if (conDetRes.ok) {
                const conData = (await conDetRes.json()).data || [];
                batchProductIds = conData.map((row: { product_id: number }) => Number(row.product_id)).filter(Boolean);
                explicitDetailIds = conData.map((row: { sales_order_detail_id?: number }) => Number(row.sales_order_detail_id)).filter(Boolean);
            }
        } catch (err) {
            console.warn("[allocations] Warning fetching batch metadata:", err);
        }

        const details: { detail_id: number; product_id: number }[] = [];

        if (invoiceIds.length > 0) {
            try {
                const sodRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${invoiceIds.join(",")}&fields=detail_id,product_id&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (sodRes.ok) {
                    const sodList = (await sodRes.json()).data || [];
                    details.push(...sodList);
                }
            } catch (err) {
                console.warn("[allocations] Warning fetching details by order_id:", err);
            }
        }

        if (explicitDetailIds.length > 0) {
            try {
                const sodRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_details?filter[detail_id][_in]=${explicitDetailIds.join(",")}&fields=detail_id,product_id&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (sodRes.ok) {
                    const sodList = (await sodRes.json()).data || [];
                    details.push(...sodList);
                }
            } catch (err) {
                console.warn("[allocations] Warning fetching details by detail_id:", err);
            }
        }

        const detailIds = [...new Set([
            ...details.map((detail) => Number(detail.detail_id)),
            ...explicitDetailIds,
        ].filter(Boolean))];
        const productByDetail = new Map(details.map((detail) => [Number(detail.detail_id), Number(detail.product_id)]));

        const reservations: Array<{
            id: number;
            sales_invoice_detail_id?: number | { detail_id: number } | null;
            sales_order_detail_id?: number | { detail_id: number } | null;
            product_id?: number;
            inventory_lot_id: number | { id?: number; inventory_lot_id?: number; lot_id?: number | { lot_id?: number; lot_name?: string }; batch_no?: string; lot_number?: string; expiry_date?: string; manufacturing_date?: string };
            quantity: number;
            picked_quantity?: number;
            status?: string;
        }> = [];

        try {
            if (detailIds.length > 0) {
                const soFilter = encodeURIComponent(JSON.stringify({
                    _and: [
                        { sales_order_detail_id: { _in: detailIds } },
                        { status: { _in: ["Reserved", "Picked", "Consumed"] } },
                    ],
                }));
                let soRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_reservation?filter=${soFilter}&fields=*&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (!soRes.ok) {
                    soRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_order_reservation?filter=${soFilter}&fields=reservation_id,sales_order_detail_id,product_id,inventory_lot_id,reserved_quantity,status&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                }
                if (soRes.ok) {
                    const rData = (await soRes.json()).data || [];
                    for (const row of rData) {
                        reservations.push({
                            id: Number(row.reservation_id || row.id),
                            sales_order_detail_id: row.sales_order_detail_id,
                            sales_invoice_detail_id: null,
                            product_id: Number(row.product_id || productByDetail.get(Number(row.sales_order_detail_id)) || 0),
                            inventory_lot_id: row.inventory_lot_id,
                            quantity: Number(row.reserved_quantity ?? row.quantity ?? 0),
                            picked_quantity: Number(row.picked_quantity ?? (row.status === "Picked" ? (row.reserved_quantity ?? row.quantity ?? 0) : 0)),
                            status: row.status,
                        });
                    }
                }
            }
        } catch (err) {
            console.warn("[allocations] Warning fetching reservations:", err);
        }

        if (reservations.length > 0) {
            const productIds = [...new Set([
                ...details.map((detail) => Number(detail.product_id)).filter(Boolean),
                ...reservations.map((r) => Number(r.product_id)).filter(Boolean),
                ...batchProductIds,
            ])];

            const invLotIds = [...new Set(reservations.map((r) => {
                const raw = typeof r.inventory_lot_id === "object" && r.inventory_lot_id !== null
                    ? (r.inventory_lot_id as { inventory_lot_id?: number; id?: number }).inventory_lot_id || (r.inventory_lot_id as { inventory_lot_id?: number; id?: number }).id
                    : r.inventory_lot_id;
                return Number(raw || 0);
            }).filter(Boolean))];

            const invLotFilterObj: Record<string, unknown> = {};
            if (invLotIds.length > 0 && productIds.length > 0) {
                invLotFilterObj._or = [
                    { inventory_lot_id: { _in: invLotIds } },
                    { id: { _in: invLotIds } },
                    { product_id: { _in: productIds } },
                ];
            } else if (invLotIds.length > 0) {
                invLotFilterObj._or = [
                    { inventory_lot_id: { _in: invLotIds } },
                    { id: { _in: invLotIds } },
                ];
            } else if (productIds.length > 0) {
                invLotFilterObj.product_id = { _in: productIds };
            }

            // 1. Fetch products, mm_lots, mm_inventory_lots, and Spring Boot batch onhand in parallel
            const [prodRes, lotRes, invLotRes, springBatchRes] = await Promise.all([
                productIds.length > 0
                    ? fetch(
                          `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,product_code&limit=-1`,
                          { headers: directusHeaders, cache: "no-store" }
                      ).catch(() => null)
                    : Promise.resolve(null),
                fetch(
                    `${DIRECTUS_URL}/items/mm_lots?limit=-1&fields=*`,
                    { headers: directusHeaders, cache: "no-store" }
                ).catch(() => null),
                fetch(
                    `${DIRECTUS_URL}/items/mm_inventory_lots?limit=-1&fields=*`,
                    { headers: directusHeaders, cache: "no-store" }
                ).catch(() => null),
                (async () => {
                    try {
                        const springHeaders = await getSpringAuthHeaders();
                        return await fetch(`${SPRING_API_BASE}/api/mm-batch-onhand/all`, {
                            headers: springHeaders,
                            cache: "no-store",
                        });
                    } catch {
                        return null;
                    }
                })(),
            ]);

            const productNameMap = new Map<number, string>();
            if (prodRes && prodRes.ok) {
                const prodData: { product_id: number; product_name: string }[] = (await prodRes.json()).data || [];
                for (const p of prodData) productNameMap.set(Number(p.product_id), p.product_name);
            }

            const lotNameMap = new Map<number, string>();
            if (lotRes && lotRes.ok) {
                const lotJson = await lotRes.json();
                const lotData: Array<Record<string, unknown>> = Array.isArray(lotJson) ? lotJson : lotJson?.data || [];
                for (const l of lotData) {
                    const lid = Number(l.lot_id || l.id);
                    const lname = String(l.lot_name || l.name || l.lot_number || "").trim();
                    if (lid && lname) lotNameMap.set(lid, lname);
                }
            } else {
                console.warn("[allocations] Warning: lotRes not ok, status:", lotRes?.status);
            }

            type BatchMeta = {
                lotId: number;
                lotName: string;
                batchNo: string;
                expiryDate: string | null;
                manufacturingDate: string | null;
                productId: number;
            };

            const invLotMap = new Map<number, BatchMeta>();
            const productBatchMap = new Map<number, BatchMeta[]>();

            // Process Directus mm_inventory_lots
            if (invLotRes && invLotRes.ok) {
                const invLotJson = await invLotRes.json();
                const invLotData: Array<Record<string, unknown>> = Array.isArray(invLotJson) ? invLotJson : invLotJson?.data || [];
                for (const row of invLotData) {
                    const invId = Number(row.inventory_lot_id || row.id || 0);
                    const pId = Number(typeof row.product_id === "object" && row.product_id !== null ? (row.product_id as { product_id?: number }).product_id : row.product_id || 0);
                    const rawLotId = typeof row.lot_id === "object" && row.lot_id !== null
                        ? (row.lot_id as { lot_id?: number; id?: number }).lot_id || (row.lot_id as { lot_id?: number; id?: number }).id
                        : row.lot_id;
                    const lotId = Number(rawLotId || 0);
                    const resolvedLotName = lotNameMap.get(lotId) || (lotId ? lotNameMap.get(lotId) : undefined) || "Unknown";
                    const batchNo = String(row.batch_no || row.lot_number || "LOT-N/A");
                    const expiryDate = (row.expiry_date || row.expiration_date || null) as string | null;
                    const manufacturingDate = (row.manufacturing_date || null) as string | null;

                    const meta: BatchMeta = {
                        lotId,
                        lotName: resolvedLotName,
                        batchNo,
                        expiryDate,
                        manufacturingDate,
                        productId: pId,
                    };

                    if (invId) invLotMap.set(invId, meta);

                    if (pId) {
                        const list = productBatchMap.get(pId) || [];
                        list.push(meta);
                        productBatchMap.set(pId, list);
                    }
                }
            } else {
                console.warn("[allocations] Warning: invLotRes not ok, status:", invLotRes?.status);
            }

            // Process Spring Boot batch onhand for enrichment
            if (springBatchRes && springBatchRes.ok) {
                try {
                    const sbData = await springBatchRes.json();
                    const sbList: Array<Record<string, unknown>> = Array.isArray(sbData) ? sbData : sbData?.data || [];
                    for (const sb of sbList) {
                        const sbInvId = Number(sb.inventoryLotId ?? sb.inventory_lot_id ?? sb.id ?? 0);
                        const sbLotId = Number(sb.lotId ?? sb.lot_id ?? 0);
                        const sbPId = Number(sb.productId ?? sb.product_id ?? 0);
                        const sbBatchNo = String(sb.batchNo ?? sb.batch_no ?? "LOT-N/A");
                        const sbExp = (sb.expirationDate || sb.expiration_date || sb.expiryDate || sb.expiry_date || null) as string | null;
                        const sbMfg = (sb.manufacturingDate || sb.manufacturing_date || null) as string | null;

                        const meta: BatchMeta = {
                            lotId: sbLotId,
                            lotName: lotNameMap.get(sbLotId) || (sbLotId ? lotNameMap.get(sbLotId) : undefined) || "Unknown",
                            batchNo: sbBatchNo,
                            expiryDate: sbExp,
                            manufacturingDate: sbMfg,
                            productId: sbPId,
                        };

                        if (sbInvId && !invLotMap.has(sbInvId)) invLotMap.set(sbInvId, meta);
                        if (sbPId) {
                            const list = productBatchMap.get(sbPId) || [];
                            if (!list.some((b) => b.batchNo === sbBatchNo && b.lotId === sbLotId)) {
                                list.push(meta);
                                productBatchMap.set(sbPId, list);
                            }
                        }
                    }
                } catch (err) {
                    console.warn("[allocations] Warning parsing Spring batch onhand:", err);
                }
            }

            const allocationMap = new Map<string, LotAllocationDetail>();
            for (const reservation of reservations) {
                const rawDetailId = typeof reservation.sales_invoice_detail_id === "object" && reservation.sales_invoice_detail_id !== null
                    ? reservation.sales_invoice_detail_id.detail_id
                    : reservation.sales_invoice_detail_id;
                const detailId = Number(rawDetailId || 0);
                const productId = Number(reservation.product_id || productByDetail.get(detailId) || 0);
                if (!productId) continue;

                const rawInvId = typeof reservation.inventory_lot_id === "object" && reservation.inventory_lot_id !== null
                    ? (reservation.inventory_lot_id.inventory_lot_id || reservation.inventory_lot_id.id || 0)
                    : reservation.inventory_lot_id;
                const invLotId = Number(rawInvId || 0);

                const batchInfo = invLotMap.get(invLotId);
                const resLotObj = typeof reservation.inventory_lot_id === "object" && reservation.inventory_lot_id !== null
                    ? (reservation.inventory_lot_id as Record<string, unknown>)
                    : null;

                const lotId = batchInfo?.lotId || Number(resLotObj?.lot_id || 0) || (lotNameMap.has(invLotId) ? invLotId : 0);
                const batchNo = batchInfo?.batchNo && batchInfo.batchNo !== "LOT-N/A"
                    ? batchInfo.batchNo
                    : String(resLotObj?.batch_no || resLotObj?.lot_number || "LOT-N/A");

                const lotName = (batchInfo?.lotName && batchInfo.lotName !== "Unknown")
                    ? batchInfo.lotName
                    : (lotNameMap.get(lotId) || lotNameMap.get(invLotId) || "Unknown");

                const expiryDate = batchInfo?.expiryDate || (resLotObj?.expiry_date as string | null) || (resLotObj?.expiration_date as string | null) || null;
                const manufacturingDate = batchInfo?.manufacturingDate || (resLotObj?.manufacturing_date as string | null) || null;

                const key = `${productId}:${lotId}:${batchNo}:${expiryDate || ""}`;
                const existing = allocationMap.get(key);
                const qty = Number(reservation.quantity || 0);
                const isResPicked = reservation.status === "Picked";
                const resPickedQty = isResPicked ? qty : Number(reservation.picked_quantity || 0);
                const resId = Number(reservation.id || 0);
                if (existing) {
                    existing.quantity += qty;
                    existing.pickedQuantity = (existing.pickedQuantity || 0) + resPickedQty;
                    if (resId && existing.reservationIds && !existing.reservationIds.includes(resId)) {
                        existing.reservationIds.push(resId);
                    }
                    if (existing.pickedQuantity >= existing.quantity && existing.quantity > 0) {
                        existing.status = "Picked";
                    } else if (existing.pickedQuantity > 0) {
                        existing.status = "Partial";
                    } else {
                        existing.status = "Reserved";
                    }
                } else {
                    allocationMap.set(key, {
                        productId,
                        productName: productNameMap.get(productId) || `Product #${productId}`,
                        lotId,
                        lotName,
                        batchNo,
                        expiryDate,
                        manufacturingDate,
                        quantity: qty,
                        pickedQuantity: resPickedQty,
                        inventoryLotId: invLotId,
                        reservationIds: resId ? [resId] : [],
                        status: isResPicked ? "Picked" : (resPickedQty > 0 ? "Partial" : "Reserved"),
                    });
                }
            }

                    const allocations = [...allocationMap.values()].sort((a, b) =>
                        a.productName.localeCompare(b.productName)
                        || (a.expiryDate || "9999-12-31").localeCompare(b.expiryDate || "9999-12-31")
                        || a.lotId - b.lotId
                    );

                    console.log(`[allocations GET batchId=${batchId}] lotNameMap entries:`, Object.fromEntries(lotNameMap));
                    console.log(`[allocations GET batchId=${batchId}] returning allocations:`, JSON.stringify(allocations, null, 2));

                    if (allocations.length > 0) {
                        return NextResponse.json({ allocations });
                    }
        }

        // Fallback to Spring Boot inventory movements for legacy batches
        let allMovs: Array<Record<string, unknown>> = [];
        try {
            const springHeaders = await getSpringAuthHeaders();
            const movRes = await fetch(
                `${SPRING_API_BASE}/api/mm-inventory-movements/all`,
                { headers: springHeaders, cache: "no-store" }
            ).catch(() => null);

            if (movRes && movRes.ok) {
                const mJson = await movRes.json();
                allMovs = Array.isArray(mJson) ? mJson : mJson?.data || [];
            }
        } catch (err) {
            console.warn("[allocations] Warning querying Spring movements fallback:", err);
        }

        const movements = allMovs
            .filter((m) => Number(m.source_document_id || m.sourceDocumentId) === Number(batchId))
            .map((m) => ({
                product_id: Number(m.product_id || m.productId),
                lot_id: Number(m.lot_id || m.lotId),
                batch_no: String(m.batch_no || m.batchNo || "LOT-N/A"),
                expiry_date: (m.expiry_date || m.expiryDate || null) as string | null,
                manufacturing_date: (m.manufacturing_date || m.manufacturingDate || null) as string | null,
                quantity: Number(m.quantity || 0),
            }));

        const netMap = new Map<string, { productId: number; lotId: number; batchNo: string; expiryDate: string | null; manufacturingDate: string | null; netQty: number }>();

        for (const m of movements) {
            const key = `${m.product_id}:${m.lot_id}:${m.batch_no}:${m.expiry_date || ""}:${m.manufacturing_date || ""}`;
            const existing = netMap.get(key);
            const qty = Number(m.quantity || 0);
            if (existing) {
                existing.netQty += qty;
            } else {
                netMap.set(key, {
                    productId: m.product_id,
                    lotId: m.lot_id,
                    batchNo: m.batch_no,
                    expiryDate: m.expiry_date,
                    manufacturingDate: m.manufacturing_date,
                    netQty: qty,
                });
            }
        }

        const netNegative: { productId: number; lotId: number; batchNo: string; expiryDate: string | null; manufacturingDate: string | null; netQty: number }[] = [];
        for (const entry of netMap.values()) {
            if (entry.netQty < 0) {
                netNegative.push({ ...entry, netQty: Math.abs(entry.netQty) });
            }
        }

        if (netNegative.length === 0) {
            return NextResponse.json({ allocations: [] });
        }

        const productIds = [...new Set(netNegative.map((a) => a.productId))];
        const productNameMap = new Map<number, string>();
        if (productIds.length > 0) {
            try {
                const prodRes = await fetch(
                    `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (prodRes && prodRes.ok) {
                    const prodData: { product_id: number; product_name: string }[] = (await prodRes.json()).data || [];
                    for (const p of prodData) productNameMap.set(p.product_id, p.product_name);
                }
            } catch (err) {
                console.warn("[allocations] Fallback products warning:", err);
            }
        }

        const lotIds = [...new Set(netNegative.map((a) => a.lotId).filter(Boolean))];
        const lotNameMap = new Map<number, string>();
        if (lotIds.length > 0) {
            try {
                const lotRes = await fetch(
                    `${DIRECTUS_URL}/items/mm_lots?limit=-1&fields=lot_id,lot_name`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (lotRes && lotRes.ok) {
                    const lotData: Array<Record<string, unknown>> = (await lotRes.json()).data || [];
                    for (const l of lotData) {
                        const lid = Number(l.lot_id || l.id);
                        const lname = String(l.lot_name || "").trim();
                        if (lid && lname) lotNameMap.set(lid, lname);
                    }
                }
            } catch (err) {
                console.warn("[allocations] Fallback lots warning:", err);
            }
        }

        const allocations: LotAllocationDetail[] = netNegative.map((a) => ({
            productId: a.productId,
            productName: productNameMap.get(a.productId) || `Product #${a.productId}`,
            lotId: a.lotId,
            lotName: lotNameMap.get(a.lotId) || `Lot #${a.lotId}`,
            batchNo: a.batchNo,
            expiryDate: a.expiryDate,
            manufacturingDate: a.manufacturingDate,
            quantity: a.netQty,
        }));

        return NextResponse.json({ allocations });
    } catch (e) {
        console.error("allocations GET error:", e);
        return NextResponse.json({ allocations: [] });
    }
}
