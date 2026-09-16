import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";
import { fetchLiveProductOnhand, getAuthToken, getUserIdFromToken } from "../helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);
        const orderId = Number(body?.orderId);

        if (!orderId || isNaN(orderId)) {
            return NextResponse.json(
                { success: false, message: "Valid orderId is required" },
                { status: 400 }
            );
        }

        const [token, userId] = await Promise.all([getAuthToken(req), getUserIdFromToken()]);

        // 1. Fetch Sales Order
        const soRes = await fetch(
            `${DIRECTUS_URL}/items/sales_order/${orderId}?fields=order_id,order_no,order_status,branch_id`,
            { headers: directusHeaders, cache: "no-store" }
        );

        if (!soRes.ok) {
            return NextResponse.json(
                { success: false, message: `Sales Order #${orderId} not found` },
                { status: 404 }
            );
        }

        const so = (await soRes.json()).data;
        if (!so) {
            return NextResponse.json(
                { success: false, message: `Sales Order #${orderId} not found` },
                { status: 404 }
            );
        }

        if (so.order_status !== "In Production") {
            return NextResponse.json(
                {
                    success: false,
                    message: `Sales Order #${so.order_no} status is '${so.order_status}'. Only 'In Production' orders can proceed to consolidation.`,
                },
                { status: 400 }
            );
        }

        // 2. Fetch line items
        const sodRes = await fetch(
            `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${orderId}&limit=-1&fields=detail_id,product_id,ordered_quantity`,
            { headers: directusHeaders, cache: "no-store" }
        );

        if (!sodRes.ok) {
            return NextResponse.json(
                { success: false, message: "Failed to load sales order line items for validation" },
                { status: 500 }
            );
        }

        const lineItems: Array<{ detail_id: number; product_id: number; ordered_quantity: number }> =
            (await sodRes.json()).data || [];

        if (lineItems.length === 0) {
            return NextResponse.json(
                { success: false, message: "Cannot proceed: Sales Order has no product line items." },
                { status: 400 }
            );
        }

        const detailIds = lineItems.map((l) => Number(l.detail_id));
        const productIds = Array.from(new Set(lineItems.map((l) => Number(l.product_id))));

        // 3. Concurrently fetch allocations & product onhand
        const [allocRes, ...onhandResults] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[sales_order_detail_id][_in]=${detailIds.join(
                    ","
                )}&limit=-1&fields=id,sales_order_detail_id,job_order_id,allocated_quantity`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            ...productIds.map((pId) => fetchLiveProductOnhand(so.branch_id, pId, token)),
        ]);

        const onhandMap = new Map<number, number>();
        productIds.forEach((pId, idx) => {
            const res = onhandResults[idx];
            onhandMap.set(pId, res?.onhandQuantity || 0);
        });

        // 4. Resolve Job Orders for allocations
        const rawAllocations: Array<{
            sales_order_detail_id: number;
            job_order_id: number;
            allocated_quantity: number;
        }> = allocRes && allocRes.ok ? (await allocRes.json()).data || [] : [];

        const joIds = Array.from(new Set(rawAllocations.map((a) => Number(a.job_order_id)).filter(Boolean)));
        const joMap = new Map<number, { actual_quantity_produced: number; completed_quantity: number }>();

        if (joIds.length > 0) {
            const joRes = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_id][_in]=${joIds.join(
                    ","
                )}&limit=-1&fields=job_order_id,actual_quantity_produced,completed_quantity`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null);

            if (joRes && joRes.ok) {
                const joJson = await joRes.json();
                for (const jo of joJson.data || []) {
                    joMap.set(Number(jo.job_order_id), {
                        actual_quantity_produced: Number(jo.actual_quantity_produced || 0),
                        completed_quantity: Number(jo.completed_quantity || 0),
                    });
                }
            }
        }

        // 5. Strictly validate that 100% of line items are satisfied
        const unfulfilledItems: string[] = [];

        for (const line of lineItems) {
            const orderedQty = Number(line.ordered_quantity || 0);
            const liveOnhand = onhandMap.get(Number(line.product_id)) || 0;

            const lineAllocations = rawAllocations.filter(
                (a) => Number(a.sales_order_detail_id) === Number(line.detail_id)
            );

            let totalProduced = 0;
            for (const alloc of lineAllocations) {
                const jo = joMap.get(Number(alloc.job_order_id));
                const joProducedMetric = Math.max(
                    Number(jo?.actual_quantity_produced || 0),
                    Number(jo?.completed_quantity || 0)
                );
                totalProduced += Math.min(Number(alloc.allocated_quantity || 0), joProducedMetric);
            }

            const meetsByOnhand = liveOnhand >= orderedQty;
            const meetsByProduction = totalProduced >= orderedQty;

            if (!meetsByOnhand && !meetsByProduction) {
                const shortage = Math.max(0, orderedQty - Math.max(liveOnhand, totalProduced));
                unfulfilledItems.push(
                    `Product ID #${line.product_id}: Ordered ${orderedQty}, On-Hand ${liveOnhand}, Produced ${totalProduced} (Deficit: ${shortage})`
                );
            }
        }

        if (unfulfilledItems.length > 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: `Cannot proceed to consolidation. The following items have not met the required ordered quantity:\n${unfulfilledItems.join(
                        "; "
                    )}`,
                    unfulfilledItems,
                },
                { status: 400 }
            );
        }

        // 6. Update Sales Order status to 'For Consolidation'
        const nowIso = new Date().toISOString();
        const patchPayload: Record<string, unknown> = {
            order_status: "For Consolidation",
            for_consolidation_at: nowIso,
            modified_date: nowIso,
        };

        if (userId) {
            patchPayload.modified_by = userId;
        }

        const patchRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify(patchPayload),
        });

        if (!patchRes.ok) {
            const errTxt = await patchRes.text().catch(() => "");
            return NextResponse.json(
                {
                    success: false,
                    message: `Failed to update Sales Order status in database: HTTP ${patchRes.status} ${errTxt}`,
                },
                { status: patchRes.status }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Sales Order #${so.order_no} has been successfully moved to 'Consolidation Planning'.`,
            order_id: orderId,
            order_status: "For Consolidation",
            for_consolidation_at: nowIso,
        });
    } catch (error) {
        console.error("[Sales Order Fulfillment] Error in POST /proceed:", error);
        return NextResponse.json(
            { success: false, message: (error as Error).message || "Internal server error" },
            { status: 500 }
        );
    }
}
