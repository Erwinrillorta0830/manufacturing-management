import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { fetchSourceMovements, movementsExistForSource } from "../inventory-movements-client";
import { productLedgerMatchesQuantities } from "../product-ledger-client";
import { getUserIdFromToken } from "../_auth";

const TXN_TYPE_SALES_ISSUE = 4;

async function transitionSalesOrderToForLoading(invoiceIds: number[]): Promise<{ updated: number; errors: string[] }> {
    const errors: string[] = [];
    const siRes = await fetch(
        `${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${invoiceIds.join(",")}&fields=invoice_id,order_id,sales_order_id,isDispatched&limit=-1`,
        { headers: directusHeaders, cache: "no-store" }
    );
    if (!siRes.ok) return { updated: 0, errors: [`Failed to fetch invoices: HTTP ${siRes.status}`] };
    const invoices: { invoice_id: number; order_id: number | null; sales_order_id: number | null; isDispatched: boolean | null }[] = (await siRes.json()).data || [];

    const orderIds = [...new Set(invoices.map((inv) => Number(inv.order_id || inv.sales_order_id || 0)).filter(Boolean))];
    if (orderIds.length === 0) return { updated: 0, errors: [] };

    let updated = 0;
    for (const orderId of orderIds) {
        const orderRes = await fetch(
            `${DIRECTUS_URL}/items/sales_order/${orderId}?fields=order_id,order_status`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!orderRes.ok) {
            errors.push(`Order ${orderId}: fetch failed HTTP ${orderRes.status}`);
            continue;
        }
        const order: { order_id: number; order_status: string } = (await orderRes.json()).data;
        if (order.order_status !== "For Picking") continue;

        const allActive = await fetch(
            `${DIRECTUS_URL}/items/sales_invoice?filter[_or][0][order_id][_eq]=${orderId}&filter[_or][1][sales_order_id][_eq]=${orderId}&filter[transaction_status][_neq]=Cancelled&fields=invoice_id,isDispatched&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!allActive.ok) {
            errors.push(`Order ${orderId}: active-invoice query failed HTTP ${allActive.status}`);
            continue;
        }
        const activeInvoices: { invoice_id: number; isDispatched: boolean | null }[] = (await allActive.json()).data || [];
        if (activeInvoices.length === 0) continue;
        const allDispatched = activeInvoices.every((inv) => inv.isDispatched === true);

        if (allDispatched) {
            const patchRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({ order_status: "For Loading" }),
            });
            if (patchRes.ok) {
                updated++;
            } else {
                errors.push(`Order ${orderId}: status update failed HTTP ${patchRes.status}`);
            }
        }
    }
    return { updated, errors };
}

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
        if (consolidator.status === "Audited") {
            const junctionRes = await fetch(
                `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&limit=-1&fields=invoice_id`,
                { headers: directusHeaders, cache: "no-store" }
            );
            const junctions: { invoice_id: number }[] = junctionRes.ok ? (await junctionRes.json()).data || [] : [];
            if (junctions.length > 0) {
                const result = await transitionSalesOrderToForLoading(junctions.map((j) => j.invoice_id));
                if (result.errors.length > 0) {
                    console.error("[audit retry] SO transition errors:", result.errors);
                }
            }
            return NextResponse.json({ success: true, message: "Batch is already audited" });
        }
        if (consolidator.status !== "Picked") {
            return NextResponse.json({ message: "Batch must be in Picked status before audit" }, { status: 400 });
        }

        // Verify inventory movements have been posted before allowing audit
        const hasMovements = await movementsExistForSource(batchId, TXN_TYPE_SALES_ISSUE);
        if (!hasMovements) {
            return NextResponse.json({ message: "Cannot audit: no inventory movements posted for this batch. Complete picking first." }, { status: 400 });
        }
        const movements = await fetchSourceMovements(batchId, TXN_TYPE_SALES_ISSUE);
        const movementByProduct = new Map<number, number>();
        for (const movement of movements) {
            movementByProduct.set(
                Number(movement.product_id),
                (movementByProduct.get(Number(movement.product_id)) || 0) + Number(movement.quantity || 0)
            );
        }
        if (!await productLedgerMatchesQuantities(consolidator.consolidator_no, movementByProduct)) {
            return NextResponse.json({ message: "Cannot audit: product ledger does not match inventory movements" }, { status: 409 });
        }

        const [invRes, detRes] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            ),
            fetch(
                `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_eq]=${batchId}&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            ),
        ]);

        if (!invRes.ok || !detRes.ok) {
            return NextResponse.json({ message: "Failed to load batch data" }, { status: 502 });
        }

        const junctions = (await invRes.json()).data || [];
        const details = (await detRes.json()).data || [];

        // Reconfirm full picking before audit
        const shortDetails = details.filter(
            (d: { ordered_quantity: number; picked_quantity: number }) => Number(d.picked_quantity || 0) < Number(d.ordered_quantity || 0)
        );
        if (shortDetails.length > 0) {
            const shortProductIds = shortDetails.map((d: { product_id: number }) => d.product_id);
            return NextResponse.json({
                message: `Cannot audit: products ${shortProductIds.join(", ")} are not fully picked`,
            }, { status: 422 });
        }

        // Apply picked quantities (idempotent — PATCH to final value)
        for (const d of details) {
            const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator_details/${d.id}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({ applied_quantity: Number(d.picked_quantity || 0) }),
            });
            if (!patchRes.ok) {
                return NextResponse.json({ message: `Failed to apply quantity for detail ${d.id}` }, { status: 502 });
            }
        }

        if (junctions.length > 0) {
            const invoiceIds = junctions.map((j: { invoice_id: number }) => j.invoice_id);
            // Dispatch invoices (idempotent — if already dispatched, PATCH still succeeds)
            const bulkRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({
                    query: { filter: { invoice_id: { _in: invoiceIds } } },
                    data: { isDispatched: true },
                }),
            });
            if (!bulkRes.ok) {
                return NextResponse.json({ message: `Failed to dispatch invoices (HTTP ${bulkRes.status})` }, { status: bulkRes.status });
            }

            const invoiceDetailsRes = await fetch(
                `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.join(",")}&fields=detail_id&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (!invoiceDetailsRes.ok) {
                return NextResponse.json({ message: "Failed to load invoice reservations for audit" }, { status: 502 });
            }
            const invoiceDetailIds: number[] = ((await invoiceDetailsRes.json()).data || [])
                .map((row: { detail_id: number }) => Number(row.detail_id))
                .filter(Boolean);
            if (invoiceDetailIds.length > 0) {
                const reservationRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_invoice_reservation?filter[sales_invoice_detail_id][_in]=${invoiceDetailIds.join(",")}&filter[status][_eq]=Reserved&fields=id&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (!reservationRes.ok) {
                    return NextResponse.json({ message: "Failed to load unused invoice reservations" }, { status: 502 });
                }
                const unusedReservations: { id: number }[] = (await reservationRes.json()).data || [];
                const now = new Date().toISOString();
                for (const reservation of unusedReservations) {
                    const releaseRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice_reservation/${reservation.id}`, {
                        method: "PATCH",
                        headers: directusHeaders,
                        body: JSON.stringify({ status: "Released", updated_by: userId, updated_at: now }),
                    });
                    if (!releaseRes.ok) {
                        return NextResponse.json({ message: `Failed to release reservation ${reservation.id}` }, { status: 502 });
                    }
                }
            }
        }

        const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({ status: "Audited", checked_by: userId }),
        });
        if (!patchRes.ok) {
            return NextResponse.json({ message: `Failed to update batch status (HTTP ${patchRes.status})` }, { status: patchRes.status });
        }

        // Transition linked sales orders from For Picking to For Loading
        let transitionErrors: string[] = [];
        if (junctions.length > 0) {
            const result = await transitionSalesOrderToForLoading(junctions.map((j: { invoice_id: number }) => j.invoice_id));
            transitionErrors = result.errors;
            if (transitionErrors.length > 0) {
                console.error("[audit] SO transition errors:", transitionErrors);
            }
        }

        return NextResponse.json({
            success: transitionErrors.length === 0,
            message: transitionErrors.length > 0
                ? `Batch audited but ${transitionErrors.length} sales order(s) failed to transition: ${transitionErrors.join("; ")}`
                : "Batch audited successfully",
            checkedBy: userId,
            transitionErrors: transitionErrors.length > 0 ? transitionErrors : undefined,
        });
    } catch (e) {
        console.error("invoice-consolidation audit POST error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
