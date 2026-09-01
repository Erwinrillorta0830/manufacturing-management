import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { resolveVersions } from "../version-resolver";
import { getUserIdFromToken } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CandidateProductLineResolved {
    detailId?: number;
    productId: number;
    productName: string;
    productCode: string;
    quantity: number;
    orderedQuantity?: number;
    allocatedQuantity?: number;
    consolidatedQuantity?: number;
    remainingQuantity?: number;
    versionId: number | null;
    versionName: string | null;
}

function isDeleted(val: unknown): boolean {
    if (!val) return false;
    if (val === 1 || val === true) return true;
    if (typeof val === "object" && val && "data" in (val as Record<string, unknown>)) {
        const d = (val as { data: number[] }).data;
        return Array.isArray(d) && d[0] === 1;
    }
    return false;
}

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get("branchId");

        if (!branchId) {
            return NextResponse.json({ message: "branchId is required" }, { status: 400 });
        }

        // 1. Fetch active, non-deleted consolidator batches (Pending, For Picking, Picking, Picked, Audited)
        const consolidatorRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator?filter[status][_in]=Pending,For Picking,Picking,Picked,Audited&limit=-1&fields=id,consolidator_no,status,is_delete`,
            { headers: directusHeaders, cache: "no-store" }
        ).catch(() => null);
        const consolidatorData: Array<{ id: number; status: string; is_delete?: unknown }> =
            consolidatorRes && consolidatorRes.ok ? (await consolidatorRes.json()).data || [] : [];
        const activeConsolidatorIds = consolidatorData
            .filter((c) => !isDeleted(c.is_delete) && ["Pending", "For Picking", "Picking", "Picked", "Audited"].includes(c.status))
            .map((c) => Number(c.id))
            .filter(Boolean);

        // Fetch detail IDs or order IDs that are already present in active consolidator_details / consolidator_invoices
        let activeConsolidatedDetailIds = new Set<number>();
        let activeLinkedInvoiceIds = new Set<number>();

        if (activeConsolidatorIds.length > 0) {
            const [cDetRes, cInvRes] = await Promise.all([
                fetch(
                    `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_in]=${activeConsolidatorIds.join(",")}&limit=-1&fields=id,consolidator_id,sales_order_detail_id`,
                    { headers: directusHeaders, cache: "no-store" }
                ).catch(() => null),
                fetch(
                    `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_in]=${activeConsolidatorIds.join(",")}&limit=-1&fields=invoice_id,consolidator_id`,
                    { headers: directusHeaders, cache: "no-store" }
                ).catch(() => null),
            ]);

            if (cDetRes && cDetRes.ok) {
                const cDetData: Array<{ sales_order_detail_id: number }> = (await cDetRes.json()).data || [];
                activeConsolidatedDetailIds = new Set(
                    cDetData.map((d) => Number(d.sales_order_detail_id)).filter(Boolean)
                );
            }

            if (cInvRes && cInvRes.ok) {
                const cInvData: Array<{ invoice_id: number }> = (await cInvRes.json()).data || [];
                activeLinkedInvoiceIds = new Set(
                    cInvData.map((j) => Number(j.invoice_id)).filter(Boolean)
                );
            }
        }

        // 2. Fetch candidate Sales Orders (strictly order_status: 'For Consolidation')
        const soFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { branch_id: { _eq: Number(branchId) } },
                { order_status: { _eq: "For Consolidation" } },
            ],
        }));
        const soRes = await fetch(
            `${DIRECTUS_URL}/items/sales_order?filter=${soFilter}&limit=-1&fields=order_id,order_no,po_no,customer_code,branch_id,order_date,delivery_date,order_status,total_amount,allocated_amount,net_amount`,
            { headers: directusHeaders, cache: "no-store" }
        ).catch(() => null);
        const salesOrders: Array<{
            order_id: number;
            order_no: string;
            po_no: string;
            customer_code: string;
            branch_id: number;
            order_date: string;
            delivery_date?: string | null;
            order_status: string;
            total_amount: number;
            allocated_amount: number;
            net_amount: number;
        }> = soRes && soRes.ok ? (await soRes.json()).data || [] : [];

        // 3. Fetch candidate Job Orders (status in 'Completed', 'QA Inspection', 'Released', 'In Progress')
        const joFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { branch_id: { _eq: Number(branchId) } },
                { status: { _in: ["Completed", "QA Inspection", "Released", "In Progress"] } },
            ],
        }));
        const joRes = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_job_orders?filter=${joFilter}&limit=-1&fields=job_order_id,job_order_no,product_id,version_id,target_quantity,actual_quantity_produced,status,start_date,end_date,branch_id`,
            { headers: directusHeaders, cache: "no-store" }
        ).catch(() => null);
        const jobOrders: Array<{
            job_order_id: number;
            job_order_no: string;
            product_id: number;
            version_id: number;
            target_quantity: number;
            actual_quantity_produced: number;
            status: string;
            start_date?: string;
            end_date?: string;
            branch_id: number;
        }> = joRes && joRes.ok ? ((await joRes.json()).data || []).filter((j: { job_order_id: number }) => !activeLinkedInvoiceIds.has(Number(j.job_order_id))) : [];

        // 4. Gather all customer codes across Sales Orders
        const customerCodes = [
            ...new Set([
                ...salesOrders.map((o) => o.customer_code),
            ].filter(Boolean)),
        ];

        let customerMap = new Map<string, { id: number; customer_name: string }>();
        if (customerCodes.length > 0) {
            const custRes = await fetch(
                `${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${customerCodes.map((c) => encodeURIComponent(c)).join(",")}&limit=-1&fields=id,customer_code,customer_name`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null);
            if (custRes && custRes.ok) {
                const custData = (await custRes.json()).data || [];
                customerMap = new Map(custData.map((c: { id: number; customer_code: string; customer_name: string }) => [c.customer_code, c]));
            }
        }

        // Fetch details for Sales Orders
        const soIds = salesOrders.map((o) => o.order_id);
        let soDetails: Array<{ detail_id: number; order_id: number; product_id: number; bom_version_id?: number | null; ordered_quantity: number }> = [];
        if (soIds.length > 0) {
            const sodRes = await fetch(
                `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${soIds.join(",")}&limit=-1&fields=detail_id,order_id,product_id,bom_version_id,ordered_quantity`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null);
            if (sodRes && sodRes.ok) {
                soDetails = (await sodRes.json()).data || [];
                console.log(`[Consolidation Candidates] Loaded ${soDetails.length} sales_order_details rows for ${soIds.length} orders.`);
            }
        }

        // Product metadata lookup
        const allProdIds = [
            ...new Set([
                ...soDetails.map((d) => Number(d.product_id)),
                ...jobOrders.map((j) => Number(j.product_id)),
            ].filter(Boolean)),
        ];

        let prodMap = new Map<number, { product_name: string; product_code: string; description?: string }>();
        if (allProdIds.length > 0) {
            const prodRes = await fetch(
                `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${allProdIds.join(",")}&fields=product_id,product_name,product_code,description&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null);
            if (prodRes && prodRes.ok) {
                const prodData = (await prodRes.json()).data || [];
                prodMap = new Map(prodData.map((p: { product_id: number; product_name: string; product_code: string; description?: string }) => [p.product_id, p]));
            }
        }

        // BOM Version lookup
        const allVersionIds = [
            ...new Set([
                ...soDetails.map((d) => Number(d.bom_version_id)).filter(Boolean),
                ...jobOrders.map((j) => Number(j.version_id)).filter(Boolean),
            ]),
        ];
        let versionTitleMap = new Map<number, string>();
        if (allVersionIds.length > 0) {
            const verRes = await fetch(
                `${DIRECTUS_URL}/items/product_manufacturing_version?filter[version_id][_in]=${allVersionIds.join(",")}&fields=version_id,version_name,version_code&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null);
            if (verRes && verRes.ok) {
                const verData = (await verRes.json()).data || [];
                for (const v of verData) {
                    versionTitleMap.set(Number(v.version_id), v.version_name || v.version_code || `v${v.version_id}`);
                }
            }
        }

        // Build unique customer-product pairs for automatic BOM version resolution if not explicitly assigned
        const versionPairs = new Map<string, { customerId: number; productId: number }>();
        for (const o of salesOrders) {
            const cust = customerMap.get(o.customer_code);
            if (!cust) continue;
            const details = soDetails.filter((d) => Number(d.order_id) === Number(o.order_id));
            for (const d of details) {
                const key = `${cust.id}:${d.product_id}`;
                if (!versionPairs.has(key)) {
                    versionPairs.set(key, { customerId: cust.id, productId: d.product_id });
                }
            }
        }
        const resolvedVersionMap = await resolveVersions(Array.from(versionPairs.values()));

        const candidates: Array<{
            invoiceId: number;
            invoiceNo: string;
            invoiceDate: string;
            deliveryDate?: string | null;
            grossAmount: number;
            netAmount: number;
            branchId: number;
            customerCode: string;
            customerName: string;
            orderId: number | null;
            orderNo: string;
            poNo: string;
            orderStatus: string;
            documentType: "SALES_ORDER" | "JOB_ORDER";
            products: CandidateProductLineResolved[];
        }> = [];

        console.log(`[Consolidation Candidates Validation] === Branch ${branchId} Candidate Evaluation ===`);
        console.log(`[Consolidation Candidates Validation] Found ${salesOrders.length} candidate Sales Orders in 'For Consolidation' status.`);
        console.log(`[Consolidation Candidates Validation] Active Consolidator IDs: [${activeConsolidatorIds.join(", ")}]`);

        // 1. Process Sales Orders (Show orders in 'For Consolidation' status that do not have active consolidator details)
        for (const order of salesOrders) {
            const details = soDetails.filter((d) => Number(d.order_id) === Number(order.order_id));
            
            // Check if this order already has consolidator details in an active batch
            const hasConsolidatorDetails = details.some((d) => activeConsolidatedDetailIds.has(Number(d.detail_id)))
                || activeLinkedInvoiceIds.has(Number(order.order_id));

            if (hasConsolidatorDetails) {
                console.log(`[Consolidation Candidates Validation] SO ${order.order_no} (ID: ${order.order_id}) -> HIDE (Already has active consolidator details)`);
                continue;
            }

            const cust = customerMap.get(order.customer_code);
            const lines: CandidateProductLineResolved[] = [];

            for (const d of details) {
                const dId = Number(d.detail_id);
                const orderedQty = Number(d.ordered_quantity || 0);
                const pId = Number(d.product_id);
                const prod = prodMap.get(pId);
                const explicitVersionId = Number(d.bom_version_id || 0);
                const versionKey = cust ? `${cust.id}:${pId}` : "";
                const autoVersion = resolvedVersionMap.get(versionKey);

                const finalVersionId = explicitVersionId || autoVersion?.versionId || null;
                const finalVersionName = explicitVersionId
                    ? (versionTitleMap.get(explicitVersionId) || `v${explicitVersionId}`)
                    : (autoVersion?.versionName || null);

                lines.push({
                    detailId: dId,
                    productId: pId,
                    productName: prod?.description || prod?.product_name || `Product #${pId}`,
                    productCode: prod?.product_code || "",
                    quantity: orderedQty,
                    orderedQuantity: orderedQty,
                    versionId: finalVersionId,
                    versionName: finalVersionName,
                });
            }

            console.log(`[Consolidation Candidates Validation] SO ${order.order_no} (ID: ${order.order_id}) -> SHOW IN SELECTION LIST (${lines.length} lines)`);

            candidates.push({
                invoiceId: order.order_id,
                invoiceNo: order.order_no,
                invoiceDate: order.order_date,
                deliveryDate: order.delivery_date,
                grossAmount: Number(order.total_amount || 0),
                netAmount: Number(order.net_amount || order.total_amount || 0),
                branchId: order.branch_id,
                customerCode: order.customer_code,
                customerName: cust?.customer_name || order.customer_code,
                orderId: order.order_id,
                orderNo: order.order_no,
                poNo: order.po_no || "",
                orderStatus: order.order_status || "For Consolidation",
                documentType: "SALES_ORDER",
                products: lines,
            });
        }

        // 2. Process Job Orders
        for (const jo of jobOrders) {
            const pId = Number(jo.product_id);
            const prod = prodMap.get(pId);
            const qty = Number(jo.actual_quantity_produced || jo.target_quantity || 0);
            if (qty <= 0) continue;

            const vId = Number(jo.version_id || 0) || null;
            const vName = vId ? (versionTitleMap.get(vId) || `v${vId}`) : null;

            candidates.push({
                invoiceId: jo.job_order_id,
                invoiceNo: jo.job_order_no,
                invoiceDate: jo.start_date || new Date().toISOString().slice(0, 10),
                deliveryDate: jo.end_date || null,
                grossAmount: 0,
                netAmount: 0,
                branchId: jo.branch_id,
                customerCode: "INTERNAL",
                customerName: "Job Order Production",
                orderId: jo.job_order_id,
                orderNo: jo.job_order_no,
                poNo: "",
                orderStatus: jo.status,
                documentType: "JOB_ORDER",
                products: [
                    {
                        productId: pId,
                        productName: prod?.description || prod?.product_name || `Product #${pId}`,
                        productCode: prod?.product_code || "",
                        quantity: qty,
                        versionId: vId,
                        versionName: vName,
                    },
                ],
            });
        }

        return NextResponse.json(candidates);
    } catch (e) {
        console.error("invoice-consolidation candidates GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
