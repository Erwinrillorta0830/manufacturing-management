import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const batchId = Number(new URL(req.url).searchParams.get("batchId"));
        if (!Number.isInteger(batchId) || batchId <= 0) {
            return NextResponse.json({ message: "A valid batchId is required" }, { status: 400 });
        }

        const [consolidatorRes, invoiceLinksRes] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/consolidator?filter[id][_eq]=${batchId}&filter[is_delete][_eq]=0&fields=id&limit=1`,
                { headers: directusHeaders, cache: "no-store" }
            ),
            fetch(
                `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&fields=invoice_id&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            ),
        ]);
        if (!consolidatorRes.ok || !invoiceLinksRes.ok) {
            return NextResponse.json({ message: "Failed to load batch reservation context" }, { status: 502 });
        }
        if (((await consolidatorRes.json()).data || []).length === 0) {
            return NextResponse.json({ message: "Batch not found" }, { status: 404 });
        }

        const invoiceIds: number[] = ((await invoiceLinksRes.json()).data || [])
            .map((row: { invoice_id: number }) => Number(row.invoice_id))
            .filter(Boolean);
        if (invoiceIds.length === 0) return NextResponse.json({ availability: [] });

        const details: { detail_id: number; product_id?: number }[] = [];
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
            if (sodRes.ok) details.push(...((await sodRes.json()).data || []));
            if (sidRes.ok) details.push(...((await sidRes.json()).data || []));
        }

        const detailIds: number[] = details.map((d) => Number(d.detail_id)).filter(Boolean);
        if (detailIds.length === 0) return NextResponse.json({ availability: [] });

        const [soRes, siRes] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${detailIds.join(",")}&filter[status][_eq]=Reserved&fields=product_id,inventory_lot_id,reserved_quantity&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            ),
            fetch(
                `${DIRECTUS_URL}/items/sales_invoice_reservation?filter[sales_invoice_detail_id][_in]=${detailIds.join(",")}&filter[status][_eq]=Reserved&fields=inventory_lot_id.id,inventory_lot_id.product_id,inventory_lot_id.quantity,quantity&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            ),
        ]);

        const reservations: Array<{ productId: number; quantity: number }> = [];
        if (soRes.ok) {
            for (const r of (await soRes.json()).data || []) {
                reservations.push({
                    productId: Number(r.product_id || 0),
                    quantity: Number(r.reserved_quantity ?? r.quantity ?? 0),
                });
            }
        }
        if (siRes.ok) {
            for (const r of (await siRes.json()).data || []) {
                const lot = typeof r.inventory_lot_id === "object" ? r.inventory_lot_id : null;
                const pId = Number(lot?.product_id || 0);
                if (pId) {
                    reservations.push({
                        productId: pId,
                        quantity: Number(r.quantity || 0),
                    });
                }
            }
        }

        const totals = new Map<number, number>();
        for (const r of reservations) {
            if (r.productId > 0) {
                totals.set(r.productId, (totals.get(r.productId) || 0) + r.quantity);
            }
        }

        return NextResponse.json({
            availability: [...totals].map(([productId, availableQuantity]) => ({ productId, availableQuantity })),
        });
    } catch (error) {
        console.error("validate-stock GET error:", error);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
