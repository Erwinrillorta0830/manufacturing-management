import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../_auth";
import { getPhTimestamp } from "../_time-utils";

async function transitionSalesOrderToForInvoicing(documentIds: number[], userId?: number): Promise<{ updated: number; errors: string[] }> {
    const errors: string[] = [];
    const orderIds = [...new Set(documentIds.map((id) => Number(id)).filter(Boolean))];
    if (orderIds.length === 0) return { updated: 0, errors: [] };

    let updated = 0;
    const phNow = getPhTimestamp();
    for (const orderId of orderIds) {
        const patchRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({
                order_status: "For Invoicing",
                modified_date: phNow,
                modified_by: userId,
            }),
        });
        if (patchRes.ok) {
            updated++;
        } else {
            // Retry with just order_status if modified_date/modified_by fails
            const retryRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({
                    order_status: "For Invoicing",
                }),
            });
            if (retryRes.ok) {
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
                const invoiceIds = junctions.map((j) => j.invoice_id);
                const result = await transitionSalesOrderToForInvoicing(invoiceIds, userId);
                if (result.errors.length > 0) {
                    console.error("[audit retry] SO transition errors:", result.errors);
                }
                const sodRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${invoiceIds.join(",")}&fields=detail_id&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                const allDetailIds = sodRes.ok ? ((await sodRes.json()).data || []).map((d: { detail_id: number }) => Number(d.detail_id)) : [];
                if (allDetailIds.length > 0) {
                    const phNow = getPhTimestamp();
                    const soRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${allDetailIds.join(",")}&filter[status][_in]=Picked,Reserved&fields=reservation_id&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (soRes.ok) {
                        const soRows = (await soRes.json()).data || [];
                        for (const r of soRows) {
                            const id = Number(r.reservation_id || r.id);
                            await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${id}`, {
                                method: "PATCH",
                                headers: directusHeaders,
                                body: JSON.stringify({ status: "Consumed", updated_by: userId, updated_at: phNow }),
                            }).catch(() => null);
                        }
                    }
                }
            }
            return NextResponse.json({ success: true, message: "Batch is already audited and synced" });
        }
        if (consolidator.status !== "Picked") {
            return NextResponse.json({ message: "Batch must be in Picked status before audit" }, { status: 400 });
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
                const phNow = getPhTimestamp();
                const [soRes, siRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${allDetailIds.join(",")}&filter[status][_in]=Picked,Reserved&fields=*&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_reservation?filter[sales_invoice_detail_id][_in]=${allDetailIds.join(",")}&filter[status][_in]=Picked,Reserved&fields=*&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);
                if (soRes.ok) {
                    const soRows: Array<{ reservation_id?: number; id?: number; status?: string; picked_quantity?: number }> = (await soRes.json()).data || [];
                    for (const r of soRows) {
                        const id = Number(r.reservation_id || r.id);
                        const isPicked = r.status === "Picked" || Number(r.picked_quantity || 0) > 0;
                        const targetStatus = isPicked ? "Consumed" : "Released";
                        await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${id}`, {
                            method: "PATCH",
                            headers: directusHeaders,
                            body: JSON.stringify({ status: targetStatus, updated_by: userId, updated_at: phNow }),
                        }).catch(() => null);
                    }
                }
                if (siRes.ok) {
                    const siRows: Array<{ id: number; status?: string }> = (await siRes.json()).data || [];
                    for (const r of siRows) {
                        const isPicked = r.status === "Picked";
                        const targetStatus = isPicked ? "Consumed" : "Released";
                        await fetch(`${DIRECTUS_URL}/items/sales_invoice_reservation/${r.id}`, {
                            method: "PATCH",
                            headers: directusHeaders,
                            body: JSON.stringify({ status: targetStatus, updated_by: userId, updated_at: phNow }),
                        }).catch(() => null);
                    }
                }
            }
        }

        const phNow = getPhTimestamp();
        const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({ status: "Audited", checked_by: userId, updated_at: phNow }),
        });
        if (!patchRes.ok) {
            return NextResponse.json({ message: `Failed to update batch status (HTTP ${patchRes.status})` }, { status: patchRes.status });
        }

        // Transition linked sales orders from Picked to For Invoicing
        let transitionErrors: string[] = [];
        if (junctions.length > 0) {
            const result = await transitionSalesOrderToForInvoicing(junctions.map((j: { invoice_id: number }) => j.invoice_id), userId);
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
