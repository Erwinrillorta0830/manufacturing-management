import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../_auth";
import { getPhTimestamp } from "../_time-utils";

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
        if (consolidator.status === "Picked" || consolidator.status === "Audited") {
            return NextResponse.json({
                message: `Cannot revert a ${consolidator.status} batch. Inventory movements have been posted.`,
            }, { status: 400 });
        }

        const invRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!invRes.ok) {
            return NextResponse.json({ message: "Failed to load batch invoices" }, { status: 502 });
        }
        const junctions = (await invRes.json()).data || [];
        const phNow = getPhTimestamp();

        if (junctions.length > 0) {
            const invoiceIds = junctions.map((j: { invoice_id: number }) => Number(j.invoice_id)).filter(Boolean);
            for (const orderId of invoiceIds) {
                await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({ order_status: "For Consolidation", updated_at: phNow }),
                });
            }
        }

        const updateBody: Record<string, unknown> = {
            status: "Pending",
            checked_by: null,
            updated_at: phNow,
        };
        const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify(updateBody),
        });
        if (!patchRes.ok) {
            return NextResponse.json({ message: `Failed to update batch status (HTTP ${patchRes.status})` }, { status: patchRes.status });
        }

        return NextResponse.json({
            success: true,
            message: "Batch reverted to Pending",
        });
    } catch (e) {
        console.error("invoice-consolidation revert POST error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
