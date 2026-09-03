import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../../directus-api";
import { fetchSourceMovements, postMovements, type PostMovementPayload } from "../../inventory-movements-client";
import { syncProductLedgerToTarget } from "../../product-ledger-client";
import { getUserIdFromToken } from "../../_auth";
import { getPhTimestamp } from "../../_time-utils";

const TXN_TYPE_SALES_ISSUE = 4;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { batchId } = body;

        if (!batchId) {
            return NextResponse.json({ message: "batchId is required" }, { status: 400 });
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

        // Only Picked batches can be re-picked; Audited is terminal.
        if (consolidator.status !== "Picked") {
            return NextResponse.json({ message: "Only Picked batches can be re-picked" }, { status: 400 });
        }

        // Fetch all sales-issue movements for this source document
        const movements = await fetchSourceMovements(batchId, TXN_TYPE_SALES_ISSUE);

        // Compensate only the outstanding net deduction for each exact lot identity.
        // Historical negative lines from earlier pick cycles may already have a positive reversal.
        const compensations: PostMovementPayload[] = [];
        let compensatedCount = 0;
        const movementGroups = new Map<string, { movement: typeof movements[number]; net: number }>();
        for (const movement of movements) {
            const key = [
                movement.product_id,
                movement.lot_id,
                movement.batch_no,
                movement.expiry_date || "",
                movement.manufacturing_date || "",
            ].join(":");
            const group = movementGroups.get(key) || { movement, net: 0 };
            group.net += Number(movement.quantity || 0);
            movementGroups.set(key, group);
        }

        for (const { movement: m, net } of movementGroups.values()) {
            if (net >= 0) continue;
            compensations.push({
                product_id: m.product_id,
                lot_id: m.lot_id,
                branch_id: m.branch_id,
                transaction_type_id: TXN_TYPE_SALES_ISSUE,
                source_document_id: batchId,
                source_document_no: consolidator.consolidator_no,
                batch_no: m.batch_no,
                expiry_date: m.expiry_date,
                manufacturing_date: m.manufacturing_date,
                quantity: Math.abs(net),
                created_by: userId,
                remarks: `Re-pick reversal - ${consolidator.consolidator_no}`,
            });
            compensatedCount++;
        }

        await syncProductLedgerToTarget({
            branchId: Number(consolidator.branch_id),
            documentNo: consolidator.consolidator_no,
            targetByProduct: new Map<number, number>(),
            description: `Re-pick reversal - ${consolidator.consolidator_no}`,
        });

        if (compensations.length === 0) {
            // No negative movements found — batch may have been picked with zero quantities
            // or net is already zero. Proceed with clearing details and reverting status.
            console.warn(`Re-pick ${batchId}: no negative movements to compensate — clearing picking data only`);
        } else {
            // Post compensating movements
            await postMovements(compensations);
        }

        // Restore the exact inventory lot balances and reactivate the sticky reservations.
        const invoiceLinksRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&fields=invoice_id&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        const invoiceIds: number[] = invoiceLinksRes.ok
            ? ((await invoiceLinksRes.json()).data || []).map((row: { invoice_id: number }) => Number(row.invoice_id)).filter(Boolean)
            : [];
        if (invoiceIds.length > 0) {
            const [sodRes, sidRes] = await Promise.all([
                fetch(
                    `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${invoiceIds.join(",")}&fields=detail_id&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                ),
                fetch(
                    `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.join(",")}&fields=detail_id&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                ),
            ]);
            const allDetailIds: number[] = [
                ...(sodRes.ok ? ((await sodRes.json()).data || []).map((d: { detail_id: number }) => Number(d.detail_id)) : []),
                ...(sidRes.ok ? ((await sidRes.json()).data || []).map((d: { detail_id: number }) => Number(d.detail_id)) : []),
            ];

            if (allDetailIds.length > 0) {
                const reservationNow = new Date().toISOString();
                const [soRes, siRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${allDetailIds.join(",")}&filter[status][_in]=Picked,Consumed&fields=reservation_id&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_reservation?filter[sales_invoice_detail_id][_in]=${allDetailIds.join(",")}&filter[status][_in]=Picked,Consumed&fields=id&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);

                if (soRes.ok) {
                    const soRows: { reservation_id?: number; id?: number }[] = (await soRes.json()).data || [];
                    for (const r of soRows) {
                        const id = Number(r.reservation_id || r.id);
                        await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${id}`, {
                            method: "PATCH",
                            headers: directusHeaders,
                            body: JSON.stringify({ status: "Reserved", updated_by: userId, updated_at: reservationNow }),
                        }).catch(() => null);
                    }
                }
                if (siRes.ok) {
                    const siRows: { id: number }[] = (await siRes.json()).data || [];
                    for (const r of siRows) {
                        await fetch(`${DIRECTUS_URL}/items/sales_invoice_reservation/${r.id}`, {
                            method: "PATCH",
                            headers: directusHeaders,
                            body: JSON.stringify({ status: "Reserved", updated_by: userId, updated_at: reservationNow }),
                        }).catch(() => null);
                    }
                }
            }
        }

        // Clear picked quantities on all details
        const detRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_eq]=${batchId}&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (detRes.ok) {
            const details: { id: number }[] = (await detRes.json()).data || [];
            for (const d of details) {
                const detailPatchRes = await fetch(`${DIRECTUS_URL}/items/consolidator_details/${d.id}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        picked_quantity: 0,
                        picked_by: null,
                        picked_at: null,
                        applied_quantity: 0,
                    }),
                });
                if (!detailPatchRes.ok) {
                    return NextResponse.json({ message: `Failed to clear picking data for detail ${d.id}` }, { status: 502 });
                }
            }
        }

        const phNow = getPhTimestamp();
        // Revert status to Picking
        const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({
                status: "Picking",
                checked_by: null,
                updated_at: phNow,
            }),
        });

        if (!patchRes.ok) {
            return NextResponse.json({ message: "Status revert failed" }, { status: 502 });
        }

        // Revert linked sales orders to "For Picking"
        if (invoiceIds.length > 0) {
            for (const orderId of invoiceIds) {
                await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        order_status: "For Picking",
                        modified_date: phNow,
                        modified_by: userId,
                        updated_at: phNow,
                    }),
                }).catch(() => null);
            }
        }

        const msg = compensatedCount > 0
            ? `Batch reverted to Picking (${compensatedCount} movement(s) compensated)`
            : "Batch reverted to Picking (no movements to compensate)";

        return NextResponse.json({ success: true, message: msg, compensatedCount });
    } catch (e) {
        console.error("invoice-consolidation repick POST error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
