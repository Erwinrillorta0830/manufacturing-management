import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";
import {
    allocateInvoicesForConsolidation,
    allocateInvoicesWithCustomAllocations,
    loadCandidateDocuments,
    releaseReservationIds,
} from "../../invoice-consolidation/_reservation-service";
import { getUserIdFromToken } from "../../invoice-consolidation/_auth";
import { getPhTimestamp } from "../../invoice-consolidation/_time-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let branchesCache: Map<number, { branchName: string; branchCode: string }> | null = null;

async function getBranchesMap(): Promise<Map<number, { branchName: string; branchCode: string }>> {
    if (branchesCache) return branchesCache;
    const res = await fetch(
        `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&fields=id,branch_name,branch_code`,
        { headers: directusHeaders, cache: "no-store" }
    );
    if (res.ok) {
        const data = (await res.json()).data || [];
        branchesCache = new Map(
            data.map((b: { id: number; branch_name: string; branch_code: string }) =>
                [b.id, { branchName: b.branch_name, branchCode: b.branch_code }]
            )
        );
    } else {
        branchesCache = new Map();
    }
    return branchesCache;
}

async function generateConsolidatorNo(): Promise<string> {
    const todayStr = await getTodayDateString();
    const today = todayStr.replace(/-/g, "");
    const prefix = `CON-${today}-`;
    const res = await fetch(
        `${DIRECTUS_URL}/items/consolidator?filter[consolidator_no][_starts_with]=${prefix}&filter[is_delete][_eq]=0&sort=-consolidator_no&limit=1&fields=consolidator_no`,
        { headers: directusHeaders, cache: "no-store" }
    );
    if (res.ok) {
        const data = (await res.json()).data || [];
        if (data.length > 0) {
            const lastNo = data[0].consolidator_no as string;
            const seq = parseInt(lastNo.slice(-3), 10) + 1;
            return `${prefix}${String(seq).padStart(3, "0")}`;
        }
    }
    return `${prefix}001`;
}

