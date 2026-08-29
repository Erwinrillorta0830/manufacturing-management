import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../../invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PICKING_STATUSES = ["For Picking", "Picking"];

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

// ─── GET — list picking-stage batches ────────────────────────────────────────
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const page = Math.max(0, parseInt(searchParams.get("page") || "0"));
        const size = Math.max(1, Math.min(100, parseInt(searchParams.get("size") || "50")));
        const search = searchParams.get("search");
        const branchId = searchParams.get("branchId");

        if (!branchId) {
            return NextResponse.json({ message: "branchId is required" }, { status: 400 });
        }

        const qs = new URLSearchParams();
        qs.set("filter[consolidator_no][_starts_with]", "CLINV-");
        qs.set("filter[is_delete][_eq]", "0");
        qs.set("filter[branch_id][_eq]", branchId);
        qs.set("filter[status][_in]", PICKING_STATUSES.join(","));
        qs.set("sort", "-updated_at");
        qs.set("limit", String(size));
        qs.set("offset", String(page * size));
        qs.set("meta", "filter_count");

        if (search) {
            qs.set("filter[consolidator_no][_contains]", search);
        }

        const [listRes, detRes, invRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/consolidator?${qs.toString()}`, { headers: directusHeaders, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_nnull]=true&limit=-1`, { headers: directusHeaders, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/consolidator_invoices?limit=-1`, { headers: directusHeaders, cache: "no-store" }),
        ]);

        if (!listRes.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${listRes.status})` }, { status: listRes.status });
        }

        const json = await listRes.json();
        const items = json.data || [];
        const total = json.meta?.filter_count ?? items.length;
        const ids: number[] = items.map((c: { id: number }) => c.id);

        // Fetch details and invoices for this page only
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

        const branchMap = await getBranchesMap();

        const enriched = items.map((c: { id: number; consolidator_no: string; status: string; created_by: number; checked_by: number | null; branch_id: number; created_at: string; updated_at: string }) => {
            const batchDetails = detailMap.get(c.id) || [];
            return {
                id: c.id,
                consolidatorNo: c.consolidator_no,
                status: c.status || "Picking",
                createdBy: c.created_by,
                checkedBy: c.checked_by,
                branchId: c.branch_id,
                branchName: branchMap.get(c.branch_id)?.branchName || `Branch #${c.branch_id}`,
                invoiceCount: invMap.get(c.id) || 0,
                createdAt: c.created_at,
                updatedAt: c.updated_at,
                details: batchDetails.map((d) => ({
                    id: d.id,
                    consolidatorId: d.consolidator_id,
                    productId: d.product_id,
                    orderedQuantity: Number(d.ordered_quantity || 0),
                    pickedQuantity: Number(d.picked_quantity || 0),
                    appliedQuantity: Number(d.applied_quantity || 0),
                    pickedById: d.picked_by,
                    pickedAt: d.picked_at,
                })),
                dispatches: [],
                invoices: [],
                totalSalesOrderAmount: 0,
            };
        });

        return NextResponse.json({ content: enriched, totalElements: total, totalPages: Math.ceil(total / size) });
    } catch (e) {
        console.error("consolidation-picking GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}

// ─── POST — start picking / complete picking ──────────────────────────────────
// Proxies to invoice-consolidation/pick to reuse the full lot allocation logic
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

        // Validate status before proxying
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
        if (action === "start" && !["For Picking", "Picking"].includes(consolidator.status)) {
            return NextResponse.json({ message: "Batch must be in For Picking status to start" }, { status: 400 });
        }
        if (action === "complete" && consolidator.status !== "Picking") {
            return NextResponse.json({ message: "Batch must be in Picking status to complete" }, { status: 400 });
        }

        // Proxy to the existing pick handler (handles lot allocation, movements, etc.)
        const origin = req.nextUrl.origin;
        const pickRes = await fetch(`${origin}/api/manufacturing/invoice-consolidation/pick`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") || "" },
            body: JSON.stringify({ batchId, action }),
        });
        const pickData = await pickRes.json();
        return NextResponse.json(pickData, { status: pickRes.status });
    } catch (e) {
        console.error("consolidation-picking POST error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}

// ─── PATCH — save picked quantities ──────────────────────────────────────────
// Proxies to invoice-consolidation/pick PATCH
export async function PATCH(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const origin = req.nextUrl.origin;
        const pickRes = await fetch(`${origin}/api/manufacturing/invoice-consolidation/pick`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") || "" },
            body: JSON.stringify(body),
        });
        const pickData = await pickRes.json();
        return NextResponse.json(pickData, { status: pickRes.status });
    } catch (e) {
        console.error("consolidation-picking PATCH error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
