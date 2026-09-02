import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../../invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FULFILMENT_STATUSES = ["For Fulfillment", "Dispatched", "Delivered"];

let branchesCache: Map<number, { branchName: string; branchCode: string }> | null = null;

async function getBranchesMap(): Promise<Map<number, { branchName: string; branchCode: string }>> {
    if (branchesCache) return branchesCache;
    const res = await fetch(
        `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&fields=id,branch_name,branch_code`,
        { headers: directusHeaders, cache: "no-store" }
    );
    if (res.ok) {
        const data = (await res.json()).data || [];
        branchesCache = new Map(data.map((b: { id: number; branch_name: string; branch_code: string }) =>
            [b.id, { branchName: b.branch_name, branchCode: b.branch_code }]
        ));
    } else {
        branchesCache = new Map();
    }
    return branchesCache;
}

async function getLinkedOrderIds(batchId: number): Promise<number[]> {
    const invRes = await fetch(
        `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&limit=-1&fields=invoice_id`,
        { headers: directusHeaders, cache: "no-store" }
    );
    if (!invRes.ok) return [];
    const junctions: { invoice_id: number }[] = (await invRes.json()).data || [];
    const invoiceIds = junctions.map((j) => j.invoice_id);
    if (invoiceIds.length === 0) return [];

    const siRes = await fetch(
        `${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${invoiceIds.join(",")}&fields=invoice_id,order_id,sales_order_id&limit=-1`,
        { headers: directusHeaders, cache: "no-store" }
    );
    if (!siRes.ok) return [];
    const invoices: { order_id: number | null; sales_order_id: number | null }[] = (await siRes.json()).data || [];
    return [...new Set(invoices.map((inv) => Number(inv.order_id || inv.sales_order_id || 0)).filter(Boolean))];
}

async function updateSalesOrderStatus(orderIds: number[], orderStatus: string, timestampField: string) {
    const now = new Date().toISOString();
    for (const orderId of orderIds) {
        await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({ order_status: orderStatus, [timestampField]: now }),
        });
    }
}

// ─── GET — list fulfilment-stage batches ─────────────────────────────────────
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const page = Math.max(0, parseInt(searchParams.get("page") || "0"));
        const size = Math.max(1, Math.min(100, parseInt(searchParams.get("size") || "50")));
        const search = searchParams.get("search");
        const branchId = searchParams.get("branchId");
        const status = searchParams.get("status");

        if (!branchId) {
            return NextResponse.json({ message: "branchId is required" }, { status: 400 });
        }

        const qs = new URLSearchParams();
        qs.set("filter[is_delete][_eq]", "0");
        qs.set("filter[branch_id][_eq]", branchId);
        qs.set("sort", "-updated_at");
        qs.set("limit", String(size));
        qs.set("offset", String(page * size));
        qs.set("meta", "filter_count");

        if (status && FULFILMENT_STATUSES.includes(status)) {
            qs.set("filter[status][_eq]", status);
        } else {
            qs.set("filter[status][_in]", FULFILMENT_STATUSES.join(","));
        }

        if (search) {
            qs.set("filter[consolidator_no][_contains]", search);
        }

        const res = await fetch(`${DIRECTUS_URL}/items/consolidator?${qs.toString()}`, {
            headers: directusHeaders,
            cache: "no-store",
        });
        if (!res.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${res.status})` }, { status: res.status });
        }

        const json = await res.json();
        const items = json.data || [];
        const total = json.meta?.filter_count ?? items.length;
        const ids: number[] = items.map((c: { id: number }) => c.id);

        let junctions: { consolidator_id: number; invoice_id: number }[] = [];
        let dispatches: { consolidator_id: number; dispatch_no: string }[] = [];
        if (ids.length > 0) {
            const [jRes, dRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_in]=${ids.join(",")}&limit=-1`, { headers: directusHeaders, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/consolidator_dispatches?filter[consolidator_id][_in]=${ids.join(",")}&limit=-1`, { headers: directusHeaders, cache: "no-store" }),
            ]);
            if (jRes.ok) junctions = (await jRes.json()).data || [];
            if (dRes.ok) dispatches = (await dRes.json()).data || [];
        }

        const invMap = new Map<number, number>();
        for (const j of junctions) invMap.set(j.consolidator_id, (invMap.get(j.consolidator_id) || 0) + 1);

        const dispatchMap = new Map<number, string[]>();
        for (const d of dispatches) {
            const list = dispatchMap.get(d.consolidator_id) || [];
            list.push(d.dispatch_no);
            dispatchMap.set(d.consolidator_id, list);
        }

        const branchMap = await getBranchesMap();

        const enriched = items.map((c: { id: number; consolidator_no: string; status: string; created_by: number; checked_by: number | null; branch_id: number; created_at: string; updated_at: string }) => ({
            id: c.id,
            consolidatorNo: c.consolidator_no,
            status: c.status,
            createdBy: c.created_by,
            checkedBy: c.checked_by,
            branchId: c.branch_id,
            branchName: branchMap.get(c.branch_id)?.branchName || `Branch #${c.branch_id}`,
            invoiceCount: invMap.get(c.id) || 0,
            dispatchNos: dispatchMap.get(c.id) || [],
            createdAt: c.created_at,
            updatedAt: c.updated_at,
            details: [],
            dispatches: (dispatchMap.get(c.id) || []).map((dn) => ({ dispatch_no: dn })),
            invoices: [],
            totalSalesOrderAmount: 0,
        }));

        return NextResponse.json({ content: enriched, totalElements: total, totalPages: Math.ceil(total / size) });
    } catch (e) {
        console.error("fulfilment-and-deliveries GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}

// ─── POST — dispatch / deliver ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { batchId, action } = body;

        if (!batchId || !action) {
            return NextResponse.json({ message: "batchId and action are required" }, { status: 400 });
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

        if (action === "dispatch") {
            if (consolidator.status !== "For Fulfillment") {
                return NextResponse.json({ message: "Batch must be in For Fulfillment status to dispatch" }, { status: 400 });
            }

            const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({ status: "Dispatched" }),
            });
            if (!patchRes.ok) {
                return NextResponse.json({ message: `Failed to update status (HTTP ${patchRes.status})` }, { status: patchRes.status });
            }

            // Update sales orders → En Route
            const orderIds = await getLinkedOrderIds(batchId);
            if (orderIds.length > 0) {
                await updateSalesOrderStatus(orderIds, "En Route", "en_route_at");
            }

            return NextResponse.json({ success: true, message: "Batch dispatched" });
        }

        if (action === "deliver") {
            if (consolidator.status !== "Dispatched") {
                return NextResponse.json({ message: "Batch must be in Dispatched status to mark as delivered" }, { status: 400 });
            }

            const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({ status: "Delivered" }),
            });
            if (!patchRes.ok) {
                return NextResponse.json({ message: `Failed to update status (HTTP ${patchRes.status})` }, { status: patchRes.status });
            }

            // Update sales orders → Delivered
            const orderIds = await getLinkedOrderIds(batchId);
            if (orderIds.length > 0) {
                await updateSalesOrderStatus(orderIds, "Delivered", "delivered_at");
            }

            return NextResponse.json({ success: true, message: "Batch marked as delivered" });
        }

        return NextResponse.json({ message: `Unknown action: ${action}` }, { status: 400 });
    } catch (e) {
        console.error("fulfilment-and-deliveries POST error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