// ─── GET — list consolidation batches ────────────────────────────────────────
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
        qs.set("filter[is_delete][_eq]", "0");
        qs.set("filter[branch_id][_eq]", branchId);
        qs.set("sort", "-created_at");
        qs.set("limit", String(size));
        qs.set("offset", String(page * size));
        qs.set("meta", "filter_count");

        if (status && status !== "All") {
            qs.set("filter[status][_eq]", status);
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
        const items: { id: number; consolidator_no: string; status: string; created_by: number; checked_by: number | null; branch_id: number; created_at: string; updated_at: string }[] = json.data || [];
        const total: number = json.meta?.filter_count ?? items.length;
        const ids = items.map((c) => c.id);

        let invJunctions: { id: number; consolidator_id: number; invoice_id: number; created_at: string }[] = [];
        let detJunctions: { id: number; consolidator_id: number; product_id: number; ordered_quantity: number; picked_quantity: number; applied_quantity: number; picked_by: number | null; picked_at: string | null }[] = [];

        if (ids.length > 0) {
            const [invRes, detRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_in]=${ids.join(",")}&limit=-1`, { headers: directusHeaders, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_in]=${ids.join(",")}&limit=-1`, { headers: directusHeaders, cache: "no-store" }),
            ]);
            if (!invRes.ok) {
                return NextResponse.json({ message: `Directus error (HTTP ${invRes.status})` }, { status: invRes.status });
            }
            if (!detRes.ok) {
                return NextResponse.json({ message: `Directus error (HTTP ${detRes.status})` }, { status: detRes.status });
            }
            invJunctions = (await invRes.json()).data || [];
            detJunctions = (await detRes.json()).data || [];
        }

        const junctionMap = new Map<number, typeof invJunctions>();
        for (const j of invJunctions) {
            const list = junctionMap.get(j.consolidator_id) || [];
            list.push(j);
            junctionMap.set(j.consolidator_id, list);
        }

        const detailMap = new Map<number, typeof detJunctions>();
        for (const d of detJunctions) {
            const list = detailMap.get(d.consolidator_id) || [];
            list.push(d);
            detailMap.set(d.consolidator_id, list);
        }

        const allInvoiceIds = [...new Set(invJunctions.map((j) => Number(j.invoice_id)).filter(Boolean))];
        let salesOrderMap = new Map<number, { order_id: number; order_no: string; branch_id: number; total_amount: number; net_amount: number; customer_code: string; created_date: string }>();
        let customerNameMap = new Map<string, string>();

        if (allInvoiceIds.length > 0) {
            const soRes = await fetch(
                `${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${allInvoiceIds.join(",")}&fields=order_id,order_no,branch_id,total_amount,net_amount,customer_code,created_date&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (soRes.ok) {
                const soData: { order_id: number; order_no: string; branch_id: number; total_amount: number; net_amount: number; customer_code: string; created_date: string }[] = (await soRes.json()).data || [];
                salesOrderMap = new Map(soData.map((s) => [s.order_id, s]));

                const customerCodes = [...new Set(soData.map((s) => s.customer_code).filter(Boolean))];
                if (customerCodes.length > 0) {
                    const custRes = await fetch(
                        `${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${customerCodes.map((c) => encodeURIComponent(c)).join(",")}&limit=-1&fields=customer_code,customer_name`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (custRes.ok) {
                        const custData: { customer_code: string; customer_name: string }[] = (await custRes.json()).data || [];
                        customerNameMap = new Map(custData.map((c) => [c.customer_code, c.customer_name]));
                    }
                }
            }
        }

        const allProductIds = [...new Set(detJunctions.map((d) => d.product_id).filter(Boolean))];
        let productMap = new Map<number, { product_name: string; product_code: string }>();
        if (allProductIds.length > 0) {
            const prodRes = await fetch(
                `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${allProductIds.join(",")}&fields=product_id,product_name,product_code&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (prodRes.ok) {
                const prodData: { product_id: number; product_name: string; product_code: string }[] = (await prodRes.json()).data || [];
                productMap = new Map(prodData.map((p) => [p.product_id, p]));
            }
        }

        const branchMap = await getBranchesMap();

        const enriched = items.map((c) => {
            const junctions = junctionMap.get(c.id) || [];
            const invoices = junctions
                .filter((j) => j.invoice_id !== null)
                .map((j) => {
                    const so = salesOrderMap.get(j.invoice_id);
                    return {
                        id: j.id,
                        consolidatorId: j.consolidator_id,
                        invoiceId: j.invoice_id,
                        invoiceNo: so?.order_no || `#${j.invoice_id}`,
                        branchId: so?.branch_id ?? c.branch_id,
                        customerName: (so?.customer_code && customerNameMap.get(so.customer_code)) || so?.customer_code || "Standard Fulfillment",
                        createdAt: so?.created_date || j.created_at,
                    };
                });

            const totalAmount = invoices.reduce((sum: number, inv) => {
                const so = salesOrderMap.get(inv.invoiceId);
                return sum + (so ? Number(so.net_amount || so.total_amount || 0) : 0);
            }, 0);

            const details = (detailMap.get(c.id) || []).map((d) => {
                const prod = productMap.get(d.product_id);
                return {
                    id: d.id,
                    consolidatorId: d.consolidator_id,
                    productId: d.product_id,
                    productName: prod?.product_name || `Product #${d.product_id}`,
                    productCode: prod?.product_code || "",
                    brand: "",
                    category: "",
                    unit: "",
                    orderedQuantity: Number(d.ordered_quantity || 0),
                    pickedQuantity: Number(d.picked_quantity || 0),
                    appliedQuantity: Number(d.applied_quantity || 0),
                    pickedById: d.picked_by,
                    pickedAt: d.picked_at,
                };
            });

            return {
                id: c.id,
                consolidatorNo: c.consolidator_no,
                status: c.status || "Pending",
                createdBy: c.created_by,
                checkedBy: c.checked_by,
                branchId: c.branch_id,
                branchName: branchMap.get(c.branch_id)?.branchName || `Branch #${c.branch_id}`,
                totalSalesOrderAmount: totalAmount,
                createdAt: c.created_at,
                updatedAt: c.updated_at,
                details,
                dispatches: [],
                invoices,
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

// ─── POST — create a new consolidation batch from sales orders ────────────────
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
        if (invoiceIds.some((id: unknown) => typeof id !== "number" || id <= 0 || !Number.isInteger(id))) {
            return NextResponse.json({ message: "All invoiceIds must be positive integers" }, { status: 400 });
        }

        const uniqueIds = [...new Set<number>(invoiceIds)];
        if (uniqueIds.length !== invoiceIds.length) {
            return NextResponse.json({ message: "Duplicate invoice IDs are not allowed" }, { status: 409 });
        }

        // Validate sales orders exist and belong to this branch
        const { invoices: siData, details: detCheck } = await loadCandidateDocuments(uniqueIds, Number(branchId));

        if (siData.length !== uniqueIds.length) {
            const found = new Set(siData.map((s) => s.invoice_id));
            const missing = uniqueIds.filter((id) => !found.has(id));
            return NextResponse.json({ message: `Sales orders not found: ${missing.join(", ")}` }, { status: 400 });
        }

        for (const inv of siData) {
            if (inv.branch_id !== Number(branchId)) {
                return NextResponse.json({ message: `Sales order ${inv.invoice_no} belongs to a different branch` }, { status: 400 });
            }
        }

        // Check none are already linked to an active batch
        const clinvRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator_invoices?filter[invoice_id][_in]=${uniqueIds.join(",")}&filter[consolidator_id][is_delete][_eq]=0&limit=-1&fields=invoice_id`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!clinvRes.ok) {
            return NextResponse.json({ message: `Failed to check existing links (HTTP ${clinvRes.status})` }, { status: clinvRes.status });
        }
        const linked: { invoice_id: number }[] = (await clinvRes.json()).data || [];
        if (linked.length > 0) {
            const alreadyLinked = linked.map((l) => l.invoice_id);
            return NextResponse.json({ message: `Sales orders already in another batch: ${alreadyLinked.join(", ")}` }, { status: 409 });
        }

        if (detCheck.length === 0) {
            return NextResponse.json({ message: "Selected sales orders have no product details" }, { status: 400 });
        }
        if (detCheck.some((d) => Number(d.quantity || 0) <= 0)) {
            return NextResponse.json({ message: "One or more sales order lines have non-positive quantities" }, { status: 400 });
        }

        // Allocate lot reservations (Custom or Auto FEFO)
        const allocationOrder = [...siData]
            .sort(
                (a, b) =>
                    (a.invoice_date || "9999-12-31").localeCompare(b.invoice_date || "9999-12-31") ||
                    a.invoice_id - b.invoice_id
            )
            .map((inv) => inv.invoice_id);

        let createdReservationIds: number[] = [];
        try {
            if (customAllocations && Array.isArray(customAllocations) && customAllocations.length > 0) {
                const allocation = await allocateInvoicesWithCustomAllocations(uniqueIds, customAllocations, userId!);
                createdReservationIds = allocation.createdReservationIds;
            } else {
                const allocation = await allocateInvoicesForConsolidation(allocationOrder, userId!);
                createdReservationIds = allocation.createdReservationIds;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to reserve stock";
            return NextResponse.json({ message }, { status: 422 });
        }

        // Create consolidator header
        const consolidatorNo = await generateConsolidatorNo();
        const phNow = getPhTimestamp();

        const createRes = await fetch(`${DIRECTUS_URL}/items/consolidator`, {
            method: "POST",
            headers: directusHeaders,
            body: JSON.stringify({
                consolidator_no: consolidatorNo,
                status: "Pending",
                branch_id: Number(branchId),
                created_by: userId,
                created_at: phNow,
                updated_at: phNow,
            }),
        });
        if (!createRes.ok) {
            await releaseReservationIds(createdReservationIds, userId!);
            return NextResponse.json({ message: `Failed to create consolidator: ${createRes.status}` }, { status: createRes.status });
        }
        const newConsolidator = (await createRes.json()).data;
        const newId = newConsolidator.id as number;

        let createdJunctionIds: number[] = [];
        let createdDetailIds: number[] = [];

        try {
            // Link each sales order — store actual invoice_id = sales_order.order_id
            const linkPayload = uniqueIds.map((docId: number) => ({
                consolidator_id: newId,
                invoice_id: docId,
            }));
            const linkRes = await fetch(`${DIRECTUS_URL}/items/consolidator_invoices`, {
                method: "POST",
                headers: directusHeaders,
                body: JSON.stringify(linkPayload),
            });
            if (!linkRes.ok) {
                const errText = await linkRes.text();
                throw new Error(`Failed to link sales orders: ${linkRes.status} - ${errText}`);
            }
            const linkData = (await linkRes.json()).data || [];
            createdJunctionIds = linkData.map((j: { id: number }) => j.id);

            // Update sales_order_details allocated_quantity and modified_date
            const detailIds = detCheck.map((d) => d.detail_id).filter(Boolean);
            if (detailIds.length > 0) {
                const reservationRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${detailIds.join(",")}&filter[status][_eq]=Reserved&fields=sales_order_detail_id,reserved_quantity,quantity&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (reservationRes.ok) {
                    const reservationData: { sales_order_detail_id: number; reserved_quantity?: number; quantity?: number }[] = (await reservationRes.json()).data || [];
                    const reservedMap = new Map<number, number>();
                    for (const reservation of reservationData) {
                        const detailId = Number(reservation.sales_order_detail_id);
                        reservedMap.set(detailId, (reservedMap.get(detailId) || 0) + Number(reservation.reserved_quantity ?? reservation.quantity ?? 0));
                    }
                    const phModifiedDate = getPhTimestamp();
                    await Promise.all(
                        detailIds.map((detailId) =>
                            fetch(`${DIRECTUS_URL}/items/sales_order_details/${detailId}`, {
                                method: "PATCH",
                                headers: directusHeaders,
                                body: JSON.stringify({
                                    allocated_quantity: reservedMap.get(detailId) || 0,
                                    modified_date: phModifiedDate,
                                }),
                            }).catch((err) => {
                                console.warn(`[consolidation-planning] Failed to update sales_order_details ${detailId}:`, err);
                            })
                        )
                    );
                }
            }

            // Create consolidator_details from sales_order_details
            const detailPayload = detCheck.map((d) => ({
                consolidator_id: newId,
                sales_order_detail_id: d.detail_id || null,
                product_id: d.product_id,
                ordered_quantity: Number(d.quantity || 0),
                picked_quantity: 0,
                applied_quantity: 0,
                picked_at: null,
                picked_by: null,
            }));
            const detCreateRes = await fetch(`${DIRECTUS_URL}/items/consolidator_details`, {
                method: "POST",
                headers: directusHeaders,
                body: JSON.stringify(detailPayload),
            });
            if (!detCreateRes.ok) {
                const errText = await detCreateRes.text();
                throw new Error(`Failed to create details: ${detCreateRes.status} - ${errText}`);
            }
            const detCreateData = (await detCreateRes.json()).data || [];
            createdDetailIds = detCreateData.map((d: { id: number }) => d.id);

            // Enrich product names for response
            const productIds = [...new Set(detCheck.map((d) => d.product_id))];
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
            let customerMap = new Map<string, string>();
            const customerCodes = [...new Set(siData.map((s) => s.customer_code).filter(Boolean))];
            if (customerCodes.length > 0) {
                const custRes = await fetch(
                    `${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${customerCodes.map((c) => encodeURIComponent(c)).join(",")}&limit=-1&fields=customer_code,customer_name`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (custRes.ok) {
                    const custData: { customer_code: string; customer_name: string }[] = (await custRes.json()).data || [];
                    customerMap = new Map(custData.map((c) => [c.customer_code, c.customer_name]));
                }
            }

            return NextResponse.json({
                id: newId,
                consolidatorNo,
                status: "Pending",
                createdBy: userId,
                checkedBy: null,
                branchId: Number(branchId),
                branchName: branchMap.get(Number(branchId))?.branchName || `Branch #${branchId}`,
                totalSalesOrderAmount: siData.reduce((sum, s) => sum + Number(s.total_amount || 0), 0),
                createdAt: newConsolidator.created_at,
                updatedAt: newConsolidator.updated_at,
                details: detCheck.map((d) => {
                    const prod = productMap.get(d.product_id);
                    return {
                        id: 0,
                        consolidatorId: newId,
                        productId: d.product_id,
                        productName: prod?.product_name || `Product #${d.product_id}`,
                        productCode: prod?.product_code || "",
                        brand: "",
                        category: "",
                        unit: "",
                        orderedQuantity: Number(d.quantity || 0),
                        pickedQuantity: 0,
                        appliedQuantity: 0,
                        pickedById: null,
                        pickedAt: null,
                    };
                }),
                dispatches: [],
                invoices: siData.map((s) => ({
                    id: 0,
                    consolidatorId: newId,
                    invoiceId: s.invoice_id,
                    invoiceNo: s.invoice_no,
                    branchId: s.branch_id,
                    customerName: customerMap.get(s.customer_code) || s.customer_code || "",
                    createdAt: new Date().toISOString(),
                })),
            });
        } catch (e) {
            // Rollback on failure
            for (const pid of createdDetailIds) {
                await fetch(`${DIRECTUS_URL}/items/consolidator_details/${pid}`, { method: "DELETE", headers: directusHeaders }).catch(() => null);
            }
            for (const jid of createdJunctionIds) {
                await fetch(`${DIRECTUS_URL}/items/consolidator_invoices/${jid}`, { method: "DELETE", headers: directusHeaders }).catch(() => null);
            }
            await fetch(`${DIRECTUS_URL}/items/consolidator/${newId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({ is_delete: 1, deleted_at: new Date().toISOString(), deleted_by: userId }),
            }).catch(() => null);
            await releaseReservationIds(createdReservationIds, userId!).catch(() => false);

            const msg = e instanceof Error ? e.message : "Failed to create consolidation";
            return NextResponse.json({ message: msg }, { status: 500 });
        }
    } catch (e) {
        console.error("consolidation-planning POST error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}

// ─── PATCH — mark batch ready for picking ────────────────────────────────────
export async function PATCH(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { batchId, action } = body;

        if (!batchId || action !== "mark-ready") {
            return NextResponse.json({ message: "batchId and action='mark-ready' are required" }, { status: 400 });
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
        const consolidator = items[0] as { status: string };
        if (consolidator.status !== "Pending") {
            return NextResponse.json(
                { message: `Batch must be in Pending status to mark ready (currently: ${consolidator.status})` },
                { status: 400 }
            );
        }

        const phNow = getPhTimestamp();
        const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({ status: "For Picking", updated_at: phNow }),
        });
        if (!patchRes.ok) {
            return NextResponse.json(
                { message: `Failed to update batch status (HTTP ${patchRes.status})` },
                { status: patchRes.status }
            );
        }

        // Transition all linked sales orders to For Picking & update for_picking_at, modified_date, modified_by
        const invoiceLinksRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&fields=invoice_id&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (invoiceLinksRes.ok) {
            const invoiceIds = ((await invoiceLinksRes.json()).data || [])
                .map((row: { invoice_id: number }) => Number(row.invoice_id))
                .filter(Boolean);
            if (invoiceIds.length > 0) {
                await Promise.all(
                    invoiceIds.map((orderId: number) =>
                        fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                            method: "PATCH",
                            headers: directusHeaders,
                            body: JSON.stringify({
                                order_status: "For Picking",
                                for_picking_at: phNow,
                                modified_date: phNow,
                                modified_by: userId,
                                updated_at: phNow,
                            }),
                        }).catch((err) => {
                            console.warn(`[consolidation-planning] Failed to update sales_order ${orderId}:`, err);
                        })
                    )
                );
            }
        }

        return NextResponse.json({ success: true, message: "Batch marked ready for picking" });
    } catch (e) {
        console.error("consolidation-planning PATCH error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
