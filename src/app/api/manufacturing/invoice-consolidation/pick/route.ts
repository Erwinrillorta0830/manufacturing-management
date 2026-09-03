import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../_auth";
import { getPhTimestamp } from "../_time-utils";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { batchId, action } = body;

        if (!batchId || !action) {
            return NextResponse.json({ message: "batchId and action are required" }, { status: 400 });
        }

        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const getRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator?filter[id][_eq]=${batchId}&filter[is_delete][_eq]=0&limit=1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!getRes.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${getRes.status})` }, { status: getRes.status });
        }

        const items = (await getRes.json()).data || [];
        if (items.length === 0) {
            return NextResponse.json({ message: "Batch not found" }, { status: 404 });
        }

        const consolidator = items[0];
        const currentStatus = consolidator.status || "Pending";

        if (action === "start") {
            if (currentStatus !== "Pending" && currentStatus !== "For Picking") {
                return NextResponse.json({ message: "Only Pending or For Picking batches can start picking" }, { status: 400 });
            }
            const phNow = getPhTimestamp();
            const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({ status: "Picking", updated_at: phNow }),
            });
            if (!patchRes.ok) {
                return NextResponse.json({ message: `Failed to update status (HTTP ${patchRes.status})` }, { status: patchRes.status });
            }

            // Transition all linked sales orders to For Picking
            const invoiceLinksRes2 = await fetch(
                `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&fields=invoice_id&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (invoiceLinksRes2.ok) {
                const invoiceIds2: number[] = ((await invoiceLinksRes2.json()).data || [])
                    .map((row: { invoice_id: number }) => Number(row.invoice_id))
                    .filter(Boolean);
                if (invoiceIds2.length > 0) {
                    for (const orderId of invoiceIds2) {
                        await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                            method: "PATCH",
                            headers: directusHeaders,
                            body: JSON.stringify({
                                order_status: "For Picking",
                                for_picking_at: phNow,
                                modified_date: phNow,
                                modified_by: userId,
                                updated_at: phNow,
                            }),
                        }).catch((err) => {
                            console.warn(`[pick] Failed to update sales_order ${orderId}:`, err);
                        });
                    }
                }
            }

            return NextResponse.json({ success: true, message: "Batch moved to Picking", status: "Picking" });
        }

        if (action === "complete") {
            if (currentStatus !== "Picking" && currentStatus !== "For Picking") {
                return NextResponse.json({ message: "Only Picking or For Picking batches can be completed" }, { status: 400 });
            }

            // Optional explicit order-level distributions from manual override modal:
            // orderDistributions: Array<{ orderId: number; invoiceId?: number; productId: number; pickedQuantity: number }>
            const manualOrderDistributions = Array.isArray(body.orderDistributions) ? body.orderDistributions : null;

            // --- Load details ---
            const detailRes = await fetch(
                `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_eq]=${batchId}&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (!detailRes.ok) {
                return NextResponse.json({ message: "Failed to load batch details" }, { status: 502 });
            }
            const details: { id: number; product_id: number; ordered_quantity: number; picked_quantity: number }[] = (await detailRes.json()).data || [];

            if (details.length === 0) {
                return NextResponse.json({ message: "Batch has no details" }, { status: 400 });
            }

            const phNow = getPhTimestamp();

            // Load linked invoices / sales orders
            const invoiceLinksRes = await fetch(
                `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&fields=invoice_id&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            let invoiceIds: number[] = [];
            if (invoiceLinksRes.ok) {
                invoiceIds = ((await invoiceLinksRes.json()).data || [])
                    .map((row: { invoice_id: number }) => Number(row.invoice_id))
                    .filter(Boolean);
            }

            // Fetch candidate sales orders for FIFS sorting and status updates
            const salesOrdersMap = new Map<number, { order_id: number; order_date?: string; created_date?: string }>();
            if (invoiceIds.length > 0) {
                const soListRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${invoiceIds.join(",")}&fields=order_id,order_date,created_date&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (soListRes.ok) {
                    const soList = (await soListRes.json()).data || [];
                    for (const so of soList) {
                        salesOrdersMap.set(Number(so.order_id), so);
                    }
                }
            }

            const orderItemDetails: { detail_id: number; order_id: number; product_id: number; ordered_quantity?: number }[] = [];
            if (invoiceIds.length > 0) {
                const [sodRes, sidRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${invoiceIds.join(",")}&fields=detail_id,order_id,product_id,ordered_quantity&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.join(",")}&fields=detail_id,invoice_no,product_id,quantity&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);
                if (sodRes.ok) {
                    const sodData = (await sodRes.json()).data || [];
                    orderItemDetails.push(...sodData.map((d: { detail_id: number; order_id: number; product_id: number; ordered_quantity?: number }) => ({
                        detail_id: Number(d.detail_id),
                        order_id: Number(d.order_id),
                        product_id: Number(d.product_id),
                        ordered_quantity: Number(d.ordered_quantity || 0),
                    })));
                }
                if (sidRes.ok) {
                    const sidData = (await sidRes.json()).data || [];
                    orderItemDetails.push(...sidData.map((d: { detail_id: number; invoice_no: number; product_id: number; quantity?: number }) => ({
                        detail_id: Number(d.detail_id),
                        order_id: Number(d.invoice_no),
                        product_id: Number(d.product_id),
                        ordered_quantity: Number(d.quantity || 0),
                    })));
                }
            }

            // Calculate Order-Level Pick Distribution (Auto FIFS or Manual Override)
            const orderProductPickedMap = new Map<string, number>(); // `${orderId}:${productId}` -> pickedQty

            if (manualOrderDistributions && manualOrderDistributions.length > 0) {
                for (const dist of manualOrderDistributions) {
                    const targetOrdId = Number(dist.orderId || dist.invoiceId);
                    const prodId = Number(dist.productId);
                    const qty = Math.max(0, Number(dist.pickedQuantity) || 0);
                    if (targetOrdId && prodId) {
                        orderProductPickedMap.set(`${targetOrdId}:${prodId}`, qty);
                    }
                }
            } else {
                // Default: Auto-Distribute via First-In, First-Served (FIFS) by order_date
                for (const d of details) {
                    const prodId = Number(d.product_id);
                    let remainingBudget = Number(d.picked_quantity ?? d.ordered_quantity ?? 0);

                    // Find all order lines for this product
                    const matchingLines = orderItemDetails.filter((item) => item.product_id === prodId);

                    // Sort matching order lines by sales order date ASC, then order_id ASC (FIFS)
                    matchingLines.sort((a, b) => {
                        const soA = salesOrdersMap.get(a.order_id);
                        const soB = salesOrdersMap.get(b.order_id);
                        const dateA = new Date(soA?.order_date || soA?.created_date || 0).getTime();
                        const dateB = new Date(soB?.order_date || soB?.created_date || 0).getTime();
                        if (dateA !== dateB) return dateA - dateB;
                        return a.order_id - b.order_id;
                    });

                    for (const line of matchingLines) {
                        const lineReq = Number(line.ordered_quantity || 0);
                        const alloc = Math.min(remainingBudget, lineReq);
                        orderProductPickedMap.set(`${line.order_id}:${prodId}`, alloc);
                        remainingBudget = Math.max(0, remainingBudget - alloc);
                    }
                }
            }

            const invoiceDetailIds: number[] = orderItemDetails
                .map((row) => Number(row.detail_id))
                .filter(Boolean);

            // 1. Maintain lot pick statuses (only update if explicit picked list provided)
            const postPickedResIds = Array.isArray(body.pickedReservationIds) ? body.pickedReservationIds : null;
            const postPickedLotIds = Array.isArray(body.pickedLotIds) ? body.pickedLotIds : null;

            if (postPickedResIds || postPickedLotIds) {
                if (invoiceDetailIds.length > 0) {
                    const [soRes, siRes] = await Promise.all([
                        fetch(
                            `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${invoiceDetailIds.join(",")}&limit=-1&fields=reservation_id,id,inventory_lot_id,status`,
                            { headers: directusHeaders, cache: "no-store" }
                        ),
                        fetch(
                            `${DIRECTUS_URL}/items/sales_invoice_reservation?filter[sales_invoice_detail_id][_in]=${invoiceDetailIds.join(",")}&limit=-1&fields=id,inventory_lot_id,status`,
                            { headers: directusHeaders, cache: "no-store" }
                        ),
                    ]);

                    if (soRes.ok) {
                        const soData = (await soRes.json()).data || [];
                        for (const r of soData) {
                            const rId = Number(r.reservation_id || r.id);
                            const rawInv = typeof r.inventory_lot_id === "object" && r.inventory_lot_id !== null
                                ? (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).id || (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).inventory_lot_id
                                : r.inventory_lot_id;
                            const invId = Number(rawInv || 0);
                            const isPicked = (postPickedResIds && postPickedResIds.includes(rId)) || (postPickedLotIds && postPickedLotIds.includes(invId));

                            const nextStatus = isPicked ? "Picked" : "Reserved";
                            if (r.status !== nextStatus) {
                                await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${rId}`, {
                                    method: "PATCH",
                                    headers: directusHeaders,
                                    body: JSON.stringify({
                                        status: nextStatus,
                                        updated_by: userId,
                                        updated_at: phNow,
                                    }),
                                }).catch(() => null);
                            }
                        }
                    }

                    if (siRes.ok) {
                        const siData = (await siRes.json()).data || [];
                        for (const r of siData) {
                            const rId = Number(r.id);
                            const rawInv = typeof r.inventory_lot_id === "object" && r.inventory_lot_id !== null
                                ? (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).id || (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).inventory_lot_id
                                : r.inventory_lot_id;
                            const invId = Number(rawInv || 0);
                            const isPicked = (postPickedResIds && postPickedResIds.includes(rId)) || (postPickedLotIds && postPickedLotIds.includes(invId));

                            const nextStatus = isPicked ? "Picked" : "Reserved";
                            if (r.status !== nextStatus) {
                                await fetch(`${DIRECTUS_URL}/items/sales_invoice_reservation/${rId}`, {
                                    method: "PATCH",
                                    headers: directusHeaders,
                                    body: JSON.stringify({
                                        status: nextStatus,
                                        updated_by: userId,
                                        updated_at: phNow,
                                    }),
                                }).catch(() => null);
                            }
                        }
                    }
                }
            }

            // 2. Update all consolidator_details with picked_by and picked_at
            for (const d of details) {
                await fetch(`${DIRECTUS_URL}/items/consolidator_details/${d.id}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        picked_quantity: Number(d.picked_quantity ?? d.ordered_quantity ?? 0),
                        picked_by: userId,
                        picked_at: phNow,
                    }),
                }).catch(() => null);
            }

            // 3. Advance batch status to Picked
            const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({
                    status: "Picked",
                    updated_at: phNow,
                    updated_by: userId,
                }),
            });
            if (!patchRes.ok) {
                return NextResponse.json({ message: "Failed to update batch status to Picked" }, { status: 502 });
            }

            // 4. Advance linked sales_orders to Picked
            if (invoiceIds.length > 0) {
                for (const orderId of invoiceIds) {
                    await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                        method: "PATCH",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            order_status: "Picked",
                            modified_date: phNow,
                            modified_by: userId,
                            updated_at: phNow,
                        }),
                    }).catch((err) => {
                        console.warn(`[pick complete] Failed to update sales_order ${orderId}:`, err);
                    });
                }
            }

            return NextResponse.json({
                success: true,
                message: `Batch ${consolidator.consolidator_no} successfully marked as Picked`,
                status: "Picked",
            });
        }

        return NextResponse.json({ message: "Action must be 'start' or 'complete'" }, { status: 400 });
    } catch (e) {
        console.error("invoice-consolidation pick POST error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { batchId, quantities, pickedReservationIds, pickedLotIds } = body;

        if (!batchId || !quantities || !Array.isArray(quantities) || quantities.length === 0) {
            return NextResponse.json({ message: "batchId and quantities are required" }, { status: 400 });
        }

        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const getRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator?filter[id][_eq]=${batchId}&filter[is_delete][_eq]=0&limit=1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!getRes.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${getRes.status})` }, { status: getRes.status });
        }

        const items = (await getRes.json()).data || [];
        if (items.length === 0) {
            return NextResponse.json({ message: "Batch not found" }, { status: 404 });
        }

        const consolidator = items[0];

        if (!["For Picking", "Picking"].includes(consolidator.status)) {
            return NextResponse.json({ message: "Can only update quantities for batches in For Picking or Picking status" }, { status: 400 });
        }

        // Validate that every submitted detailId belongs to this batch
        const batchDetailsRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_eq]=${batchId}&fields=id&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!batchDetailsRes.ok) {
            return NextResponse.json({ message: "Failed to load batch details" }, { status: 502 });
        }
        const batchDetailIds = new Set<number>(((await batchDetailsRes.json()).data || []).map((d: { id: number }) => d.id));
        for (const q of quantities) {
            if (!batchDetailIds.has(q.detailId)) {
                return NextResponse.json({ message: `Detail ${q.detailId} does not belong to this batch` }, { status: 403 });
            }
        }

        const phNow = getPhTimestamp();

        // 1. Update consolidator_details picked quantities
        for (const q of quantities) {
            if (!q.detailId || typeof q.pickedQuantity !== "number" || q.pickedQuantity < 0) {
                return NextResponse.json({ message: "Each quantity must have a valid detailId and non-negative pickedQuantity" }, { status: 400 });
            }
            const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator_details/${q.detailId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({
                    picked_quantity: q.pickedQuantity,
                    picked_by: userId,
                    picked_at: phNow,
                }),
            });
            if (!patchRes.ok) {
                return NextResponse.json({ message: `Failed to update detail ${q.detailId} (HTTP ${patchRes.status})` }, { status: patchRes.status });
            }
        }

        // 2. Persist lot-level pick statuses in sales_order_reservation
        if (Array.isArray(pickedReservationIds) || Array.isArray(pickedLotIds)) {
            try {
                const linksRes = await fetch(
                    `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&fields=invoice_id&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (linksRes.ok) {
                    const invoiceIds = ((await linksRes.json()).data || [])
                        .map((row: { invoice_id: number }) => Number(row.invoice_id))
                        .filter(Boolean);

                    if (invoiceIds.length > 0) {
                        const sodRes = await fetch(
                            `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${invoiceIds.join(",")}&fields=detail_id&limit=-1`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (sodRes.ok) {
                            const detailIds = ((await sodRes.json()).data || [])
                                .map((row: { detail_id: number }) => Number(row.detail_id))
                                .filter(Boolean);

                            if (detailIds.length > 0) {
                                const soRes = await fetch(
                                    `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${detailIds.join(",")}&limit=-1`,
                                    { headers: directusHeaders, cache: "no-store" }
                                );
                                if (soRes.ok) {
                                    const reservations: Array<{
                                        id?: number;
                                        reservation_id?: number;
                                        sales_order_detail_id?: number;
                                        product_id?: number;
                                        inventory_lot_id?: unknown;
                                        reserved_quantity?: number;
                                        quantity?: number;
                                        status?: string;
                                    }> = (await soRes.json()).data || [];

                                    const lotPickedItems = Array.isArray(body.lotPickedItems) ? body.lotPickedItems : null;

                                    if (lotPickedItems && lotPickedItems.length > 0) {
                                        // Precise per-lot item processing
                                        for (const item of lotPickedItems) {
                                            let budget = Number(item.pickedQuantity || 0);
                                            const itemResIds = (item.reservationIds || []).map(Number);

                                            for (const rId of itemResIds) {
                                                const r = reservations.find((x) => Number(x.id || x.reservation_id) === rId);
                                                if (!r) continue;

                                                const resQty = Number(r.reserved_quantity ?? r.quantity ?? 0);
                                                const pickedPart = Math.min(budget, resQty);
                                                budget = Math.max(0, budget - pickedPart);

                                                const patchRes = await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${rId}`, {
                                                    method: "PATCH",
                                                    headers: directusHeaders,
                                                    body: JSON.stringify({
                                                        picked_quantity: pickedPart,
                                                        status: pickedPart >= resQty && resQty > 0 ? "Picked" : "Reserved",
                                                        modified_date: phNow,
                                                        modified_by: userId,
                                                    }),
                                                }).catch(() => null);

                                                if (patchRes && !patchRes.ok) {
                                                    await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${rId}`, {
                                                        method: "PATCH",
                                                        headers: directusHeaders,
                                                        body: JSON.stringify({
                                                            status: pickedPart >= resQty && resQty > 0 ? "Picked" : "Reserved",
                                                            modified_date: phNow,
                                                            modified_by: userId,
                                                        }),
                                                    }).catch(() => null);
                                                }
                                            }
                                        }
                                    } else {
                                        // Binary fallback
                                        for (const r of reservations) {
                                            const rId = Number(r.id || r.reservation_id);
                                            const rawInv = typeof r.inventory_lot_id === "object" && r.inventory_lot_id !== null
                                                ? (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).id || (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).inventory_lot_id
                                                : r.inventory_lot_id;
                                            const invId = Number(rawInv || 0);

                                            const isPicked = (pickedReservationIds && pickedReservationIds.includes(rId)) ||
                                                (pickedLotIds && pickedLotIds.includes(invId));

                                            const resQty = Number(r.reserved_quantity ?? r.quantity ?? 0);
                                            if (isPicked && r.status !== "Picked") {
                                                await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${rId}`, {
                                                    method: "PATCH",
                                                    headers: directusHeaders,
                                                    body: JSON.stringify({
                                                        picked_quantity: resQty,
                                                        status: "Picked",
                                                        modified_date: phNow,
                                                        modified_by: userId,
                                                    }),
                                                }).catch(() => null);
                                            } else if (!isPicked && r.status === "Picked") {
                                                await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${rId}`, {
                                                    method: "PATCH",
                                                    headers: directusHeaders,
                                                    body: JSON.stringify({
                                                        picked_quantity: 0,
                                                        status: "Reserved",
                                                        modified_date: phNow,
                                                        modified_by: userId,
                                                    }),
                                                }).catch(() => null);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Also ensure linked sales_order status is updated
                        for (const orderId of invoiceIds) {
                            await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                                method: "PATCH",
                                headers: directusHeaders,
                                body: JSON.stringify({
                                    order_status: "For Picking",
                                    for_picking_at: phNow,
                                    modified_date: phNow,
                                    modified_by: userId,
                                    updated_at: phNow,
                                }),
                            }).catch(() => null);
                        }
                    }
                }
            } catch (err) {
                console.warn("[pick PATCH] Warning updating sales_order_reservation lot statuses:", err);
            }
        }

        // 3. Update consolidator status to Picking and update updated_at
        await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({ status: "Picking", updated_at: phNow }),
        }).catch(() => null);

        return NextResponse.json({ success: true, message: "Picking progress and batch lot statuses updated" });
    } catch (e) {
        console.error("invoice-consolidation pick PATCH error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
