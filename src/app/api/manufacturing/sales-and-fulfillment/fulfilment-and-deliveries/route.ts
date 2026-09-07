// src/app/api/manufacturing/sales-and-fulfillment/fulfilment-and-deliveries/route.ts

import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../../invoice-consolidation/_auth";
import { getPhTimestamp } from "../../invoice-consolidation/_time-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DirectusConsolidator {
    id: number;
    consolidator_no: string;
    status: string;
    branch_id: number;
    created_at: string;
    updated_at: string;
    created_by?: number;
    checked_by?: number | null;
}

interface DirectusConsolidatorInvoice {
    id: number;
    consolidator_id: number;
    invoice_id: number;
}

interface DirectusConsolidatorDetail {
    id: number;
    consolidator_id: number;
    sales_order_detail_id?: number | null;
    product_id: number;
    ordered_quantity: number;
    picked_quantity: number;
    applied_quantity: number;
}

interface DirectusInvoice {
    id?: number;
    invoice_id: number;
    order_id: string | number | Record<string, unknown>;
    customer_code?: string;
    invoice_no?: string;
    invoice_date?: string;
    dispatch_date?: string;
    transaction_status?: string;
    payment_status?: string;
    total_amount?: number;
    net_amount?: number;
    branch_id?: number;
    salesman_id?: number | Record<string, unknown>;
    salesman_code?: string;
    salesman_name?: string;
    isDispatched?: number | boolean;
    isDelivered?: number | boolean;
    remarks?: string;
    created_date?: string;
}

interface DirectusSalesOrder {
    id?: number;
    order_id: number;
    order_no: string;
    customer_code: string;
    order_status: string;
    branch_id?: number;
    total_amount?: number;
    net_amount?: number;
    order_date?: string;
    delivery_date?: string;
    created_date?: string;
    isDelivered?: number | boolean;
    delivered_at?: string | null;
    not_fulfilled_at?: string | null;
    invoice_id?: number;
    invoice_no?: string;
    salesman_id?: number | Record<string, unknown>;
    salesman_code?: string;
    salesman_name?: string;
    remarks?: string;
}


interface DirectusSalesOrderDetail {
    detail_id: number;
    order_id: number;
    product_id: number;
    ordered_quantity: number;
    allocated_quantity?: number;
    served_quantity?: number;
    unit_price?: number;
    gross_amount?: number;
    net_amount?: number;
    remarks?: string;
}

interface DirectusProduct {
    product_id: number;
    product_name: string;
    product_code: string;
    description?: string;
    short_description?: string;
}

interface DirectusCustomer {
    id: number;
    customer_name: string;
    customer_code: string;
}

interface DirectusBranch {
    id: number;
    branch_name: string;
    branch_code: string;
    isActive?: number | boolean;
}

interface DirectusSalesman {
    id: number;
    salesman_code: string;
    salesman_name: string;
}

