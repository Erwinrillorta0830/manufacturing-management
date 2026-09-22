import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../../directus-api";
import { getUserIdFromToken, SPRING_API_BASE, getSpringAuthHeaders } from "../../../invoice-consolidation/_auth";

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
    salesOrderDetailId?: number;
    orderId?: number;
    orderNo?: string;
    customerName?: string;
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

        let targetBranchId = Number(searchParams.get("branchId") || 0);
        let targetBranchName = "";

        let invoiceIds: number[] = [];
        let batchProductIds: number[] = [];
        let explicitDetailIds: number[] = [];

        let batchStatus = "Pending";
        let batchUpdatedAt: string | null = null;

        try {
            const [linksRes, conDetRes, batchRes] = await Promise.all([
                fetch(
                    `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&fields=invoice_id&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                ),
                fetch(
                    `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_eq]=${batchId}&fields=id,product_id,sales_order_detail_id,ordered_quantity,picked_quantity,applied_quantity,picked_at,picked_by&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                ),
                fetch(
                    `${DIRECTUS_URL}/items/consolidator/${batchId}?fields=id,status,branch_id,created_at,updated_at`,
                    { headers: directusHeaders, cache: "no-store" }
                ).catch(() => null),
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
            if (batchRes && batchRes.ok) {
                const bData = (await batchRes.json()).data;
                if (bData) {
                    batchStatus = bData.status || "Pending";
                    batchUpdatedAt = bData.updated_at || bData.created_at || null;
                    if (!targetBranchId && bData.branch_id) {
                        targetBranchId = Number(bData.branch_id);
                    }
                }
            }
        } catch (err) {
            console.warn("[consolidation-picking/allocations] Warning fetching batch metadata:", err);
        }

        // Fetch branch name if branchId is known
        if (targetBranchId > 0) {
            try {
                const brRes = await fetch(
                    `${DIRECTUS_URL}/items/branches/${targetBranchId}?fields=id,branch_name,branch_code`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (brRes.ok) {
                    const brData = (await brRes.json()).data;
                    if (brData?.branch_name) {
                        targetBranchName = brData.branch_name;
                    }
                }
            } catch (err) {
                console.warn("[consolidation-picking/allocations] Warning fetching branch info:", err);
            }
        }

        const details: { detail_id: number; order_id?: number; product_id: number }[] = [];

        if (invoiceIds.length > 0) {
            try {
                const sodRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${invoiceIds.join(",")}&fields=detail_id,order_id,product_id&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (sodRes.ok) {
                    const sodList = (await sodRes.json()).data || [];
                    details.push(...sodList);
                }
            } catch (err) {
                console.warn("[consolidation-picking/allocations] Warning fetching details by order_id:", err);
            }
        }

        if (explicitDetailIds.length > 0) {
            try {
                const sodRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_details?filter[detail_id][_in]=${explicitDetailIds.join(",")}&fields=detail_id,order_id,product_id&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (sodRes.ok) {
                    const sodList = (await sodRes.json()).data || [];
                    details.push(...sodList);
                }
            } catch (err) {
                console.warn("[consolidation-picking/allocations] Warning fetching details by detail_id:", err);
            }
        }

        const allOrderIds = [...new Set([
            ...invoiceIds,
            ...details.map((d) => Number(d.order_id)),
        ].filter(Boolean))];

        const orderNoMap = new Map<number, string>();
        const customerMap = new Map<number, string>();
        if (allOrderIds.length > 0) {
            try {
                const soRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${allOrderIds.join(",")}&fields=order_id,order_no,customer_code&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (soRes.ok) {
                    const soData: { order_id: number; order_no: string; customer_code?: string }[] = (await soRes.json()).data || [];
                    for (const s of soData) {
                        orderNoMap.set(Number(s.order_id), String(s.order_no));
                        if (s.customer_code) customerMap.set(Number(s.order_id), String(s.customer_code));
                    }
                }
            } catch (err) {
                console.warn("[consolidation-picking/allocations] Warning fetching sales orders:", err);
            }
        }

        const detailIds = [...new Set([
            ...details.map((detail) => Number(detail.detail_id)),
            ...explicitDetailIds,
        ].filter(Boolean))];
        const orderByDetail = new Map(details.map((detail) => [Number(detail.detail_id), Number(detail.order_id || 0)]));
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

        const isActiveBatch = ["Pending", "For Picking", "Picking", "Picked"].includes(batchStatus);
        const allowedStatuses = isActiveBatch ? ["Reserved", "Picked"] : ["Consumed", "Picked", "Reserved"];

        try {
            if (detailIds.length > 0) {
                const soFilter = encodeURIComponent(JSON.stringify({
                    _and: [
                        { sales_order_detail_id: { _in: detailIds } },
                        { status: { _in: allowedStatuses } },
                    ],
                }));
                let soRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_reservation?filter=${soFilter}&fields=*&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (!soRes.ok) {
                    soRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_order_reservation?filter=${soFilter}&fields=reservation_id,sales_order_detail_id,product_id,inventory_lot_id,reserved_quantity,picked_quantity,status,created_at&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                }
                if (soRes.ok) {
                    const rData = (await soRes.json()).data || [];
                    for (const row of rData) {
                        if (!isActiveBatch) {
                            if (row.status === "Reserved") continue;
                            if (batchUpdatedAt && row.created_at) {
                                const rowCreatedTime = new Date(row.created_at).getTime();
                                const batchUpdatedTime = new Date(batchUpdatedAt).getTime();
                                if (rowCreatedTime > batchUpdatedTime + 60000) continue;
                            }
                        }
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
            console.warn("[consolidation-picking/allocations] Warning fetching reservations:", err);
        }

        const productIds = [...new Set([
            ...details.map((detail) => Number(detail.product_id)).filter(Boolean),
            ...reservations.map((r) => Number(r.product_id)).filter(Boolean),
            ...batchProductIds,
        ])];

        // Fetch products, mm_lots, mm_inventory_lots, and Spring Boot batch on-hand
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
                    // Prefer branch-filtered batch on-hand if targetBranchId is available
                    if (targetBranchId > 0) {
                        const filterRes = await fetch(`${SPRING_API_BASE}/api/mm-batch-onhand/filter?branch=${targetBranchId}`, {
                            headers: springHeaders,
                            cache: "no-store",
                        }).catch(() => null);
                        if (filterRes && filterRes.ok) return filterRes;
                    }
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
        }

        type BatchMeta = {
            inventoryLotId: number;
            lotId: number;
            lotName: string;
            batchNo: string;
            expiryDate: string | null;
            manufacturingDate: string | null;
            productId: number;
            quantity: number;
            inventoryCondition: string;
            branchId?: number;
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
                const resolvedLotName = lotNameMap.get(lotId) || "Unknown";
                const batchNo = String(row.batch_no || row.lot_number || "LOT-N/A");
                const expiryDate = (row.expiry_date || row.expiration_date || null) as string | null;
                const manufacturingDate = (row.manufacturing_date || null) as string | null;
                const qty = Number(row.quantity ?? row.available_quantity ?? 0);
                const cond = String(row.inventory_condition || "GOOD");
                const branchIdVal = Number(row.branch_id || (row.branch as { id?: number })?.id || 0);

                const meta: BatchMeta = {
                    inventoryLotId: invId,
                    lotId,
                    lotName: resolvedLotName,
                    batchNo,
                    expiryDate,
                    manufacturingDate,
                    productId: pId,
                    quantity: qty,
                    inventoryCondition: cond,
                    branchId: branchIdVal || undefined,
                };

                if (invId) invLotMap.set(invId, meta);

                // For available batches, strictly enforce the consolidation's branch if known
                const isBranchMatch = !targetBranchId || branchIdVal === targetBranchId;
                if (pId && isBranchMatch) {
                    const list = productBatchMap.get(pId) || [];
                    list.push(meta);
                    productBatchMap.set(pId, list);
                }
            }
        }

        // Process Spring Boot batch onhand for enrichment
        if (springBatchRes && springBatchRes.ok) {
            try {
                const sbData = await springBatchRes.json();
                const sbList: Array<Record<string, unknown>> = Array.isArray(sbData) ? sbData : sbData?.data || [];
                for (const sb of sbList) {
                    const sbInvId = Number(sb.inventoryLotId ?? sb.inventory_lot_id ?? sb.id ?? 0);
                    const sbLotId = Number(sb.lotId ?? sb.mmLotId ?? sb.lot_id ?? sb.mm_lot_id ?? 0);
                    const sbPId = Number(sb.productId ?? sb.product_id ?? 0);
                    const sbBatchNo = String(sb.batchNo ?? sb.batch_no ?? "LOT-N/A");
                    const sbExp = (sb.expirationDate || sb.expiration_date || sb.expiryDate || sb.expiry_date || null) as string | null;
                    const sbMfg = (sb.manufacturingDate || sb.manufacturing_date || null) as string | null;
                    const sbQty = Number(sb.availableQuantity ?? sb.available_quantity ?? sb.onhandQuantity ?? sb.onhand_quantity ?? sb.quantity ?? 0);
                    const sbCond = String(sb.inventoryCondition || sb.inventory_condition || "GOOD");
                    const sbBranchId = Number(sb.branchId ?? sb.branch_id ?? 0);

                    // Strictly filter by branch if targetBranchId is present
                    if (targetBranchId > 0 && sbBranchId > 0 && sbBranchId !== targetBranchId) {
                        continue;
                    }

                    const meta: BatchMeta = {
                        inventoryLotId: sbInvId,
                        lotId: sbLotId,
                        lotName: lotNameMap.get(sbLotId) || "Unknown",
                        batchNo: sbBatchNo,
                        expiryDate: sbExp,
                        manufacturingDate: sbMfg,
                        productId: sbPId,
                        quantity: sbQty,
                        inventoryCondition: sbCond,
                        branchId: sbBranchId || targetBranchId || undefined,
                    };

                    if (sbInvId && !invLotMap.has(sbInvId)) invLotMap.set(sbInvId, meta);
                    if (sbPId) {
                        const list = productBatchMap.get(sbPId) || [];
                        const existingIdx = list.findIndex((b) => b.batchNo === sbBatchNo && b.lotId === sbLotId);
                        if (existingIdx === -1) {
                            list.push(meta);
                        } else if (sbQty > 0) {
                            list[existingIdx].quantity = sbQty;
                        }
                        productBatchMap.set(sbPId, list);
                    }
                }
            } catch (err) {
                console.warn("[consolidation-picking/allocations] Warning parsing Spring batch onhand:", err);
            }
        }

        const allocationMap = new Map<string, LotAllocationDetail>();
        for (const reservation of reservations) {
            const rawDetailObj = reservation.sales_order_detail_id ?? reservation.sales_invoice_detail_id;
            const rawDetailId = typeof rawDetailObj === "object" && rawDetailObj !== null
                ? (rawDetailObj as { detail_id?: number }).detail_id
                : rawDetailObj;
            const detailId = Number(rawDetailId || 0);
            const productId = Number(reservation.product_id || productByDetail.get(detailId) || 0);
            if (!productId) continue;

            const orderId = detailId ? orderByDetail.get(detailId) : undefined;
            const orderNo = orderId ? orderNoMap.get(orderId) : undefined;
            const customerName = orderId ? customerMap.get(orderId) : undefined;

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

            const key = `${productId}:${detailId}:${lotId}:${batchNo}:${expiryDate || ""}`;
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
                    salesOrderDetailId: detailId || undefined,
                    orderId: orderId || undefined,
                    orderNo: orderNo || undefined,
                    customerName,
                });
            }
        }

        const allocations = [...allocationMap.values()].sort((a, b) =>
            a.productName.localeCompare(b.productName)
            || (a.expiryDate || "9999-12-31").localeCompare(b.expiryDate || "9999-12-31")
            || a.lotId - b.lotId
        );

        // Build available batches strictly isolated to the respective branch
        const availableBatches: Array<{
            productId: number;
            productName: string;
            inventoryLotId: number;
            lotId: number;
            lotName: string;
            batchNo: string;
            expiryDate: string | null;
            availableQuantity: number;
            inventoryCondition: string;
            branchId?: number;
            branchName?: string;
        }> = [];

        const seenBatchKeys = new Set<string>();
        for (const pId of productIds) {
            const list = productBatchMap.get(pId) || [];
            for (const b of list) {
                if (Number(b.quantity || 0) <= 0) continue;
                // Strict branch filter
                if (targetBranchId > 0 && b.branchId && b.branchId !== targetBranchId) continue;

                const key = `${pId}:${b.inventoryLotId || 0}:${b.batchNo}:${b.lotId}`;
                if (seenBatchKeys.has(key)) continue;
                seenBatchKeys.add(key);

                availableBatches.push({
                    productId: pId,
                    productName: productNameMap.get(pId) || `Product #${pId}`,
                    inventoryLotId: b.inventoryLotId || 0,
                    lotId: b.lotId,
                    lotName: b.lotName,
                    batchNo: b.batchNo,
                    expiryDate: b.expiryDate,
                    availableQuantity: b.quantity || 0,
                    inventoryCondition: b.inventoryCondition || "GOOD",
                    branchId: b.branchId || targetBranchId || undefined,
                    branchName: targetBranchName || undefined,
                });
            }
        }

        return NextResponse.json({ allocations, availableBatches });
    } catch (e) {
        console.error("consolidation-picking/allocations GET error:", e);
        return NextResponse.json({ message: "Failed to load picking allocations" }, { status: 500 });
    }
}
