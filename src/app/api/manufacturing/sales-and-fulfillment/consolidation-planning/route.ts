import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
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
        const ids: number[] = items.map((c: { id: number }) => c.id);

        let details: { id: number; consolidator_id: number; product_id: number; ordered_quantity: number; picked_quantity: number; applied_quantity: number; picked_by: number | null; picked_at: string | null }[] = [];
        let junctions: { consolidator_id: number; invoice_id: number }[] = [];
        if (ids.length > 0) {
            const [dRes, jRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_in]=${ids.join(",")}&limit=-1`, { headers: directusHeaders, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_in]=${ids.join(",")}&limit=-1`, { headers: directusHeaders, cache: "no-store" }),
            ]);
            if (dRes.ok) details = (await dRes.json()).data || [];
            if (jRes.ok) junctions = (await jRes.json()).data || [];
        }

        const detailMap = new Map<number, typeof details>();
        for (const d of details) {
            const list = detailMap.get(d.consolidator_id) || [];
            list.push(d);
            detailMap.set(d.consolidator_id, list);
        }

        const invMap = new Map<number, number>();
        for (const j of junctions) {
            invMap.set(j.consolidator_id, (invMap.get(j.consolidator_id) || 0) + 1);
        }

        const productIds = [...new Set(details.map((d) => d.product_id).filter(Boolean))];
        let productMap = new Map<number, { product_name: string; product_code: string }>();
        if (productIds.length > 0) {
            const prodRes = await fetch(
                `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,product_code&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (prodRes.ok) {
                const prodData: { product_id: number; product_name: string; product_code: string }[] = (await prodRes.json()).data || [];
                productMap = new Map(prodData.map((p) => [p.product_id, p]));
            }
        }

        const branchMap = await getBranchesMap();

        const enriched = items.map((c: { id: number; consolidator_no: string; status: string; created_by: number; checked_by: number | null; branch_id: number; created_at: string; updated_at: string }) => {
            const batchDetails = detailMap.get(c.id) || [];
            return {
                id: c.id,
                consolidatorNo: c.consolidator_no,
                status: c.status || "Pending",
                createdBy: c.created_by,
                checkedBy: c.checked_by,
                branchId: c.branch_id,
                branchName: branchMap.get(c.branch_id)?.branchName || `Branch #${c.branch_id}`,
                invoiceCount: invMap.get(c.id) || 0,
                createdAt: c.created_at,
                updatedAt: c.updated_at,
                details: batchDetails.map((d) => {
                    const prod = productMap.get(d.product_id);
                    return {
                        id: d.id,
                        consolidatorId: d.consolidator_id,
                        productId: d.product_id,
                        productName: prod?.product_name || `Product #${d.product_id}`,
                        productCode: prod?.product_code || "",
                        orderedQuantity: Number(d.ordered_quantity || 0),
                        pickedQuantity: Number(d.picked_quantity || 0),
                        appliedQuantity: Number(d.applied_quantity || 0),
                        pickedById: d.picked_by,
                        pickedAt: d.picked_at,
                    };
                }),
                dispatches: [],
                invoices: [],
                totalSalesOrderAmount: 0,
            };
        });

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
        const { branchId, invoiceIds, customAllocations } = body;

        if (!branchId || !invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
            return NextResponse.json({ message: "branchId and invoiceIds are required" }, { status: 400 });
        }

        // Proxy to the existing invoice-consolidation POST which handles
        // lot allocation, reservations, and consolidator creation atomically
        const origin = req.nextUrl.origin;
        const proxyRes = await fetch(`${origin}/api/manufacturing/invoice-consolidation`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") || "" },
            body: JSON.stringify({ branchId, invoiceIds, customAllocations }),
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
