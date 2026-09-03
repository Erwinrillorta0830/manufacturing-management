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

            // Require every product to be fully picked before completing.
            const shortProductIds: number[] = [];
            for (const d of details) {
                if (Number(d.picked_quantity || 0) < Number(d.ordered_quantity || 0)) {
                    shortProductIds.push(d.product_id);
                }
            }
            if (shortProductIds.length > 0) {
                return NextResponse.json({
                    message: `Cannot complete picking: products ${shortProductIds.join(", ")} are not fully picked`,
                }, { status: 422 });
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

            const orderItemDetails: { detail_id: number; product_id: number }[] = [];
            if (invoiceIds.length > 0) {
                const [sodRes, sidRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${invoiceIds.join(",")}&fields=detail_id,product_id&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.join(",")}&fields=detail_id,product_id&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);
                if (sodRes.ok) orderItemDetails.push(...((await sodRes.json()).data || []));
                if (sidRes.ok) orderItemDetails.push(...((await sidRes.json()).data || []));
            }

            const invoiceDetailIds: number[] = orderItemDetails
                .map((row) => Number(row.detail_id))
                .filter(Boolean);

            // 1. Mark all reservations as Picked
            if (invoiceDetailIds.length > 0) {
                const [soRes, siRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${invoiceDetailIds.join(",")}&limit=-1&fields=reservation_id,status`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_reservation?filter[sales_invoice_detail_id][_in]=${invoiceDetailIds.join(",")}&limit=-1&fields=id,status`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);

                if (soRes.ok) {
                    const soData = (await soRes.json()).data || [];
                    for (const r of soData) {
                        await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${r.reservation_id}`, {
                            method: "PATCH",
                            headers: directusHeaders,
                            body: JSON.stringify({
                                status: "Picked",
                                updated_by: userId,
                                updated_at: phNow,
                            }),
                        }).catch(() => null);
                    }
                }

                if (siRes.ok) {
                    const siData = (await siRes.json()).data || [];
                    for (const r of siData) {
                        await fetch(`${DIRECTUS_URL}/items/sales_invoice_reservation/${r.id}`, {
                            method: "PATCH",
                            headers: directusHeaders,
                            body: JSON.stringify({
                                status: "Picked",
                                updated_by: userId,
                                updated_at: phNow,
                            }),
                        }).catch(() => null);
                    }
                }
            }

            // 2. Update all consolidator_details with picked_by and picked_at
            for (const d of details) {
                await fetch(`${DIRECTUS_URL}/items/consolidator_details/${d.id}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        picked_quantity: Number(d.picked_quantity || d.ordered_quantity || 0),
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
                                        inventory_lot_id?: unknown;
                                        status?: string;
                                    }> = (await soRes.json()).data || [];

                                    for (const r of reservations) {
                                        const rId = Number(r.id || r.reservation_id);
                                        const rawInv = typeof r.inventory_lot_id === "object" && r.inventory_lot_id !== null
                                            ? (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).id || (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).inventory_lot_id
                                            : r.inventory_lot_id;
                                        const invId = Number(rawInv || 0);

                                        const isPicked = (pickedReservationIds && pickedReservationIds.includes(rId)) ||
                                            (pickedLotIds && pickedLotIds.includes(invId));

                                        if (isPicked && r.status !== "Picked") {
                                            await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${rId}`, {
                                                method: "PATCH",
                                                headers: directusHeaders,
                                                body: JSON.stringify({
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