// ─── GET: Fetch Consolidated Delivery Manifests ───────────────────────────────
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10));
        const size = Math.max(1, Math.min(100, parseInt(searchParams.get("size") || "50", 10)));
        const search = (searchParams.get("search") || "").trim().toLowerCase();
        const statusFilter = searchParams.get("status") || "All";
        const branchIdParam = searchParams.get("branchId");

        // 1. Fetch active branches for lookup (only isActive = 1)
        const branchRes = await fetch(
            `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&fields=id,branch_name,branch_code,isActive`,
            { headers: directusHeaders, cache: "no-store" }
        );
        const branches: DirectusBranch[] = branchRes.ok ? (await branchRes.json()).data || [] : [];
        const branchMap = new Map<number, DirectusBranch>(branches.map((b) => [Number(b.id), b]));

        // 2. Fetch consolidator trips eligible for clearance
        const consolidatorQs = new URLSearchParams();
        consolidatorQs.set("limit", "-1");
        consolidatorQs.set("sort", "-created_at,-id");
        consolidatorQs.set("filter[is_delete][_eq]", "0");

        if (branchIdParam && branchIdParam !== "All") {
            consolidatorQs.set("filter[branch_id][_eq]", branchIdParam);
        }

        const conRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator?${consolidatorQs.toString()}`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!conRes.ok) {
            throw new Error(`Failed to fetch consolidations (HTTP ${conRes.status})`);
        }
        const allConsolidators: DirectusConsolidator[] = (await conRes.json()).data || [];
        const consolidatorIds = allConsolidators.map((c) => Number(c.id)).filter(Boolean);

        // 3. Fetch BOTH consolidator_details AND consolidator_invoices
        const consolidatorDetails: DirectusConsolidatorDetail[] = [];
        const consolidatorInvoices: DirectusConsolidatorInvoice[] = [];

        if (consolidatorIds.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < consolidatorIds.length; i += chunkSize) {
                const chunk = consolidatorIds.slice(i, i + chunkSize);
                const [conDetRes, conInvRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_in]=${chunk.join(",")}&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_in]=${chunk.join(",")}&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);

                if (conDetRes.ok) {
                    const dData = (await conDetRes.json()).data || [];
                    consolidatorDetails.push(...dData);
                }
                if (conInvRes.ok) {
                    const iData = (await conInvRes.json()).data || [];
                    consolidatorInvoices.push(...iData);
                }
            }
        }

        // 4. Map consolidator -> sales_order_detail_ids and invoice_ids
        const conSodMap = new Map<number, number[]>();
        for (const cd of consolidatorDetails) {
            const conId = Number(cd.consolidator_id);
            const sodId = Number(cd.sales_order_detail_id);
            if (sodId) {
                const list = conSodMap.get(conId) || [];
                list.push(sodId);
                conSodMap.set(conId, list);
            }
        }

        const conInvMap = new Map<number, number[]>();
        for (const ci of consolidatorInvoices) {
            const conId = Number(ci.consolidator_id);
            const invId = Number(ci.invoice_id);
            if (invId) {
                const list = conInvMap.get(conId) || [];
                list.push(invId);
                conInvMap.set(conId, list);
            }
        }

        const allSodIds = [
            ...new Set(consolidatorDetails.map((cd) => Number(cd.sales_order_detail_id)).filter(Boolean)),
        ];

        // 5. Fetch sales_order_details matching allSodIds
        const salesOrderDetails: DirectusSalesOrderDetail[] = [];
        if (allSodIds.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < allSodIds.length; i += chunkSize) {
                const chunk = allSodIds.slice(i, i + chunkSize);
                const sodRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_details?filter[detail_id][_in]=${chunk.join(",")}&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (sodRes.ok) {
                    const chunkData = (await sodRes.json()).data || [];
                    salesOrderDetails.push(...chunkData);
                }
            }
        }
        const sodDetailMap = new Map<number, DirectusSalesOrderDetail>(
            salesOrderDetails.map((s) => [Number(s.detail_id), s])
        );

        // Collect all distinct order_ids & invoice_ids
        const sodOrderIds = salesOrderDetails.map((s) => Number(s.order_id)).filter(Boolean);
        const rawInvIds = consolidatorInvoices.map((ci) => Number(ci.invoice_id)).filter(Boolean);

        const candidateOrderIds = [...new Set([...sodOrderIds, ...rawInvIds])];

        // 6. Fetch sales_order for all candidate order IDs
        const salesOrders: DirectusSalesOrder[] = [];
        if (candidateOrderIds.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < candidateOrderIds.length; i += chunkSize) {
                const chunk = candidateOrderIds.slice(i, i + chunkSize);
                const [soRes, sodByOrderRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${chunk.join(",")}&fields=*&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${chunk.join(",")}&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);
                if (soRes.ok) {
                    const chunkData = (await soRes.json()).data || [];
                    salesOrders.push(...chunkData);
                }
                if (sodByOrderRes.ok) {
                    const chunkData = (await sodByOrderRes.json()).data || [];
                    for (const item of chunkData) {
                        const dId = Number(item.detail_id);
                        if (dId && !sodDetailMap.has(dId)) {
                            salesOrderDetails.push(item);
                            sodDetailMap.set(dId, item);
                        }
                    }
                }
            }
        }
        const salesOrderMap = new Map<number, DirectusSalesOrder>(
            salesOrders.map((so) => [Number(so.order_id), so])
        );

        const soOrderIds = salesOrders.map((s) => Number(s.order_id)).filter(Boolean);
        const soOrderNos = salesOrders.map((s) => (s.order_no ? s.order_no.toString().trim() : "")).filter(Boolean);
        const allNumericInvOrOrderIds = [...new Set([...sodOrderIds, ...rawInvIds, ...soOrderIds])];
        const allStringOrderIdentifiers = [...new Set([...soOrderNos, ...allNumericInvOrOrderIds.map(String)])];

        // 7. Fetch sales_invoice matching invoice_id, order_id (numeric & string order_no), invoice_no, and sales_invoice_details
        const allInvoices: DirectusInvoice[] = [];
        const candidateNumericIds = [...new Set([...allNumericInvOrOrderIds])];
        const candidateStringKeys = [...new Set([...allStringOrderIdentifiers])];

        const chunkSize = 100;
        const fetchPromises: Promise<void>[] = [];
        const rawSidList: Array<{ detail_id: number; order_id: string | number; invoice_no: number | string }> = [];

        // 7a. Unconditional fetch of all invoices (no status filter so NULL transaction_status is never dropped)
        fetchPromises.push(
            fetch(
                `${DIRECTUS_URL}/items/sales_invoice?limit=-1&sort=-invoice_id&fields=*`,
                { headers: directusHeaders, cache: "no-store" }
            )
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((json) => {
                    if (json.data && Array.isArray(json.data)) {
                        allInvoices.push(...json.data);
                    }
                })
                .catch((err) => console.warn("[fulfilment-and-deliveries API] Error fetching all invoices:", err))
        );

        // 7b. Fetch sales_invoice_details to bridge order_id -> invoice_id (stored in detail.invoice_no)
        for (let i = 0; i < candidateNumericIds.length; i += chunkSize) {
            const chunk = candidateNumericIds.slice(i, i + chunkSize);
            fetchPromises.push(
                fetch(
                    `${DIRECTUS_URL}/items/sales_invoice_details?filter[order_id][_in]=${chunk.join(",")}&fields=detail_id,order_id,invoice_no&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                )
                    .then((res) => (res.ok ? res.json() : { data: [] }))
                    .then((json) => {
                        if (json.data && Array.isArray(json.data)) {
                            rawSidList.push(...json.data);
                        }
                    })
                    .catch((err) => console.warn("[fulfilment-and-deliveries API] Error fetching sales_invoice_details:", err))
            );
            fetchPromises.push(
                fetch(
                    `${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${chunk.join(",")}&fields=*&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                )
                    .then((res) => (res.ok ? res.json() : { data: [] }))
                    .then((json) => {
                        if (json.data && Array.isArray(json.data)) {
                            allInvoices.push(...json.data);
                        }
                    })
                    .catch((err) => console.warn("[fulfilment-and-deliveries API] Error fetching invoices by invoice_id:", err))
            );
            fetchPromises.push(
                fetch(
                    `${DIRECTUS_URL}/items/sales_invoice?filter[order_id][_in]=${chunk.join(",")}&fields=*&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                )
                    .then((res) => (res.ok ? res.json() : { data: [] }))
                    .then((json) => {
                        if (json.data && Array.isArray(json.data)) {
                            allInvoices.push(...json.data);
                        }
                    })
                    .catch((err) => console.warn("[fulfilment-and-deliveries API] Error fetching invoices by order_id:", err))
            );
        }

        // 7c. Fetch by string order_no and invoice_no with fields=*
        for (let i = 0; i < candidateStringKeys.length; i += chunkSize) {
            const chunk = candidateStringKeys.slice(i, i + chunkSize);
            fetchPromises.push(
                fetch(
                    `${DIRECTUS_URL}/items/sales_invoice?filter[order_id][_in]=${chunk.map((x) => encodeURIComponent(x)).join(",")}&fields=*&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                )
                    .then((res) => (res.ok ? res.json() : { data: [] }))
                    .then((json) => {
                        if (json.data && Array.isArray(json.data)) {
                            allInvoices.push(...json.data);
                        }
                    })
                    .catch((err) => console.warn("[fulfilment-and-deliveries API] Error fetching invoices by order_no:", err))
            );
            fetchPromises.push(
                fetch(
                    `${DIRECTUS_URL}/items/sales_invoice?filter[invoice_no][_in]=${chunk.map((x) => encodeURIComponent(x)).join(",")}&fields=*&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                )
                    .then((res) => (res.ok ? res.json() : { data: [] }))
                    .then((json) => {
                        if (json.data && Array.isArray(json.data)) {
                            allInvoices.push(...json.data);
                        }
                    })
                    .catch((err) => console.warn("[fulfilment-and-deliveries API] Error fetching invoices by invoice_no:", err))
            );
        }

        await Promise.all(fetchPromises);

        // Map order_id -> invoice_id from sales_invoice_details
        const orderIdToInvoiceIdMap = new Map<string, number>();
        const additionalInvoiceIdsToFetch: number[] = [];
        for (const sid of rawSidList) {
            const ordStr = sid.order_id ? String(sid.order_id).trim() : "";
            const invId = Number(sid.invoice_no);
            if (ordStr && invId) {
                orderIdToInvoiceIdMap.set(ordStr.toLowerCase(), invId);
                const pNum = Number(ordStr);
                if (!isNaN(pNum)) orderIdToInvoiceIdMap.set(String(pNum), invId);
                additionalInvoiceIdsToFetch.push(invId);
            }
        }

        // Fetch any missing invoices referenced in sales_invoice_details
        const existingInvIds = new Set(allInvoices.map((i) => Number(i.invoice_id || i.id)));
        const missingInvIds = [...new Set(additionalInvoiceIdsToFetch)].filter((id) => !existingInvIds.has(id));
        if (missingInvIds.length > 0) {
            try {
                const missingRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${missingInvIds.slice(0, 200).join(",")}&fields=*&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (missingRes.ok) {
                    const mData = (await missingRes.json()).data || [];
                    allInvoices.push(...mData);
                }
            } catch (mErr) {
                console.warn("[fulfilment-and-deliveries API] Error fetching missing invoices by SID:", mErr);
            }
        }

        // Deduplicate and index invoices with relational unwrap
        const invoiceMapById = new Map<number, DirectusInvoice>();
        const invoiceMapByOrderKey = new Map<string, DirectusInvoice>();
        const invoiceMapByInvoiceNo = new Map<string, DirectusInvoice>();

        for (const rawInv of allInvoices) {
            const invId = Number(rawInv.invoice_id || rawInv.id);
            if (invId) {
                invoiceMapById.set(invId, rawInv);
            }

            // Extract order_id whether primitive or expanded relational object
            let ordIdStr: string | null = null;
            let ordIdNum: number | null = null;
            let ordNoFromRel: string | null = null;

            if (typeof rawInv.order_id === "object" && rawInv.order_id !== null) {
                const rel = rawInv.order_id as Record<string, unknown>;
                ordIdNum = Number(rel.order_id || rel.id || null);
                if (ordIdNum) ordIdStr = String(ordIdNum);
                if (rel.order_no) ordNoFromRel = String(rel.order_no).trim().toLowerCase();
            } else if (rawInv.order_id !== undefined && rawInv.order_id !== null) {
                const rawStr = String(rawInv.order_id).trim();
                if (rawStr.length > 0 && rawStr !== "[object Object]") {
                    ordIdStr = rawStr.toLowerCase();
                    const parsedNum = Number(rawStr);
                    if (!isNaN(parsedNum)) ordIdNum = parsedNum;
                }
            }

            if (ordIdStr) {
                invoiceMapByOrderKey.set(ordIdStr, rawInv);
            }
            if (ordIdNum) {
                invoiceMapByOrderKey.set(String(ordIdNum), rawInv);
                invoiceMapById.set(ordIdNum, rawInv);
            }
            if (ordNoFromRel) {
                invoiceMapByOrderKey.set(ordNoFromRel, rawInv);
            }

            // Extract invoice_no
            if (rawInv.invoice_no && typeof rawInv.invoice_no === "string") {
                const invNoLower = rawInv.invoice_no.trim().toLowerCase();
                if (invNoLower.length > 0) {
                    invoiceMapByInvoiceNo.set(invNoLower, rawInv);
                }
            }
        }

        // Cross-index invoices linked through sales_invoice_details
        for (const [orderKey, invId] of orderIdToInvoiceIdMap.entries()) {
            const targetInv = invoiceMapById.get(invId);
            if (targetInv && !invoiceMapByOrderKey.has(orderKey)) {
                invoiceMapByOrderKey.set(orderKey, targetInv);
            }
        }

        console.log("[fulfilment-and-deliveries API] 🧾 Fetched Invoices Summary:", {
            total_invoices_fetched: allInvoices.length,
            indexed_by_id_count: invoiceMapById.size,
            indexed_by_order_key_count: invoiceMapByOrderKey.size,
            sid_mapped_count: orderIdToInvoiceIdMap.size,
            sample_invoices: allInvoices.slice(0, 5).map((i) => ({
                invoice_id: i.invoice_id,
                order_id: i.order_id,
                invoice_no: i.invoice_no,
                invoice_date: i.invoice_date,
            })),
        });

        // 8. Fetch customer names
        const customerCodes = [
            ...new Set([
                ...allInvoices.map((i) => i.customer_code).filter(Boolean),
                ...salesOrders.map((s) => s.customer_code).filter(Boolean),
            ]),
        ];
        const customerCodeMap = new Map<string, string>();
        if (customerCodes.length > 0) {
            const custRes = await fetch(
                `${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${customerCodes.slice(0, 300).join(",")}&fields=id,customer_name,customer_code&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (custRes.ok) {
                const custList: DirectusCustomer[] = (await custRes.json()).data || [];
                for (const c of custList) {
                    if (c.customer_code) customerCodeMap.set(c.customer_code, c.customer_name);
                }
            }
        }

        // 8.5 Fetch salesman metadata
        const extractSalesmanId = (sm: unknown): number | null => {
            if (typeof sm === "object" && sm !== null) {
                const rec = sm as Record<string, unknown>;
                return Number(rec.id || rec.salesman_id) || null;
            }
            return Number(sm) || null;
        };

        const salesmanIds = [
            ...new Set([
                ...allInvoices.map((i) => extractSalesmanId(i.salesman_id)).filter((id): id is number => Boolean(id)),
                ...salesOrders.map((s) => extractSalesmanId(s.salesman_id)).filter((id): id is number => Boolean(id)),
            ]),
        ];
        const salesmanMap = new Map<number, DirectusSalesman>();
        if (salesmanIds.length > 0) {
            const smRes = await fetch(
                `${DIRECTUS_URL}/items/salesman?filter[id][_in]=${salesmanIds.slice(0, 300).join(",")}&fields=id,salesman_code,salesman_name&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (smRes.ok) {
                const smList: DirectusSalesman[] = (await smRes.json()).data || [];
                for (const sm of smList) {
                    const smId = Number(sm.id);
                    if (smId) salesmanMap.set(smId, sm);
                }
            }
        }

        // 9. Fetch product metadata
        const allProductIds = [
            ...new Set([
                ...consolidatorDetails.map((d) => Number(d.product_id)),
                ...salesOrderDetails.map((d) => Number(d.product_id)),
            ]),
        ].filter(Boolean);

        const products: DirectusProduct[] = [];
        if (allProductIds.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < allProductIds.length; i += chunkSize) {
                const chunk = allProductIds.slice(i, i + chunkSize);
                const prodRes = await fetch(
                    `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${chunk.join(",")}&fields=product_id,product_name,product_code,description,short_description&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (prodRes.ok) {
                    const chunkData = (await prodRes.json()).data || [];
                    products.push(...chunkData);
                }
            }
        }
        const productMap = new Map<number, DirectusProduct>();
        for (const p of products) {
            const pid = Number(p.product_id || (p as { id?: number }).id);
            if (pid) productMap.set(pid, p);
        }

        // 10. Fetch linked sales returns and return line items
        const allInvoiceNos = Array.from(invoiceMapById.values())
            .map((inv) => (inv.invoice_no ? inv.invoice_no.toString().trim() : ""))
            .filter(Boolean);
        const allInvoiceIds = Array.from(invoiceMapById.keys());
        const allOrderNos = Array.from(salesOrderMap.values())
            .map((so) => (so.order_no ? so.order_no.toString().trim() : ""))
            .filter(Boolean);
        const allOrderIds = Array.from(salesOrderMap.keys());
        const allCandidateNos = [
            ...new Set([
                ...allInvoiceNos,
                ...allOrderNos,
                ...allInvoiceIds.map(String),
                ...allOrderIds.map(String),
                ...candidateOrderIds.map(String),
            ]),
        ];

        const salesReturnMap = new Map<
            string,
            {
                return_id: number;
                return_number: string;
                invoice_no?: string;
                invoice_id?: number;
                order_id?: string | number;
                status: string;
                is_received?: boolean;
                return_date?: string | null;
                total_amount?: number | null;
            }
        >();
        const returnItemQtyMap = new Map<string, number>();

        try {
            // Check junction sales_invoice_sales_return
            const junctionReturnIds: number[] = [];
            const invoiceIdToReturnIdMap = new Map<number, number>();
            if (allInvoiceIds.length > 0) {
                try {
                    const jRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_sales_return?filter[invoice_no][_in]=${allInvoiceIds.slice(0, 300).join(",")}&limit=-1&fields=id,invoice_no,return_no`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (jRes.ok) {
                        const jData: Array<{ id: number; invoice_no: number | string; return_no: number | string }> =
                            (await jRes.json()).data || [];
                        for (const j of jData) {
                            const invId = Number(j.invoice_no);
                            const retId = Number(j.return_no);
                            if (invId && retId) {
                                junctionReturnIds.push(retId);
                                invoiceIdToReturnIdMap.set(invId, retId);
                            }
                        }
                    }
                } catch (jErr) {
                    console.warn("[fulfilment-and-deliveries GET] Error fetching junction links:", jErr);
                }
            }

            const [srByNoRes, srByOrderIdRes, srByJunctionRes, srRecentRes] = await Promise.all([
                allCandidateNos.length > 0
                    ? fetch(
                          `${DIRECTUS_URL}/items/sales_return?filter[invoice_no][_in]=${allCandidateNos
                              .slice(0, 300)
                              .map((no) => encodeURIComponent(no))
                              .join(",")}&fields=return_id,return_number,customer_code,salesman_id,branch_id,return_date,total_amount,remarks,created_by,order_id,invoice_no,status,isPosted,isApplied,isReceived&limit=-1`,
                          { headers: directusHeaders, cache: "no-store" }
                      )
                    : Promise.resolve(null),
                allCandidateNos.length > 0
                    ? fetch(
                          `${DIRECTUS_URL}/items/sales_return?filter[order_id][_in]=${allCandidateNos
                              .slice(0, 300)
                              .map((no) => encodeURIComponent(no))
                              .join(",")}&fields=return_id,return_number,customer_code,salesman_id,branch_id,return_date,total_amount,remarks,created_by,order_id,invoice_no,status,isPosted,isApplied,isReceived&limit=-1`,
                          { headers: directusHeaders, cache: "no-store" }
                      )
                    : Promise.resolve(null),
                junctionReturnIds.length > 0
                    ? fetch(
                          `${DIRECTUS_URL}/items/sales_return?filter[return_id][_in]=${junctionReturnIds
                              .slice(0, 300)
                              .join(",")}&fields=return_id,return_number,customer_code,salesman_id,branch_id,return_date,total_amount,remarks,created_by,order_id,invoice_no,status,isPosted,isApplied,isReceived&limit=-1`,
                          { headers: directusHeaders, cache: "no-store" }
                      )
                    : Promise.resolve(null),
                fetch(
                    `${DIRECTUS_URL}/items/sales_return?limit=250&sort=-return_id&fields=return_id,return_number,customer_code,salesman_id,branch_id,return_date,total_amount,remarks,created_by,order_id,invoice_no,status,isPosted,isApplied,isReceived`,
                    { headers: directusHeaders, cache: "no-store" }
                ),
            ]);

            const rawSrList: Array<{
                return_id: number;
                return_number: string;
                invoice_no?: string;
                order_id?: string | number;
                status: string;
                isReceived?: number | boolean;
                is_received?: number | boolean;
                return_date?: string | null;
                total_amount?: number | null;
            }> = [];

            if (srByNoRes && srByNoRes.ok) {
                const d = (await srByNoRes.json()).data || [];
                rawSrList.push(...d);
            }
            if (srByOrderIdRes && srByOrderIdRes.ok) {
                const d = (await srByOrderIdRes.json()).data || [];
                rawSrList.push(...d);
            }
            if (srByJunctionRes && srByJunctionRes.ok) {
                const d = (await srByJunctionRes.json()).data || [];
                rawSrList.push(...d);
            }
            if (srRecentRes && srRecentRes.ok) {
                const d = (await srRecentRes.json()).data || [];
                rawSrList.push(...d);
            }

            // Deduplicate by return_id
            const uniqueSrMap = new Map<number, (typeof rawSrList)[0]>();
            for (const sr of rawSrList) {
                if (sr.return_id) uniqueSrMap.set(Number(sr.return_id), sr);
            }
            const allSrData = Array.from(uniqueSrMap.values());

            for (const sr of allSrData) {
                const isReceived =
                    sr.status === "Received" ||
                    sr.status === "Approved" ||
                    sr.isReceived === 1 ||
                    sr.isReceived === true ||
                    sr.is_received === 1 ||
                    sr.is_received === true;

                const returnInfo = {
                    return_id: Number(sr.return_id),
                    return_number: sr.return_number || `SR-${sr.return_id}`,
                    invoice_no: sr.invoice_no ? sr.invoice_no.toString().trim() : undefined,
                    order_id: sr.order_id ? sr.order_id.toString().trim() : undefined,
                    status: sr.status || "Pending",
                    is_received: isReceived,
                    return_date: sr.return_date || null,
                    total_amount: sr.total_amount ? Number(sr.total_amount) : null,
                };
                if (sr.return_id) {
                    salesReturnMap.set(String(sr.return_id), returnInfo);
                }
                if (sr.return_number) {
                    salesReturnMap.set(sr.return_number.toString().trim().toLowerCase(), returnInfo);
                }
                if (sr.invoice_no) {
                    salesReturnMap.set(sr.invoice_no.toString().trim().toLowerCase(), returnInfo);
                }
                if (sr.order_id) {
                    salesReturnMap.set(sr.order_id.toString().trim().toLowerCase(), returnInfo);
                }
            }

            // Map junction links to returnInfo
            for (const [invId, retId] of invoiceIdToReturnIdMap.entries()) {
                const retInfo = salesReturnMap.get(String(retId));
                if (retInfo) {
                    salesReturnMap.set(`inv_id:${invId}`, retInfo);
                    salesReturnMap.set(String(invId), retInfo);
                }
            }

            // Fetch details for all found sales returns
            const distinctReturnNos = [
                ...new Set([
                    ...allSrData.map((s) => s.return_number).filter(Boolean),
                    ...allSrData.map((s) => String(s.return_id)).filter(Boolean),
                ]),
            ];

            if (distinctReturnNos.length > 0) {
                const srDetRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_return_details?filter[return_no][_in]=${distinctReturnNos
                        .slice(0, 300)
                        .map((r) => encodeURIComponent(r))
                        .join(",")}&limit=-1&fields=detail_id,return_no,product_id,quantity`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (srDetRes.ok) {
                    const srDetails: Array<{ detail_id: number; return_no: string; product_id: number | { product_id?: number; id?: number }; quantity: number }> =
                        (await srDetRes.json()).data || [];

                    // Map return_no to associated return info
                    const returnHeaderByNo = new Map<string, (typeof allSrData)[0]>();
                    for (const sr of allSrData) {
                        if (sr.return_number) {
                            returnHeaderByNo.set(sr.return_number.toString().trim(), sr);
                        }
                        if (sr.return_id) {
                            returnHeaderByNo.set(String(sr.return_id), sr);
                        }
                    }

                    for (const srd of srDetails) {
                        const rawPid = srd.product_id;
                        const pId = typeof rawPid === "object" && rawPid !== null
                            ? Number((rawPid as { product_id?: number; id?: number }).product_id || (rawPid as { product_id?: number; id?: number }).id)
                            : Number(rawPid);

                        const qty = Number(srd.quantity || 0);
                        const retNo = srd.return_no ? srd.return_no.toString().trim() : "";

                        if (pId && retNo) {
                            returnItemQtyMap.set(`${retNo}:${pId}`, qty);
                            returnItemQtyMap.set(`${retNo.toLowerCase()}:${pId}`, qty);

                            const header = returnHeaderByNo.get(retNo);
                            if (header) {
                                if (header.return_number) {
                                    returnItemQtyMap.set(`${header.return_number.toString().trim().toLowerCase()}:${pId}`, qty);
                                }
                                if (header.invoice_no) {
                                    returnItemQtyMap.set(`${header.invoice_no.toString().trim().toLowerCase()}:${pId}`, qty);
                                }
                                if (header.order_id) {
                                    returnItemQtyMap.set(`${header.order_id.toString().trim().toLowerCase()}:${pId}`, qty);
                                }
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.warn("[fulfilment-and-deliveries GET] Error fetching sales_return links:", err);
        }

                // 11. Transform each Consolidator into a ConsolidatedDeliveryRecord with strict Gatekeeping
                const records = allConsolidators
                    .map((con) => {
                        const conId = Number(con.id);
                        const branchId = Number(con.branch_id || 1);
                        const branchName = branchMap.get(branchId)?.branch_name || `Branch #${branchId}`;

                        // Gather all order IDs associated with this consolidator
                        const conSodList = conSodMap.get(conId) || [];
                        const conOrderIdsFromDetails = conSodList
                            .map((sodId) => sodDetailMap.get(sodId)?.order_id)
                            .filter((id): id is number => id !== undefined && id > 0);

                        const conInvList = conInvMap.get(conId) || [];
                        const conOrderIdsFromInvoices = conInvList.map((invId) => {
                            const inv = invoiceMapById.get(invId);
                            return inv ? Number(inv.order_id) : invId;
                        });

                        const distinctOrderIds = [...new Set([...conOrderIdsFromDetails, ...conOrderIdsFromInvoices])];

                        if (distinctOrderIds.length === 0) return null;

                        // ─── GATEKEEPING RULE 3: Invoicing Status Check ───────────────────
                        // A consolidation batch MUST NOT contain any Sales Order that is still pending invoicing ("For Invoicing" or uninvoiced)
                        let hasUninvoicedOrder = false;
                        for (const orderId of distinctOrderIds) {
                            const so = salesOrderMap.get(orderId);
                            const sidInvId =
                                orderIdToInvoiceIdMap.get(String(orderId)) ||
                                (so?.order_id ? orderIdToInvoiceIdMap.get(String(so.order_id)) : null) ||
                                (so?.order_no ? orderIdToInvoiceIdMap.get(so.order_no.trim().toLowerCase()) : null) ||
                                null;

                            const inv =
                                (sidInvId ? invoiceMapById.get(sidInvId) : null) ||
                                (so?.order_id ? invoiceMapByOrderKey.get(String(so.order_id).toLowerCase()) : null) ||
                                (so?.order_no ? invoiceMapByOrderKey.get(so.order_no.trim().toLowerCase()) : null) ||
                                (so?.order_no ? invoiceMapByInvoiceNo.get(so.order_no.trim().toLowerCase()) : null) ||
                                invoiceMapByOrderKey.get(String(orderId).toLowerCase()) ||
                                invoiceMapById.get(orderId) ||
                                null;

                            const isInvoicedStatus =
                                so &&
                                so.order_status !== "For Invoicing" &&
                                so.order_status !== "Draft" &&
                                so.order_status !== "Pending" &&
                                so.order_status !== "For Approval" &&
                                so.order_status !== "For Picking" &&
                                so.order_status !== "For Production";

                            const hasValidInvoice = inv && inv.invoice_id;

                            if (!isInvoicedStatus && !hasValidInvoice) {
                                hasUninvoicedOrder = true;
                                break;
                            }
                        }

                        if (hasUninvoicedOrder) {
                            return null; // Suppress consolidation batch if any SO is still pending invoicing
                        }

                        // Build child orders list
                        const childOrders = distinctOrderIds
                            .map((orderId) => {
                                const so = salesOrderMap.get(orderId);
                                const sidInvId =
                                    orderIdToInvoiceIdMap.get(String(orderId)) ||
                                    (so?.order_id ? orderIdToInvoiceIdMap.get(String(so.order_id)) : null) ||
                                    (so?.order_no ? orderIdToInvoiceIdMap.get(so.order_no.trim().toLowerCase()) : null) ||
                                    null;

                                const inv =
                                    (sidInvId ? invoiceMapById.get(sidInvId) : null) ||
                                    (so?.order_id ? invoiceMapByOrderKey.get(String(so.order_id).toLowerCase()) : null) ||
                                    (so?.order_no ? invoiceMapByOrderKey.get(so.order_no.trim().toLowerCase()) : null) ||
                                    (so?.order_no ? invoiceMapByInvoiceNo.get(so.order_no.trim().toLowerCase()) : null) ||
                                    invoiceMapByOrderKey.get(String(orderId).toLowerCase()) ||
                                    invoiceMapById.get(orderId) ||
                                    null;

                                if (!so && !inv) return null;

                                const invoiceNo = inv?.invoice_no || so?.invoice_no || "---";
                                const invoiceId = inv?.invoice_id || so?.invoice_id || null;
                                const invoiceDate = inv?.invoice_date || null;

                                const linkedSr =
                                    (invoiceNo && invoiceNo !== "---" ? salesReturnMap.get(invoiceNo.toLowerCase()) : null) ||
                                    (so?.order_no ? salesReturnMap.get(so.order_no.toLowerCase()) : null) ||
                                    salesReturnMap.get(String(orderId)) ||
                                    (inv?.invoice_id ? salesReturnMap.get(String(inv.invoice_id)) : null) ||
                                    (inv?.invoice_id ? salesReturnMap.get(`inv_id:${inv.invoice_id}`) : null) ||
                                    (so?.order_id ? salesReturnMap.get(String(so.order_id)) : null) ||
                                    null;

                                const isCleared =
                                    so?.order_status === "Delivered" ||
                                    so?.order_status === "Partially Delivered" ||
                                    so?.order_status === "Not Fulfilled" ||
                                    so?.isDelivered === 1 ||
                                    inv?.isDelivered === 1 ||
                                    inv?.isDelivered === true;

                                // Build line items for this order in this consolidator
                                const relevantSodDetails = salesOrderDetails.filter(
                                    (sod) => Number(sod.order_id) === orderId
                                );

                                const items = relevantSodDetails.map((sod) => {
                                    const prod = productMap.get(Number(sod.product_id));
                                    const prodName = prod?.description || prod?.product_name || `Product #${sod.product_id}`;
                                    const prodCode = prod?.product_code || `SKU-${sod.product_id}`;
                                    const prodDesc = prod?.short_description || (prod?.description && prod?.description !== prod?.product_name ? prod?.description : "") || "";
                                    const uom = "";

                                    const ordered = Number(sod.ordered_quantity || 0);

                                    // Check if quantity returned from linked Sales Return
                                    const srReturned = linkedSr
                                        ? returnItemQtyMap.get(`${linkedSr.return_number.toLowerCase()}:${sod.product_id}`) ||
                                          returnItemQtyMap.get(`${linkedSr.return_number}:${sod.product_id}`) ||
                                          returnItemQtyMap.get(`${String(linkedSr.return_id)}:${sod.product_id}`) ||
                                          returnItemQtyMap.get(`${invoiceNo.toLowerCase()}:${sod.product_id}`) ||
                                          returnItemQtyMap.get(`${String(orderId)}:${sod.product_id}`) ||
                                          0
                                        : returnItemQtyMap.get(`${invoiceNo.toLowerCase()}:${sod.product_id}`) ||
                                          returnItemQtyMap.get(`${String(orderId)}:${sod.product_id}`) ||
                                          0;

                                    let received = ordered;
                                    let returned = 0;

                                    if (srReturned > 0) {
                                        returned = Math.min(ordered, srReturned);
                                        received = Math.max(0, ordered - returned);
                                    } else if (isCleared) {
                                        received = so?.order_status === "Not Fulfilled" ? 0 : ordered;
                                        returned = so?.order_status === "Not Fulfilled" ? ordered : 0;
                                    } else {
                                        received = ordered;
                                        returned = 0;
                                    }

                                    let lineStatus: "Fulfilled" | "Fulfilled with Returns" | "Unfulfilled / Returns" = "Fulfilled";
                                    if (received === 0 && returned === ordered) {
                                        lineStatus = "Unfulfilled / Returns";
                                    } else if (returned > 0) {
                                        lineStatus = "Fulfilled with Returns";
                                    } else {
                                        lineStatus = "Fulfilled";
                                    }

                                    return {
                                        detail_id: Number(sod.detail_id),
                                        product_id: Number(sod.product_id),
                                        product_code: prodCode,
                                        product_name: prodName,
                                        product_description: prodDesc,
                                        uom: uom,
                                        ordered_quantity: ordered,
                                        received_quantity: received,
                                        returned_quantity: returned,
                                        unit_price: Number(sod.unit_price || 0),
                                        has_concern: false,
                                        concern_notes: "",
                                        line_status: lineStatus,
                                    };
                                });

                                const hasAnyReturns = items.some((it) => it.returned_quantity > 0) || Boolean(linkedSr);
                                const hasAnyConcerns = items.some((it) => it.has_concern || (it.concern_notes && it.concern_notes.trim().length > 0));
                                const isAllUnfulfilled = items.length > 0 && items.every((it) => it.received_quantity === 0 && it.returned_quantity === it.ordered_quantity);

                                let orderFulfillmentStatus:
                                    | "Pending"
                                    | "Fulfilled"
                                    | "Fulfilled with Concerns"
                                    | "Fulfilled with Returns"
                                    | "Unfulfilled / Returns" = "Pending";

                                if (isAllUnfulfilled || so?.order_status === "Not Fulfilled") {
                                    orderFulfillmentStatus = "Unfulfilled / Returns";
                                } else if (hasAnyReturns || linkedSr || so?.order_status === "Partially Delivered") {
                                    orderFulfillmentStatus = "Fulfilled with Returns";
                                } else if (so?.order_status === "Delivered" || isCleared) {
                                    orderFulfillmentStatus = hasAnyConcerns ? "Fulfilled with Concerns" : "Fulfilled";
                                } else {
                                    orderFulfillmentStatus = "Pending";
                                }

                                const custCode = so?.customer_code || inv?.customer_code || "";
                                const custName = customerCodeMap.get(custCode) || custCode || "Direct Customer";

                                const rawSm = so?.salesman_id || inv?.salesman_id;
                                const salesmanId =
                                    typeof rawSm === "object" && rawSm !== null
                                        ? Number((rawSm as Record<string, unknown>).id || (rawSm as Record<string, unknown>).salesman_id)
                                        : Number(rawSm) || null;
                                const salesmanObj = salesmanId ? salesmanMap.get(salesmanId) : null;
                                const salesmanCode =
                                    salesmanObj?.salesman_code ||
                                    (typeof so?.salesman_code === "string" ? so.salesman_code : null) ||
                                    (typeof inv?.salesman_code === "string" ? inv.salesman_code : null) ||
                                    null;
                                const salesmanName =
                                    salesmanObj?.salesman_name ||
                                    (typeof so?.salesman_name === "string" ? so.salesman_name : null) ||
                                    (typeof inv?.salesman_name === "string" ? inv.salesman_name : null) ||
                                    null;

                                return {
                                    order_id: orderId,
                                    order_no: so?.order_no || `SO-${orderId}`,
                                    order_status: so?.order_status || con.status || "Dispatched",
                                    invoice_id: invoiceId,
                                    invoice_no: invoiceNo,
                                    invoice_date: invoiceDate,
                                    customer_code: custCode,
                                    customer_name: custName,
                                    salesman_id: salesmanId,
                                    salesman_code: salesmanCode,
                                    salesman_name: salesmanName,
                                    amount: Number(so?.net_amount || so?.total_amount || inv?.net_amount || inv?.total_amount || 0),
                                    remarks: so?.remarks || inv?.remarks || "",
                                    fulfillment_status: orderFulfillmentStatus,
                                    is_cleared: isCleared,
                                    linked_sales_return: linkedSr,
                                    items,
                                };
                            })
                            .filter((o): o is NonNullable<typeof o> => o !== null);

                        if (childOrders.length === 0) return null;

                        console.log("[fulfilment-and-deliveries API] 📦 Manifest Child Orders Resolved:", {
                            consolidator_id: conId,
                            consolidator_no: con.consolidator_no,
                            childOrders: childOrders.map((co) => ({
                                order_id: co.order_id,
                                order_no: co.order_no,
                                invoice_id: co.invoice_id,
                                invoice_no: co.invoice_no,
                                invoice_date: co.invoice_date,
                                customer_name: co.customer_name,
                                salesman_name: co.salesman_name,
                                salesman_code: co.salesman_code,
                                fulfillment_status: co.fulfillment_status,
                            })),
                        });

                        // ─── GATEKEEPING RULE 4: Quantity Variance Check ─────────────────
                        // Sum total picked quantity in consolidator_details vs total invoiced allocation across member Sales Orders
                        const conDetailsForThisCon = consolidatorDetails.filter(
                            (cd) => Number(cd.consolidator_id) === conId
                        );

                        const totalPickedQty = conDetailsForThisCon.reduce((sum, cd) => {
                            const picked = Number(cd.picked_quantity || 0);
                            const applied = Number(cd.applied_quantity || 0);
                            const ordered = Number(cd.ordered_quantity || 0);
                            return sum + (picked > 0 ? picked : applied > 0 ? applied : ordered);
                        }, 0);

                        const totalInvoicedAllocationQty = childOrders.reduce(
                            (sum, o) => sum + o.items.reduce((itemSum, item) => itemSum + item.ordered_quantity, 0),
                            0
                        );

                        // If picked quantity in consolidator does not match invoiced allocation (unassigned variance), suppress batch
                        if (totalPickedQty > 0 && totalInvoicedAllocationQty > 0 && totalPickedQty !== totalInvoicedAllocationQty) {
                            return null;
                        }

                        // Calculate consolidator level aggregations
                        const totalOrdersCount = childOrders.length;
                        const totalItemsCount = childOrders.reduce((sum, o) => sum + o.items.length, 0);
                        const totalAmount = childOrders.reduce((sum, o) => sum + o.amount, 0);

                        const isAllDelivered = childOrders.length > 0 && childOrders.every((o) => o.is_cleared);
                        const hasAnyReturns = childOrders.some((o) => o.fulfillment_status === "Fulfilled with Returns" || Boolean(o.linked_sales_return));
                        const hasAnyConcerns = childOrders.some((o) => o.fulfillment_status === "Fulfilled with Concerns");
                        const isAllUnfulfilled = childOrders.length > 0 && childOrders.every((o) => o.fulfillment_status === "Unfulfilled / Returns");

                        let conFulfillmentStatus: "Pending" | "Fulfilled" | "Fulfilled with Concerns" | "Fulfilled with Returns" | "Unfulfilled / Returns" = "Pending";
                        if (isAllUnfulfilled) {
                            conFulfillmentStatus = "Unfulfilled / Returns";
                        } else if (hasAnyReturns) {
                            conFulfillmentStatus = "Fulfilled with Returns";
                        } else if (con.status === "Delivered" || isAllDelivered) {
                            if (hasAnyConcerns) {
                                conFulfillmentStatus = "Fulfilled with Concerns";
                            } else {
                                conFulfillmentStatus = "Fulfilled";
                            }
                        } else {
                            conFulfillmentStatus = "Pending";
                        }

                        return {
                            consolidator_id: conId,
                            consolidator_no: con.consolidator_no || `CON-${conId}`,
                            status: con.status || "Dispatched",
                            branch_id: branchId,
                            branch_name: branchName,
                            dispatch_date: con.created_at || new Date().toISOString(),
                            total_orders: totalOrdersCount,
                            total_items: totalItemsCount,
                            total_amount: totalAmount,
                            fulfillment_status: conFulfillmentStatus,
                            is_cleared: con.status === "Delivered" || isAllDelivered,
                            orders: childOrders,
                        };
                    })
                    .filter((r): r is NonNullable<typeof r> => r !== null && (r.total_orders > 0 || r.status === "Dispatched" || r.status === "Delivered" || r.status === "Audited"));

        // 12. Compute Overall Metrics across entire consolidations dataset
        const totalDispatched = records.length;
        const pendingClearance = records.filter((r) => r.fulfillment_status === "Pending").length;
        const fulfilledCount = records.filter((r) => r.fulfillment_status === "Fulfilled").length;
        const concernsAndReturnsCount = records.filter(
            (r) =>
                r.fulfillment_status === "Fulfilled with Concerns" ||
                r.fulfillment_status === "Fulfilled with Returns" ||
                r.fulfillment_status === "Unfulfilled / Returns"
        ).length;

        // 13. Filter records by search and status
        const filtered = records.filter((r) => {
            const matchesSearch =
                !search ||
                r.consolidator_no.toLowerCase().includes(search) ||
                r.branch_name.toLowerCase().includes(search) ||
                r.orders.some(
                    (o) =>
                        o.order_no.toLowerCase().includes(search) ||
                        o.invoice_no.toLowerCase().includes(search) ||
                        o.customer_name.toLowerCase().includes(search)
                );

            const matchesStatus =
                statusFilter === "All" ||
                (statusFilter === "Pending" && r.fulfillment_status === "Pending") ||
                (statusFilter === "Fulfilled" && r.fulfillment_status === "Fulfilled") ||
                (statusFilter === "Fulfilled with Concerns" && r.fulfillment_status === "Fulfilled with Concerns") ||
                (statusFilter === "Fulfilled with Returns" && r.fulfillment_status === "Fulfilled with Returns") ||
                (statusFilter === "Unfulfilled / Returns" && r.fulfillment_status === "Unfulfilled / Returns") ||
                (statusFilter === "Unfulfilled" && r.fulfillment_status === "Unfulfilled / Returns");

            return matchesSearch && matchesStatus;
        });

        // 14. Paginate
        const paginatedRecords = filtered.slice(page * size, (page + 1) * size);
        const totalPages = Math.ceil(filtered.length / size) || 1;

        return NextResponse.json({
            content: paginatedRecords,
            totalPages,
            totalElements: filtered.length,
            page,
            size,
            metrics: {
                total_dispatched: totalDispatched,
                pending_clearance: pendingClearance,
                fulfilled_count: fulfilledCount,
                concerns_and_returns_count: concernsAndReturnsCount,
            },
            branches,
        });
    } catch (error) {
        console.error("[fulfilment-and-deliveries GET] Error:", error);
        return NextResponse.json(
            { message: error instanceof Error ? error.message : "Failed to load delivery clearance data." },
            { status: 500 }
        );
    }
}

