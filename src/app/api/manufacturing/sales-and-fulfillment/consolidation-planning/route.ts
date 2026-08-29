import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders, getTodayDateString } from "../../directus-api";
import { getUserIdFromToken } from "../../invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Planning-stage statuses ────────────────────────────────────────────────
const PLANNING_STATUSES = ["Pending", "For Picking"];

// ─── Branch cache ────────────────────────────────────────────────────────────
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

async function generateConsolidatorNo(): Promise<string> {
    const todayStr = await getTodayDateString();
    const today = todayStr.replace(/-/g, "");
    const prefix = `CLINV-${today}-`;
    const res = await fetch(
        `${DIRECTUS_URL}/items/consolidator?filter[consolidator_no][_starts_with]=${prefix}&filter[is_delete][_eq]=0&sort=-consolidator_no&limit=1&fields=consolidator_no`,
        { headers: directusHeaders, cache: "no-store" }
    );
    if (res.ok) {
        const data = (await res.json()).data || [];
        if (data.length > 0) {
            const seq = parseInt(data[0].consolidator_no.slice(-3), 10) + 1;
            return `${prefix}${String(seq).padStart(3, "0")}`;
        }
    }
    return `${prefix}001`;
}

// ─── GET — list planning-stage batches ───────────────────────────────────────
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const page = Math.max(0, parseInt(searchParams.get("page") || "0"));
        const size = Math.max(1, Math.min(100, parseInt(searchParams.get("size") || "50")));
        const status = searchParams.get("status");
        const search = searchParams.get("search");
        const branchId = searchParams.get("branchId");

        if (!branchId) {
            return NextResponse.json({ message: "branchId is required" }, { status: 400 });
        }

        const qs = new URLSearchParams();
        qs.set("filter[consolidator_no][_starts_with]", "CLINV-");
        qs.set("filter[is_delete][_eq]", "0");
        qs.set("filter[branch_id][_eq]", branchId);
        qs.set("sort", "-created_at");
        qs.set("limit", String(size));
        qs.set("offset", String(page * size));
        qs.set("meta", "filter_count");

        if (status && status !== "All") {
            if (PLANNING_STATUSES.includes(status)) {
                qs.set("filter[status][_eq]", status);
            }
        } else {
            // Default: show all planning statuses
            qs.set("filter[status][_in]", PLANNING_STATUSES.join(","));
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
        const branchMap = await getBranchesMap();

        const enriched = items.map((c: { id: number; consolidator_no: string; status: string; created_by: number; checked_by: number | null; branch_id: number; created_at: string; updated_at: string }) => ({
            id: c.id,
            consolidatorNo: c.consolidator_no,
            status: c.status || "Pending",
            createdBy: c.created_by,
            checkedBy: c.checked_by,
            branchId: c.branch_id,
            branchName: branchMap.get(c.branch_id)?.branchName || `Branch #${c.branch_id}`,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
            details: [],
            dispatches: [],
            invoices: [],
            totalSalesOrderAmount: 0,
        }));

        return NextResponse.json({
            content: enriched,
            totalElements: total,
            totalPages: Math.ceil(total / size),
        });
    } catch (e) {
        console.error("consolidation-planning GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}

// ─── POST — create batch (proxy to invoice-consolidation) ───────────────────
export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { branchId, invoiceIds } = body;

        if (!branchId || !invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
            return NextResponse.json({ message: "branchId and invoiceIds are required" }, { status: 400 });
        }

        // Proxy to the existing invoice-consolidation POST which handles
        // lot allocation, reservations, and consolidator creation atomically
        const origin = req.nextUrl.origin;
        const proxyRes = await fetch(`${origin}/api/manufacturing/invoice-consolidation`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") || "" },
            body: JSON.stringify({ branchId, invoiceIds }),
        });
        const proxyData = await proxyRes.json();
        return NextResponse.json(proxyData, { status: proxyRes.status });
    } catch (e) {
        console.error("consolidation-planning POST error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}

// ─── PATCH — status transition (Pending → For Picking) ───────────────────────
export async function PATCH(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { batchId, action } = body;

        if (!batchId) {
            return NextResponse.json({ message: "batchId is required" }, { status: 400 });
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

        if (action === "mark-ready") {
            if (consolidator.status !== "Pending") {
                return NextResponse.json({ message: "Only Pending batches can be marked ready for picking" }, { status: 400 });
            }
            const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({ status: "For Picking" }),
            });
            if (!patchRes.ok) {
                return NextResponse.json({ message: `Failed to update status (HTTP ${patchRes.status})` }, { status: patchRes.status });
            }

            // Update linked sales orders → For Picking
            const invRes = await fetch(
                `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&limit=-1&fields=invoice_id`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (invRes.ok) {
                const junctions: { invoice_id: number }[] = (await invRes.json()).data || [];
                const invoiceIds = junctions.map((j) => j.invoice_id);
                if (invoiceIds.length > 0) {
                    const siRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${invoiceIds.join(",")}&fields=invoice_id,order_id,sales_order_id&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (siRes.ok) {
                        const invoices: { order_id: number | null; sales_order_id: number | null }[] = (await siRes.json()).data || [];
                        const orderIds = [...new Set(invoices.map((inv) => Number(inv.order_id || inv.sales_order_id || 0)).filter(Boolean))];
                        for (const orderId of orderIds) {
                            await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                                method: "PATCH",
                                headers: directusHeaders,
                                body: JSON.stringify({ order_status: "For Picking", for_picking_at: new Date().toISOString() }),
                            });
                        }
                    }
                }
            }
            return NextResponse.json({ success: true, message: "Batch marked ready for picking" });
        }

        return NextResponse.json({ message: `Unknown action: ${action}` }, { status: 400 });
    } catch (e) {
        console.error("consolidation-planning PATCH error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
