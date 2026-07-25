import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../directus-api";
import {
    allocateInvoicesForConsolidation,
    releaseReservationIds,
} from "./_reservation-service";
import { getUserIdFromToken } from "./_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireAuth(userId: number | null): NextResponse | null {
    if (!userId || isNaN(userId)) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return null;
}

let branchesCache: Map<number, { branchName: string; branchCode: string }> | null = null;

async function getBranchesMap(): Promise<Map<number, { branchName: string; branchCode: string }>> {
    if (branchesCache) return branchesCache;
    const res = await fetch(
        `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&fields=id,branch_name,branch_code`,
        { headers: directusHeaders, cache: "no-store" }
    );
    if (res.ok) {
        const data = (await res.json()).data || [];
        branchesCache = new Map(data.map((b: { id: number; branch_name: string; branch_code: string }) => [b.id, { branchName: b.branch_name, branchCode: b.branch_code }]));
    } else {
        branchesCache = new Map();
    }
    return branchesCache;
}

async function generateConsolidatorNo(): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `CLINV-${today}-`;
    const res = await fetch(
        `${DIRECTUS_URL}/items/consolidator?filter[consolidator_no][_starts_with]=${prefix}&filter[is_delete][_eq]=0&sort=-consolidator_no&limit=1&fields=consolidator_no`,
        { headers: directusHeaders, cache: "no-store" }
    );
    if (res.ok) {
        const data = (await res.json()).data || [];
        if (data.length > 0) {
            const lastNo = data[0].consolidator_no;
            const seq = parseInt(lastNo.slice(-3), 10) + 1;
            return `${prefix}${String(seq).padStart(3, "0")}`;
        }
    }
    return `${prefix}001`;
}

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
        const items = json.data || [];
        const total = json.meta?.filter_count ?? items.length;
        const ids = items.map((c: { id: number }) => c.id);

        let invJunctions: { id: number; consolidator_id: number; invoice_id: number; created_at: string }[] = [];
        if (ids.length > 0) {
            const invRes = await fetch(
                `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_in]=${ids.join(",")}&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (!invRes.ok) {
                return NextResponse.json({ message: `Directus error (HTTP ${invRes.status})` }, { status: invRes.status });
            }
            invJunctions = (await invRes.json()).data || [];
        }

        let detJunctions: { id: number; consolidator_id: number; product_id: number; ordered_quantity: number; picked_quantity: number; applied_quantity: number; picked_by: number | null; picked_at: string | null }[] = [];
        if (ids.length > 0) {
            const detRes = await fetch(
                `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_in]=${ids.join(",")}&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (!detRes.ok) {
                return NextResponse.json({ message: `Directus error (HTTP ${detRes.status})` }, { status: detRes.status });
            }
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

        const allInvoiceIds = [...new Set(invJunctions.map((j) => j.invoice_id))];
        let invoiceMap = new Map<number, { invoice_no: string; branch_id: number; total_amount: number; customer_code: string }>();
        let customerNameMap = new Map<string, string>();
        if (allInvoiceIds.length > 0) {
            const siRes = await fetch(
                `${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${allInvoiceIds.join(",")}&fields=invoice_id,invoice_no,branch_id,total_amount,customer_code&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (!siRes.ok) {
                return NextResponse.json({ message: `Directus error (HTTP ${siRes.status})` }, { status: siRes.status });
            }
            const siData: { invoice_id: number; invoice_no: string; branch_id: number; total_amount: number; customer_code: string }[] = (await siRes.json()).data || [];
            invoiceMap = new Map(siData.map((s) => [s.invoice_id, s]));

            const customerCodes = [...new Set(siData.map((s) => s.customer_code).filter(Boolean))];
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

        const allProductIds = [...new Set(detJunctions.map((d) => d.product_id))];
        let productMap = new Map<number, { product_name: string; product_code: string }>();
        if (allProductIds.length > 0) {
            const prodRes = await fetch(
                `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${allProductIds.join(",")}&fields=product_id,product_name,product_code&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (prodRes.ok) {
                const prodData = (await prodRes.json()).data || [];
                productMap = new Map(prodData.map((p: { product_id: number; product_name: string; product_code: string }) => [p.product_id, p]));
            }
        }

        const branchMap = await getBranchesMap();
        const enriched = items.map((c: { id: number; consolidator_no: string; status: string; created_by: number; checked_by: number | null; branch_id: number; created_at: string; updated_at: string }) => {
            const junctions = junctionMap.get(c.id) || [];
            const invoices = junctions.map((j) => {
                const si = invoiceMap.get(j.invoice_id);
                return {
                    id: j.id,
                    consolidatorId: j.consolidator_id,
                    invoiceId: j.invoice_id,
                    invoiceNo: si?.invoice_no || `#${j.invoice_id}`,
                    branchId: si?.branch_id ?? c.branch_id,
                    customerName: (si?.customer_code && customerNameMap.get(si.customer_code)) || si?.customer_code || "",
                    createdAt: j.created_at,
                };
            });
            const totalAmount = invoices.reduce((sum: number, inv) => {
                const si = invoiceMap.get(inv.invoiceId);
                return sum + (si ? Number(si.total_amount || 0) : 0);
            }, 0);

            const details = (detailMap.get(c.id) || []).map((d) => {
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
        console.error("invoice-consolidation GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        const authError = requireAuth(userId);
        if (authError) return authError;

        const body = await req.json();
        const { branchId, invoiceIds } = body;

        if (!branchId || !invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
            return NextResponse.json({ message: "branchId and invoiceIds are required" }, { status: 400 });
        }

        if (invoiceIds.some((id: unknown) => typeof id !== "number" || id <= 0 || !Number.isInteger(id))) {
            return NextResponse.json({ message: "All invoiceIds must be positive integers" }, { status: 400 });
        }

        const uniqueIds = [...new Set<number>(invoiceIds)];
        if (uniqueIds.length !== invoiceIds.length) {
            return NextResponse.json({ message: "Duplicate invoice IDs are not allowed" }, { status: 400 });
        }

        const siRes = await fetch(
            `${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${uniqueIds.join(",")}&fields=invoice_id,invoice_no,invoice_date,branch_id,total_amount,customer_code,isDispatched,transaction_status,order_id&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!siRes.ok) {
            return NextResponse.json({ message: `Failed to verify invoices (HTTP ${siRes.status})` }, { status: siRes.status });
        }
        const siData: { invoice_id: number; invoice_no: string; invoice_date: string | null; branch_id: number; total_amount: number; customer_code: string; isDispatched: boolean | null; transaction_status: string; order_id: number | null }[] = (await siRes.json()).data || [];

        if (siData.length !== uniqueIds.length) {
            const found = new Set(siData.map((s) => s.invoice_id));
            const missing = uniqueIds.filter((id) => !found.has(id));
            return NextResponse.json({ message: `Invoices not found: ${missing.join(", ")}` }, { status: 400 });
        }

        for (const inv of siData) {
            if (inv.branch_id !== Number(branchId)) {
                return NextResponse.json({ message: `Invoice ${inv.invoice_no} belongs to a different branch` }, { status: 400 });
            }
            if (inv.isDispatched === true) {
                return NextResponse.json({ message: `Invoice ${inv.invoice_no} is already dispatched` }, { status: 400 });
            }
            if (inv.transaction_status !== "Prepared") {
                return NextResponse.json({ message: `Invoice ${inv.invoice_no} is not in Prepared status` }, { status: 400 });
            }
        }

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
            return NextResponse.json({ message: `Invoices already in another batch: ${alreadyLinked.join(", ")}` }, { status: 409 });
        }

        // Validate invoice details: positive quantities only, all resolvable to a product.
        const detCheckRes = await fetch(
            `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${uniqueIds.join(",")}&fields=detail_id,invoice_no,product_id,quantity&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!detCheckRes.ok) {
            return NextResponse.json({ message: `Failed to validate invoice details (HTTP ${detCheckRes.status})` }, { status: detCheckRes.status });
        }
        const detCheck: { detail_id: number; invoice_no: number; product_id: number; quantity: number }[] = (await detCheckRes.json()).data || [];
        const invoicesWithoutDetails = uniqueIds.filter((id) => !detCheck.some((d) => Number(d.invoice_no) === id));
        if (invoicesWithoutDetails.length > 0) {
            return NextResponse.json({ message: `Invoices have no product details: ${invoicesWithoutDetails.join(", ")}` }, { status: 400 });
        }
        if (detCheck.some((d) => Number(d.quantity || 0) <= 0)) {
            return NextResponse.json({ message: "One or more invoice lines have non-positive quantities" }, { status: 400 });
        }
        if (detCheck.some((d) => !d.product_id)) {
            return NextResponse.json({ message: "One or more invoice lines are missing a product_id" }, { status: 400 });
        }

        const allocationOrder = [...siData]
            .sort((a, b) =>
                (a.invoice_date || "9999-12-31").localeCompare(b.invoice_date || "9999-12-31")
                || a.invoice_id - b.invoice_id
            )
            .map((invoice) => invoice.invoice_id);
        let createdReservationIds: number[] = [];

        // Check if invoices already have full reservations; skip allocation if yes.
        const detailIds = detCheck.map((d) => d.detail_id);
        const existingResFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { sales_invoice_detail_id: { _in: detailIds } },
                { status: { _eq: "Reserved" } },
            ],
        }));
        const existingResJson = await fetch(
            `${DIRECTUS_URL}/items/sales_invoice_reservation?filter=${existingResFilter}&fields=sales_invoice_detail_id,quantity&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!existingResJson.ok) {
            return NextResponse.json({ message: "Failed to check existing reservations" }, { status: 502 });
        }
        const existingResData: { sales_invoice_detail_id: number; quantity: number }[] = (await existingResJson.json()).data || [];
        const reservedByDetail = new Map<number, number>();
        for (const row of existingResData) {
            const sid = Number(row.sales_invoice_detail_id);
            reservedByDetail.set(sid, (reservedByDetail.get(sid) || 0) + Number(row.quantity || 0));
        }
        const hasShortage = detCheck.some((d) => (reservedByDetail.get(d.detail_id) || 0) < Number(d.quantity || 0));

        if (hasShortage) {
            try {
                const allocation = await allocateInvoicesForConsolidation(allocationOrder, userId!);
                createdReservationIds = allocation.createdReservationIds;
            } catch (error) {
                const message = error instanceof Error ? error.message : "Failed to reserve invoice stock";
                return NextResponse.json({ message }, { status: 422 });
            }
        }

        const recheckRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator_invoices?filter[invoice_id][_in]=${uniqueIds.join(",")}&filter[consolidator_id][is_delete][_eq]=0&limit=1&fields=invoice_id`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!recheckRes.ok || ((await recheckRes.json()).data || []).length > 0) {
            await releaseReservationIds(createdReservationIds, userId!);
            return NextResponse.json({ message: "One or more invoices entered another batch during allocation" }, { status: 409 });
        }

        const consolidatorNo = await generateConsolidatorNo();

        const createBody: Record<string, unknown> = {
            consolidator_no: consolidatorNo,
            status: "Pending",
            branch_id: Number(branchId),
            created_by: userId,
        };

        const createRes = await fetch(`${DIRECTUS_URL}/items/consolidator`, {
            method: "POST",
            headers: directusHeaders,
            body: JSON.stringify(createBody),
        });
        if (!createRes.ok) {
            await releaseReservationIds(createdReservationIds, userId!);
            return NextResponse.json({ message: `Failed to create consolidator: ${createRes.status}` }, { status: createRes.status });
        }
        const newConsolidator = (await createRes.json()).data;
        const newId = newConsolidator.id;

        let createdJunctionIds: number[] = [];
        let createdDetailIds: number[] = [];

        try {
            const linkPayload = uniqueIds.map((invoiceId: number) => ({
                consolidator_id: newId,
                invoice_id: invoiceId,
            }));
            const linkRes = await fetch(`${DIRECTUS_URL}/items/consolidator_invoices`, {
                method: "POST",
                headers: directusHeaders,
                body: JSON.stringify(linkPayload),
            });
            if (!linkRes.ok) {
                const errText = await linkRes.text();
                throw new Error(`Failed to link invoices: ${linkRes.status} - ${errText}`);
            }
            const linkData = (await linkRes.json()).data || [];
            createdJunctionIds = linkData.map((j: { id: number }) => j.id);

            const detRes = await fetch(
                `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${uniqueIds.join(",")}&fields=detail_id,invoice_no,product_id,quantity&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (!detRes.ok) {
                throw new Error(`Failed to fetch invoice details (HTTP ${detRes.status})`);
            }
            const detData: { detail_id: number; invoice_no: number; product_id: number; quantity: number }[] = ((await detRes.json()).data || []).filter((d: { quantity: number; product_id: number }) => Number(d.quantity || 0) > 0 && d.product_id);

            const detailIds = detData.map((detail) => detail.detail_id);
            const reservationRes = await fetch(
                `${DIRECTUS_URL}/items/sales_invoice_reservation?filter[sales_invoice_detail_id][_in]=${detailIds.join(",")}&filter[status][_eq]=Reserved&fields=sales_invoice_detail_id,quantity&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (!reservationRes.ok) {
                throw new Error(`Failed to verify invoice reservations (HTTP ${reservationRes.status})`);
            }
            const reservationData: { sales_invoice_detail_id: number; quantity: number }[] = (await reservationRes.json()).data || [];
            const reservedByDetail = new Map<number, number>();
            for (const reservation of reservationData) {
                const detailId = Number(reservation.sales_invoice_detail_id);
                reservedByDetail.set(detailId, (reservedByDetail.get(detailId) || 0) + Number(reservation.quantity || 0));
            }

            const incompleteDetails = detData.filter((detail) =>
                (reservedByDetail.get(detail.detail_id) || 0) < Number(detail.quantity || 0)
            );
            if (incompleteDetails.length > 0) {
                throw new Error("One or more invoice lines could not be fully reserved during batch creation.");
            }

            const aggMap = new Map<number, number>();
            for (const d of detData) {
                aggMap.set(d.product_id, (aggMap.get(d.product_id) || 0) + Number(d.quantity || 0));
            }

            if (aggMap.size === 0) {
                throw new Error("Selected invoices have no valid product lines to consolidate");
            }

            const detailPayload = Array.from(aggMap.entries()).map(([productId, qty]) => ({
                consolidator_id: newId,
                product_id: productId,
                ordered_quantity: qty,
                picked_quantity: 0,
                applied_quantity: 0,
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

            const productIds = Array.from(aggMap.keys());
            let productMap = new Map<number, { product_name: string; product_code: string }>();
            if (productIds.length > 0) {
                const prodRes = await fetch(
                    `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,product_code&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (prodRes.ok) {
                    const prodData = (await prodRes.json()).data || [];
                    productMap = new Map(prodData.map((p: { product_id: number; product_name: string; product_code: string }) => [p.product_id, p]));
                }
            }

            const details = Array.from(aggMap.entries()).map(([productId, qty]) => {
                const prod = productMap.get(productId);
                return {
                    productId,
                    productName: prod?.product_name || `Product #${productId}`,
                    productCode: prod?.product_code || "",
                    orderedQuantity: qty,
                    pickedQuantity: 0,
                    appliedQuantity: 0,
                };
            });

            // Transition linked sales orders to For Consolidation
            const orderIdsToUpdate = [...new Set(siData.map((s) => Number(s.order_id)).filter(Boolean))];
            if (orderIdsToUpdate.length > 0) {
                const updateRes = await fetch(`${DIRECTUS_URL}/items/sales_order`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        query: { filter: { order_id: { _in: orderIdsToUpdate } } },
                        data: { order_status: "For Consolidation" },
                    }),
                });
                if (!updateRes.ok) throw new Error(`Failed to update order statuses: HTTP ${updateRes.status}`);
            }

            const branchMap = await getBranchesMap();
            let postCustomerMap = new Map<string, string>();
            const postCustomerCodes = [...new Set(siData.map((s) => s.customer_code).filter(Boolean))];
            if (postCustomerCodes.length > 0) {
                const custRes = await fetch(
                    `${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${postCustomerCodes.map((c) => encodeURIComponent(c)).join(",")}&limit=-1&fields=customer_code,customer_name`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (custRes.ok) {
                    const custData: { customer_code: string; customer_name: string }[] = (await custRes.json()).data || [];
                    postCustomerMap = new Map(custData.map((c) => [c.customer_code, c.customer_name]));
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
                details,
                dispatches: [],
                invoices: siData.map((s) => ({
                    id: 0,
                    consolidatorId: newId,
                    invoiceId: s.invoice_id,
                    invoiceNo: s.invoice_no,
                    branchId: s.branch_id,
                    customerName: postCustomerMap.get(s.customer_code) || s.customer_code || "",
                    createdAt: new Date().toISOString(),
                })),
            });
        } catch (e) {
            const rollbackErrors: string[] = [];
            for (const pid of createdDetailIds) {
                const res = await fetch(`${DIRECTUS_URL}/items/consolidator_details/${pid}`, {
                    method: "DELETE",
                    headers: directusHeaders,
                }).catch(() => null);
                if (!res || !res.ok) rollbackErrors.push(`consolidator_details ${pid}`);
            }
            for (const jid of createdJunctionIds) {
                const res = await fetch(`${DIRECTUS_URL}/items/consolidator_invoices/${jid}`, {
                    method: "DELETE",
                    headers: directusHeaders,
                }).catch(() => null);
                if (!res || !res.ok) rollbackErrors.push(`consolidator_invoices ${jid}`);
            }
            const softRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${newId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({ is_delete: 1, deleted_at: new Date().toISOString(), deleted_by: userId }),
            }).catch(() => null);
            if (!softRes || !softRes.ok) rollbackErrors.push(`consolidator soft-delete ${newId}`);
            const releaseOk = await releaseReservationIds(createdReservationIds, userId!).catch(() => false);
            if (!releaseOk) rollbackErrors.push("reservation release");

            const msg = e instanceof Error ? e.message : "Failed to create consolidation";
            const body: Record<string, unknown> = { message: msg };
            if (rollbackErrors.length > 0) {
                body.rollbackErrors = rollbackErrors;
                body.message = `${msg}. Rollback could not fully revert: ${rollbackErrors.join(", ")}. Manual cleanup required.`;
            }
            return NextResponse.json(body, { status: 500 });
        }
    } catch (e) {
        console.error("invoice-consolidation POST error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