// ─── POST: Confirm & Post Delivery Clearance for Consolidation ─────────────────
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { consolidator_id, orders, is_draft } = body;

        if (!consolidator_id || !Array.isArray(orders) || orders.length === 0) {
            return NextResponse.json(
                { message: "Invalid payload: consolidator_id and orders array are required." },
                { status: 400 }
            );
        }

        const userId = await getUserIdFromToken();
        const phNow = getPhTimestamp();

        // ─── DRAFT PATHWAY (Save Progress) ──────────────────────────────────────────
        if (is_draft) {
            for (const orderData of orders) {
                const { order_id, invoice_id, clearance_remarks: orderRemarks } = orderData;
                const targetOrderId = Number(order_id || invoice_id);

                if (targetOrderId && typeof orderRemarks === "string") {
                    await fetch(`${DIRECTUS_URL}/items/sales_order/${targetOrderId}`, {
                        method: "PATCH",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            remarks: orderRemarks.trim(),
                            modified_by: userId,
                            modified_date: phNow,
                        }),
                    }).catch((err) => console.warn(`[POST Draft] Failed to update sales_order #${targetOrderId}:`, err));
                }

                if (invoice_id && typeof orderRemarks === "string") {
                    await fetch(`${DIRECTUS_URL}/items/sales_invoice/${invoice_id}`, {
                        method: "PATCH",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            remarks: orderRemarks.trim(),
                            modified_by: userId,
                            modified_date: phNow,
                        }),
                    }).catch((err) => console.warn(`[POST Draft] Failed to update sales_invoice #${invoice_id}:`, err));
                }

                // If explicit linked_return_id is passed in draft, link sales_return
                if (orderData.linked_return_id) {
                    await fetch(`${DIRECTUS_URL}/items/sales_return/${orderData.linked_return_id}`, {
                        method: "PATCH",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            order_id: targetOrderId,
                            modified_by: userId,
                            modified_date: phNow,
                        }),
                    }).catch((err) => console.warn(`[POST Draft] Failed to link sales_return #${orderData.linked_return_id}:`, err));

                    if (invoice_id) {
                        try {
                            const checkJunc = await fetch(
                                `${DIRECTUS_URL}/items/sales_invoice_sales_return?filter[invoice_no][_eq]=${invoice_id}&filter[return_no][_eq]=${orderData.linked_return_id}&limit=1`,
                                { headers: directusHeaders, cache: "no-store" }
                            );
                            if (checkJunc.ok) {
                                const jData = (await checkJunc.json()).data;
                                if (!jData || jData.length === 0) {
                                    await fetch(`${DIRECTUS_URL}/items/sales_invoice_sales_return`, {
                                        method: "POST",
                                        headers: directusHeaders,
                                        body: JSON.stringify({
                                            invoice_no: invoice_id,
                                            return_no: orderData.linked_return_id,
                                        }),
                                    }).catch(() => null);
                                }
                            }
                        } catch (e) {
                            console.warn("[POST Draft] Junction link error:", e);
                        }
                    }
                }
            }

            return NextResponse.json({
                success: true,
                is_draft: true,
                message: "Draft progress saved successfully. You can return to complete the clearance later.",
            });
        }

        // ─── FINAL COMMIT PATHWAY (Confirm Clearance & Post) ───────────────────────
        // Process each order in the consolidation
        for (const orderData of orders) {
            const { order_id, invoice_id, items, clearance_remarks: orderRemarks, linked_return_id } = orderData;
            if (!items || !Array.isArray(items)) continue;

            const targetOrderId = Number(order_id || invoice_id);

            // If explicit linked_return_id is passed, link sales_return
            if (linked_return_id) {
                await fetch(`${DIRECTUS_URL}/items/sales_return/${linked_return_id}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        order_id: targetOrderId,
                        modified_by: userId,
                        modified_date: phNow,
                    }),
                }).catch((err) => console.warn(`[POST] Failed to link sales_return #${linked_return_id}:`, err));

                if (invoice_id) {
                    try {
                        const checkJunc = await fetch(
                            `${DIRECTUS_URL}/items/sales_invoice_sales_return?filter[invoice_no][_eq]=${invoice_id}&filter[return_no][_eq]=${linked_return_id}&limit=1`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (checkJunc.ok) {
                            const jData = (await checkJunc.json()).data;
                            if (!jData || jData.length === 0) {
                                await fetch(`${DIRECTUS_URL}/items/sales_invoice_sales_return`, {
                                    method: "POST",
                                    headers: directusHeaders,
                                    body: JSON.stringify({
                                        invoice_no: invoice_id,
                                        return_no: linked_return_id,
                                    }),
                                }).catch(() => null);
                            }
                        }
                    } catch (e) {
                        console.warn("[POST] Junction link error:", e);
                    }
                }
            }

            // Fetch DB details from sales_order_details
            let dbDetails: DirectusSalesOrderDetail[] = [];
            if (targetOrderId) {
                const sodRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${targetOrderId}&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (sodRes.ok) {
                    dbDetails = (await sodRes.json()).data || [];
                }
            }

            const dbDetailMap = new Map<number, DirectusSalesOrderDetail>(
                dbDetails.map((d) => [Number(d.detail_id), d])
            );

            let totalReceived = 0;
            let totalReturned = 0;
            let totalOrdered = 0;

            for (const item of items) {
                const detailId = Number(item.detail_id);
                const dbItem = dbDetailMap.get(detailId);
                const rec = Number(item.received_quantity);
                const ret = Number(item.returned_quantity);
                const dbOrdered = dbItem ? Number(dbItem.ordered_quantity || 0) : rec + ret;

                if (isNaN(rec) || isNaN(ret) || rec < 0 || ret < 0) {
                    return NextResponse.json(
                        { message: `Quantities for line #${detailId} must be non-negative numbers.` },
                        { status: 422 }
                    );
                }

                if (rec + ret !== dbOrdered) {
                    return NextResponse.json(
                        {
                            message: `Quantity invariant violation on line #${detailId}: Received (${rec}) + Returned (${ret}) must equal DB ordered quantity (${dbOrdered}).`,
                        },
                        { status: 422 }
                    );
                }

                totalReceived += rec;
                totalReturned += ret;
                totalOrdered += dbOrdered;
            }

            // Derive order status
            const hasOrderConcerns = items.some(
                (it) => it.has_concern || (it.concern_notes && String(it.concern_notes).trim().length > 0)
            );

            let derivedStatus: "Unfulfilled / Returns" | "Fulfilled with Returns" | "Fulfilled with Concerns" | "Fulfilled";
            let targetSoStatus: "Delivered" | "Partially Delivered" | "Not Fulfilled";

            if (totalReceived === 0 && totalReturned === totalOrdered) {
                derivedStatus = "Unfulfilled / Returns";
                targetSoStatus = "Not Fulfilled";
            } else if (totalReceived > 0 && totalReturned > 0) {
                derivedStatus = "Fulfilled with Returns";
                targetSoStatus = "Partially Delivered";
            } else if (totalReceived === totalOrdered && totalReturned === 0 && hasOrderConcerns) {
                derivedStatus = "Fulfilled with Concerns";
                targetSoStatus = "Delivered";
            } else {
                derivedStatus = "Fulfilled";
                targetSoStatus = "Delivered";
            }

            // Verification Guard: Check for linked Sales Return if status is 'Fulfilled with Returns'
            // Unfulfilled / Returns (failed delivery / undelivered return to hub) does NOT require a Sales Return
            if (derivedStatus === "Fulfilled with Returns") {
                let invoiceNo = "";
                let orderNo = "";
                if (invoice_id) {
                    const invRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_invoice/${invoice_id}?fields=invoice_no,order_id`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (invRes.ok) {
                        const invData = (await invRes.json()).data;
                        invoiceNo = invData?.invoice_no ? String(invData.invoice_no).trim() : "";
                        orderNo = invData?.order_id ? String(invData.order_id).trim() : "";
                    }
                }
                if (!orderNo && targetOrderId) {
                    const soRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_order/${targetOrderId}?fields=order_no`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (soRes.ok) {
                        const soData = (await soRes.json()).data;
                        orderNo = soData?.order_no ? String(soData.order_no).trim() : "";
                    }
                }

                let hasLinkedReturn = false;

                // 1. Check by invoice_no
                if (invoiceNo) {
                    try {
                        const checkReturnRes = await fetch(
                            `${DIRECTUS_URL}/items/sales_return?filter[invoice_no][_eq]=${encodeURIComponent(invoiceNo)}&limit=1&fields=return_id,return_number,status,isReceived`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (checkReturnRes.ok) {
                            const returnData = (await checkReturnRes.json()).data;
                            if (returnData && returnData.length > 0) {
                                const srObj = returnData[0];
                                const isReceived =
                                    srObj.status === "Received" ||
                                    srObj.status === "Approved" ||
                                    srObj.isReceived === 1 ||
                                    srObj.isReceived === true ||
                                    srObj.isReceived === "1";
                                if (isReceived) {
                                    hasLinkedReturn = true;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("[fulfilment-and-deliveries POST] Error checking sales_return by invoice_no:", e);
                    }
                }

                // 2. Check by order_id or order_no
                if (!hasLinkedReturn && (orderNo || targetOrderId)) {
                    try {
                        const candidateOrderFilter = orderNo || String(targetOrderId);
                        const checkReturnRes = await fetch(
                            `${DIRECTUS_URL}/items/sales_return?filter[order_id][_eq]=${encodeURIComponent(candidateOrderFilter)}&limit=1&fields=return_id,return_number,status,isReceived`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (checkReturnRes.ok) {
                            const returnData = (await checkReturnRes.json()).data;
                            if (returnData && returnData.length > 0) {
                                const srObj = returnData[0];
                                const isReceived =
                                    srObj.status === "Received" ||
                                    srObj.status === "Approved" ||
                                    srObj.isReceived === 1 ||
                                    srObj.isReceived === true ||
                                    srObj.isReceived === "1";
                                if (isReceived) {
                                    hasLinkedReturn = true;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("[fulfilment-and-deliveries POST] Error checking sales_return by order_id:", e);
                    }
                }

                // 3. Check junction sales_invoice_sales_return
                if (!hasLinkedReturn && invoice_id) {
                    try {
                        const checkJunctionRes = await fetch(
                            `${DIRECTUS_URL}/items/sales_invoice_sales_return?filter[invoice_no][_eq]=${invoice_id}&limit=1&fields=id`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (checkJunctionRes.ok) {
                            const junctionData = (await checkJunctionRes.json()).data;
                            if (junctionData && junctionData.length > 0) {
                                hasLinkedReturn = true;
                            }
                        }
                    } catch (e) {
                        console.warn("[fulfilment-and-deliveries POST] Error checking junction:", e);
                    }
                }

                if (!hasLinkedReturn) {
                    return NextResponse.json(
                        {
                            message: `Delivery clearance for "${derivedStatus}" requires a registered and received Sales Return for invoice/order "${invoiceNo || orderNo || targetOrderId}". Please ensure the Sales Return is received before confirming clearance.`,
                            requiresSalesReturn: true,
                            invoice_no: invoiceNo || orderNo,
                        },
                        { status: 422 }
                    );
                }
            }

            const isOrderDelivered = targetSoStatus === "Delivered" || targetSoStatus === "Partially Delivered";
            const isOrderUnfulfilled = targetSoStatus === "Not Fulfilled";

            // Update sales order
            if (targetOrderId) {
                const soPayload: Record<string, unknown> = {
                    order_status: targetSoStatus,
                    isDelivered: isOrderDelivered ? 1 : 0,
                    modified_by: userId,
                    modified_date: phNow,
                    posted_by: userId,
                    posted_date: phNow,
                };
                if (isOrderDelivered) {
                    soPayload.delivered_at = phNow;
                } else if (isOrderUnfulfilled) {
                    soPayload.not_fulfilled_at = phNow;
                }
                if (typeof orderRemarks === "string") {
                    soPayload.remarks = orderRemarks.trim();
                }

                await fetch(`${DIRECTUS_URL}/items/sales_order/${targetOrderId}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify(soPayload),
                }).catch((err) => console.warn(`[POST] Failed to update sales_order #${targetOrderId}:`, err));
            }

            // Update sales invoice if present
            if (invoice_id) {
                const invoicePayload: Record<string, unknown> = {
                    isDelivered: isOrderDelivered ? 1 : 0,
                    isDispatched: isOrderUnfulfilled ? 0 : 1,
                    posted_by: userId,
                    posted_date: phNow,
                    modified_by: userId,
                    modified_date: phNow,
                    delivered_at: isOrderDelivered ? phNow : null,
                };

                if (typeof orderRemarks === "string") {
                    invoicePayload.remarks = orderRemarks.trim();
                }

                if (isOrderUnfulfilled) {
                    invoicePayload.transaction_status = "Not Delivered";
                } else if (derivedStatus === "Fulfilled with Returns") {
                    invoicePayload.transaction_status = "Completed with Returns";
                }

                await fetch(`${DIRECTUS_URL}/items/sales_invoice/${invoice_id}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify(invoicePayload),
                }).catch((err) => console.warn(`[POST] Failed to update sales_invoice #${invoice_id}:`, err));
            }

            // Log discrepancy in unfulfilled_sales_transaction if returns exist
            if (totalReturned > 0 || derivedStatus === "Unfulfilled / Returns") {
                try {
                    const unfulfilledRes = await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction`, {
                        method: "POST",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            sales_invoice_id: Number(invoice_id || targetOrderId),
                            nte: typeof orderRemarks === "string" ? orderRemarks.trim() : "",
                            isCleared: 1,
                            checked_by: userId,
                            date_acknowledged: phNow,
                            date_created: phNow,
                            variance_amount: totalReturned,
                        }),
                    });
                    if (unfulfilledRes.ok) {
                        const unfulfilledHeader = (await unfulfilledRes.json()).data;
                        const unfulfilledId = unfulfilledHeader?.id;
                        if (unfulfilledId) {
                            for (const item of items) {
                                if (item.returned_quantity > 0 || item.has_concern) {
                                    await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction_details`, {
                                        method: "POST",
                                        headers: directusHeaders,
                                        body: JSON.stringify({
                                            unfulfilled_sales_transaction_id: unfulfilledId,
                                            sales_invoice_detail_id: item.detail_id,
                                            missing_quantity: item.returned_quantity,
                                            invoice_quantity: item.received_quantity + item.returned_quantity,
                                            total_amount: 0,
                                        }),
                                    }).catch(() => null);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn("[POST] Error logging unfulfilled transaction:", e);
                }
            }
        }

        // Update consolidator status to Delivered
        await fetch(`${DIRECTUS_URL}/items/consolidator/${consolidator_id}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({
                status: "Delivered",
                updated_at: phNow,
            }),
        }).catch((err) => console.warn(`[POST] Failed to update consolidator #${consolidator_id}:`, err));

        return NextResponse.json({
            success: true,
            message: "Consolidated delivery clearance committed successfully.",
        });
    } catch (error) {
        console.error("[fulfilment-and-deliveries POST] Error:", error);
        return NextResponse.json(
            { message: error instanceof Error ? error.message : "Failed to commit delivery clearance." },
            { status: 500 }
        );
    }
}