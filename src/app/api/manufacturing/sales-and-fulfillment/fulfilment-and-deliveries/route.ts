// src/app/api/manufacturing/sales-and-fulfillment/fulfilment-and-deliveries/route.ts

import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../../invoice-consolidation/_auth";
import { getPhTimestamp } from "../../invoice-consolidation/_time-utils";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface LineItemReservation {
    reservation_id: number;
    sales_order_detail_id: number;
    inventory_lot_id: number;
    product_id?: number;
    lot_id?: number;
    lot_name?: string;
    lot_number?: string;
    batch_no?: string;
    reserved_quantity: number;
    picked_quantity: number;
    returned_quantity?: number;
    status: string;
    created_at?: string;
}

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
        consolidatorQs.set("filter[status][_in]", "Dispatched,Completed,Delivered,Approved,Audited");

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
        const rawSidList: Array<{ detail_id: number; order_id: string | number; invoice_no: number | string; product_id?: number; quantity?: number }> = [];

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
                    `${DIRECTUS_URL}/items/sales_invoice_details?filter[order_id][_in]=${chunk.join(",")}&fields=detail_id,order_id,invoice_no,product_id,quantity&limit=-1`,
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
                    `${DIRECTUS_URL}/items/sales_invoice_details?filter[order_id][_in]=${chunk.map((x) => encodeURIComponent(x)).join(",")}&fields=detail_id,order_id,invoice_no,product_id,quantity&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                )
                    .then((res) => (res.ok ? res.json() : { data: [] }))
                    .then((json) => {
                        if (json.data && Array.isArray(json.data)) {
                            rawSidList.push(...json.data);
                        }
                    })
                    .catch((err) => console.warn("[fulfilment-and-deliveries API] Error fetching sales_invoice_details by string order_id:", err))
            );
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
        const invoicesByOrderKey = new Map<string, DirectusInvoice[]>();
        const invoiceMapByInvoiceNo = new Map<string, DirectusInvoice>();

        const addInvoiceToOrder = (key: string, inv: DirectusInvoice) => {
            const k = key.toLowerCase().trim();
            if (!invoicesByOrderKey.has(k)) {
                invoicesByOrderKey.set(k, []);
            }
            const list = invoicesByOrderKey.get(k)!;
            const targetId = Number(inv.invoice_id || inv.id);
            if (!list.some((existing) => Number(existing.invoice_id || existing.id) === targetId)) {
                list.push(inv);
            }
        };

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
                addInvoiceToOrder(ordIdStr, rawInv);
            }
            if (ordIdNum) {
                invoiceMapByOrderKey.set(String(ordIdNum), rawInv);
                addInvoiceToOrder(String(ordIdNum), rawInv);
            }
            if (ordNoFromRel) {
                invoiceMapByOrderKey.set(ordNoFromRel, rawInv);
                addInvoiceToOrder(ordNoFromRel, rawInv);
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
            if (targetInv) {
                addInvoiceToOrder(orderKey, targetInv);
                if (!invoiceMapByOrderKey.has(orderKey)) {
                    invoiceMapByOrderKey.set(orderKey, targetInv);
                }
            }
        }

        // 7d. Fetch sales_invoice_details by invoice_no for all discovered invoices
        const knownInvIds = Array.from(invoiceMapById.keys());
        if (knownInvIds.length > 0) {
            for (let i = 0; i < knownInvIds.length; i += chunkSize) {
                const chunk = knownInvIds.slice(i, i + chunkSize);
                try {
                    const sidByInvRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${chunk.join(",")}&fields=detail_id,order_id,invoice_no,product_id,quantity&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (sidByInvRes.ok) {
                        const sData = (await sidByInvRes.json()).data || [];
                        rawSidList.push(...sData);
                    }
                } catch (sidErr) {
                    console.warn("[fulfilment-and-deliveries API] Error fetching sales_invoice_details by invoice_no:", sidErr);
                }
            }
        }

        // 7e. Fetch sales_invoice_batches for batch/lot traceability
        interface DirectusInvoiceBatch {
            id: number;
            invoice_id: number;
            invoice_detail_id: number;
            product_id: number;
            inventory_lot_id: number;
            lot_id?: number | null;
            batch_no?: string | null;
            quantity: number | string;
        }
        const invoiceBatches: DirectusInvoiceBatch[] = [];
        if (knownInvIds.length > 0) {
            for (let i = 0; i < knownInvIds.length; i += chunkSize) {
                const chunk = knownInvIds.slice(i, i + chunkSize);
                try {
                    const bRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_batches?filter[invoice_id][_in]=${chunk.join(",")}&fields=id,invoice_id,invoice_detail_id,product_id,inventory_lot_id,lot_id,batch_no,quantity&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (bRes.ok) {
                        const bData = (await bRes.json()).data || [];
                        invoiceBatches.push(...bData);
                    }
                } catch (bErr) {
                    console.warn("[fulfilment-and-deliveries API] Error fetching sales_invoice_batches:", bErr);
                }
            }
        }

        // Index invoiced quantities by (invoice_id:product_id) and (order_id:product_id)
        // Deduplicate rawSidList by detail_id to prevent double-counting across order_id and invoice_no queries
        const uniqueSidMap = new Map<number | string, (typeof rawSidList)[0]>();
        for (const sid of rawSidList) {
            const sidKey = sid.detail_id ? Number(sid.detail_id) : `${sid.order_id}:${sid.invoice_no}:${sid.product_id}`;
            if (!uniqueSidMap.has(sidKey)) {
                uniqueSidMap.set(sidKey, sid);
            }
        }

        const invoiceProductQtyMap = new Map<string, number>();
        for (const sid of uniqueSidMap.values()) {
            const qty = Number(sid.quantity || 0);
            const pId = Number(sid.product_id || 0);
            if (!pId) continue;
            if (sid.invoice_no) {
                const key = `${sid.invoice_no}:${pId}`;
                invoiceProductQtyMap.set(key, (invoiceProductQtyMap.get(key) || 0) + qty);
            }
            if (sid.order_id) {
                const ordRaw = String(sid.order_id).trim();
                const ordLower = ordRaw.toLowerCase();
                invoiceProductQtyMap.set(`${ordLower}:${pId}`, (invoiceProductQtyMap.get(`${ordLower}:${pId}`) || 0) + qty);
                const pNum = Number(ordRaw);
                if (!isNaN(pNum)) {
                    invoiceProductQtyMap.set(`${pNum}:${pId}`, (invoiceProductQtyMap.get(`${pNum}:${pId}`) || 0) + qty);
                }
            }
        }

        // Bridge string order_no and numeric order_id across invoiceProductQtyMap
        for (const so of salesOrderMap.values()) {
            const numId = Number(so.order_id);
            const strNo = String(so.order_no || "").toLowerCase().trim();
            if (numId && strNo) {
                for (const sod of salesOrderDetails.filter((d) => Number(d.order_id) === numId)) {
                    const pId = Number(sod.product_id);
                    const qtyFromStr = invoiceProductQtyMap.get(`${strNo}:${pId}`);
                    const qtyFromNum = invoiceProductQtyMap.get(`${numId}:${pId}`);
                    if (qtyFromStr !== undefined && qtyFromNum === undefined) {
                        invoiceProductQtyMap.set(`${numId}:${pId}`, qtyFromStr);
                    } else if (qtyFromNum !== undefined && qtyFromStr === undefined) {
                        invoiceProductQtyMap.set(`${strNo}:${pId}`, qtyFromNum);
                    }
                }
            }
        }

        // Index invoice batches by (invoice_id:product_id)
        // Deduplicate invoice batches by id
        const uniqueBatchesMap = new Map<number, DirectusInvoiceBatch>();
        for (const b of invoiceBatches) {
            const bId = Number(b.id);
            if (bId && !uniqueBatchesMap.has(bId)) {
                uniqueBatchesMap.set(bId, b);
            }
        }

        const invoiceBatchesMap = new Map<string, DirectusInvoiceBatch[]>();
        for (const b of uniqueBatchesMap.values()) {
            const key = `${b.invoice_id}:${b.product_id}`;
            if (!invoiceBatchesMap.has(key)) {
                invoiceBatchesMap.set(key, []);
            }
            invoiceBatchesMap.get(key)!.push(b);
        }

        // console.log("[fulfilment-and-deliveries API] 🧾 Fetched Invoices Summary:", {
        //     total_invoices_fetched: allInvoices.length,
        //     indexed_by_id_count: invoiceMapById.size,
        //     indexed_by_order_key_count: invoiceMapByOrderKey.size,
        //     sid_mapped_count: orderIdToInvoiceIdMap.size,
        //     sample_invoices: allInvoices.slice(0, 5).map((i) => ({
        //         invoice_id: i.invoice_id,
        //         order_id: i.order_id,
        //         invoice_no: i.invoice_no,
        //         invoice_date: i.invoice_date,
        //     })),
        // });

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

        // 10a. Fetch unfulfilled sales transactions and details for clearance auditing
        interface DirectusUstRecord {
            id: number;
            sales_invoice_id: number;
            nte?: string;
            isCleared?: number;
            checked_by?: number;
            date_acknowledged?: string;
            date_created?: string;
            variance_amount?: number;
        }
        interface DirectusUstDetailRecord {
            id: number;
            unfulfilled_sales_transaction_id: number;
            sales_invoice_detail_id?: number | null;
            inventory_lot_id?: number | null;
            product_id?: number | null;
            returned_quantity?: number | string;
            missing_quantity?: number;
        }

        const ustList: DirectusUstRecord[] = [];
        const ustDetailList: DirectusUstDetailRecord[] = [];

        if (allInvoiceIds.length > 0) {
            try {
                const chunkSize = 100;
                for (let i = 0; i < allInvoiceIds.length; i += chunkSize) {
                    const chunk = allInvoiceIds.slice(i, i + chunkSize);
                    const ustRes = await fetch(
                        `${DIRECTUS_URL}/items/unfulfilled_sales_transaction?filter[sales_invoice_id][_in]=${chunk.join(",")}&limit=-1&fields=id,sales_invoice_id,nte,isCleared,checked_by,date_acknowledged,date_created,variance_amount`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (ustRes.ok) {
                        const data: DirectusUstRecord[] = (await ustRes.json()).data || [];
                        ustList.push(...data);
                    }
                }

                const ustIds = ustList.map((u) => u.id).filter(Boolean);
                if (ustIds.length > 0) {
                    for (let i = 0; i < ustIds.length; i += chunkSize) {
                        const chunk = ustIds.slice(i, i + chunkSize);
                        const ustdRes = await fetch(
                            `${DIRECTUS_URL}/items/unfulfilled_sales_transaction_details?filter[unfulfilled_sales_transaction_id][_in]=${chunk.join(",")}&limit=-1&fields=id,unfulfilled_sales_transaction_id,sales_invoice_detail_id,inventory_lot_id,product_id,returned_quantity,missing_quantity`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (ustdRes.ok) {
                            const data: DirectusUstDetailRecord[] = (await ustdRes.json()).data || [];
                            ustDetailList.push(...data);
                        }
                    }
                }
            } catch (ustErr) {
                console.warn("[fulfilment-and-deliveries GET] Error fetching unfulfilled_sales_transaction:", ustErr);
            }
        }

        // 10b. Fetch sales_order_reservation, mm_inventory_lots, and mm_lots for all salesOrderDetails
        interface RawInventoryLotRecord {
            inventory_lot_id?: number | string;
            lot_id?: number | string | { lot_id?: number | string; lot_name?: string };
            batch_no?: string;
            expiry_date?: string;
        }
        interface RawLotRecord {
            lot_id?: number | string;
            lot_name?: string;
        }

        const allSodDetailIds = [...new Set(salesOrderDetails.map((s) => Number(s.detail_id)).filter(Boolean))];
        const sodReservationMap = new Map<number, LineItemReservation[]>();
        const invLotMap = new Map<number, RawInventoryLotRecord>();
        const lotMap = new Map<number, RawLotRecord>();

        if (allSodDetailIds.length > 0 || invoiceBatches.length > 0) {
            try {
                const chunkSize = 100;
                interface RawReservationRecord {
                    reservation_id?: number | string;
                    id?: number | string;
                    sales_order_detail_id?: number | string;
                    product_id?: number | string;
                    inventory_lot_id?: number | string;
                    reserved_quantity?: number | string;
                    picked_quantity?: number | string;
                    status?: string;
                    created_at?: string;
                }

                const rawReservations: RawReservationRecord[] = [];
                for (let i = 0; i < allSodDetailIds.length; i += chunkSize) {
                    const chunk = allSodDetailIds.slice(i, i + chunkSize);
                    const resvRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${chunk.join(",")}&filter[status][_in]=Picked,Consumed&fields=reservation_id,sales_order_detail_id,product_id,inventory_lot_id,reserved_quantity,picked_quantity,status,created_at&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (resvRes.ok) {
                        const chunkData = ((await resvRes.json()).data || []) as RawReservationRecord[];
                        rawReservations.push(...chunkData);
                    }
                }

                // Collect distinct inventory_lot_ids from reservations and invoice batches
                const invLotIds = [
                    ...new Set([
                        ...rawReservations.map((r) => Number(r.inventory_lot_id)),
                        ...invoiceBatches.map((b) => Number(b.inventory_lot_id)),
                    ].filter(Boolean)),
                ];
                if (invLotIds.length > 0) {
                    for (let i = 0; i < invLotIds.length; i += chunkSize) {
                        const chunk = invLotIds.slice(i, i + chunkSize);
                        const invRes = await fetch(
                            `${DIRECTUS_URL}/items/mm_inventory_lots?filter[inventory_lot_id][_in]=${chunk.join(",")}&fields=inventory_lot_id,lot_id.lot_id,lot_id.lot_name,batch_no,expiry_date&limit=-1`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (invRes.ok) {
                            const chunkData = ((await invRes.json()).data || []) as RawInventoryLotRecord[];
                            for (const inv of chunkData) {
                                invLotMap.set(Number(inv.inventory_lot_id), inv);
                            }
                        }
                    }
                }

                // Collect distinct lot_ids from invLotMap for fallback lookup
                const lotIds = [
                    ...new Set(
                        Array.from(invLotMap.values())
                            .map((inv) => {
                                if (typeof inv.lot_id === "object" && inv.lot_id !== null) {
                                    return Number(inv.lot_id.lot_id);
                                }
                                return Number(inv.lot_id);
                            })
                            .filter(Boolean)
                    ),
                ];
                if (lotIds.length > 0) {
                    for (let i = 0; i < lotIds.length; i += chunkSize) {
                        const chunk = lotIds.slice(i, i + chunkSize);
                        const lotRes = await fetch(
                            `${DIRECTUS_URL}/items/mm_lots?filter[lot_id][_in]=${chunk.join(",")}&fields=lot_id,lot_name&limit=-1`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (lotRes.ok) {
                            const chunkData = ((await lotRes.json()).data || []) as RawLotRecord[];
                            for (const lot of chunkData) {
                                lotMap.set(Number(lot.lot_id), lot);
                            }
                        }
                    }
                }

                // Map reservations to sales_order_detail_id
                for (const r of rawReservations) {
                    const sodId = Number(r.sales_order_detail_id);
                    const invLot = invLotMap.get(Number(r.inventory_lot_id));

                    let resolvedLotId: number | undefined = undefined;
                    let resolvedLotName: string | undefined = undefined;

                    if (invLot) {
                        if (typeof invLot.lot_id === "object" && invLot.lot_id !== null) {
                            resolvedLotId = invLot.lot_id.lot_id ? Number(invLot.lot_id.lot_id) : undefined;
                            resolvedLotName = invLot.lot_id.lot_name || undefined;
                        } else if (invLot.lot_id) {
                            resolvedLotId = Number(invLot.lot_id);
                        }
                    }

                    if (!resolvedLotName && resolvedLotId) {
                        resolvedLotName = lotMap.get(resolvedLotId)?.lot_name;
                    }

                    const mapped: LineItemReservation = {
                        reservation_id: Number(r.reservation_id || r.id),
                        sales_order_detail_id: sodId,
                        product_id: Number(r.product_id),
                        inventory_lot_id: Number(r.inventory_lot_id),
                        lot_id: resolvedLotId,
                        lot_name: resolvedLotName,
                        batch_no: invLot?.batch_no || undefined,
                        reserved_quantity: Number(r.reserved_quantity || 0),
                        picked_quantity: Number(r.picked_quantity || 0),
                        status: r.status || "Reserved",
                        created_at: r.created_at ? String(r.created_at) : undefined,
                    };

                    const existing = sodReservationMap.get(sodId) || [];
                    existing.push(mapped);
                    sodReservationMap.set(sodId, existing);
                }
            } catch (resvErr) {
            console.warn("[fulfilment-and-deliveries GET] Error fetching reservations:", resvErr);
        }
    }

        const parseDateMs = (ts?: string | null) => {
            if (!ts) return 0;
            const str = String(ts).trim();
            return new Date(str.endsWith("Z") ? str : str + "Z").getTime();
        };

                // 11. Transform each Consolidator into a ConsolidatedDeliveryRecord with strict Gatekeeping
                const records = allConsolidators
                    .map((con) => {
                        const conId = Number(con.id);
                        const branchId = Number(con.branch_id || 1);
                        const branchName = branchMap.get(branchId)?.branch_name || `Branch #${branchId}`;
                        const isManifestCleared = con.status === "Completed" || con.status === "Delivered";

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

                            // An order still in "For Consolidation" belongs in Consolidation Planning (or reconsolidation / redispatch)
                            if (so?.order_status === "For Consolidation") {
                                hasUninvoicedOrder = true;
                                break;
                            }

                            const isInvoicedStatus =
                                so &&
                                so.order_status !== "For Consolidation" &&
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

                                const allInvoicesForOrder: DirectusInvoice[] = [
                                    ...(so?.order_id ? invoicesByOrderKey.get(String(so.order_id).toLowerCase()) || [] : []),
                                    ...(so?.order_no ? invoicesByOrderKey.get(so.order_no.trim().toLowerCase()) || [] : []),
                                    ...(invoicesByOrderKey.get(String(orderId).toLowerCase()) || []),
                                    ...(inv ? [inv] : []),
                                ].filter((v, idx, arr) => arr.findIndex((x) => Number(x.invoice_id || x.id) === Number(v.invoice_id || v.id)) === idx);

                                const invoiceNo = allInvoicesForOrder.length > 0
                                    ? allInvoicesForOrder.map((i) => i.invoice_no).filter(Boolean).join(", ") || inv?.invoice_no || so?.invoice_no || "---"
                                    : inv?.invoice_no || so?.invoice_no || "---";
                                const invoiceId = inv?.invoice_id || allInvoicesForOrder[0]?.invoice_id || so?.invoice_id || null;
                                const invoiceDate = inv?.invoice_date || allInvoicesForOrder[0]?.invoice_date || null;
                                const totalInvoiceAmount = allInvoicesForOrder.length > 0
                                    ? allInvoicesForOrder.reduce((sum, i) => sum + Number(i.total_amount || i.net_amount || 0), 0)
                                    : Number(so?.total_amount || 0);

                                const linkedSr =
                                    (invoiceNo && invoiceNo !== "---" ? salesReturnMap.get(invoiceNo.toLowerCase()) : null) ||
                                    (so?.order_no ? salesReturnMap.get(so.order_no.toLowerCase()) : null) ||
                                    salesReturnMap.get(String(orderId)) ||
                                    (inv?.invoice_id ? salesReturnMap.get(String(inv.invoice_id)) : null) ||
                                    (inv?.invoice_id ? salesReturnMap.get(`inv_id:${inv.invoice_id}`) : null) ||
                                    (so?.order_id ? salesReturnMap.get(String(so.order_id)) : null) ||
                                    null;

                                const conUpdatedAtMs = con.updated_at ? new Date(con.updated_at).getTime() : 0;
                                const effectiveInvId = inv?.invoice_id || so?.invoice_id || null;

                                // Check if an unfulfilled delivery transaction belongs to THIS manifest's clearance
                                const matchingUst = isManifestCleared && effectiveInvId
                                    ? ustList.find((u) => {
                                          if (Number(u.sales_invoice_id) !== Number(effectiveInvId)) return false;
                                          const ustDateMs = new Date(u.date_created || u.date_acknowledged || "").getTime();
                                          return Math.abs(conUpdatedAtMs - ustDateMs) <= 300_000;
                                      })
                                    : null;

                                const ustDetailsForMatching = matchingUst
                                    ? ustDetailList.filter((d) => Number(d.unfulfilled_sales_transaction_id) === Number(matchingUst.id))
                                    : [];

                                // Build line items for this order in this consolidator
                                const relevantSodDetails = salesOrderDetails.filter(
                                    (sod) => Number(sod.order_id) === orderId
                                );

                                let isCleared = false;
                                let orderFulfillmentStatus:
                                    | "Pending"
                                    | "Fulfilled"
                                    | "Fulfilled with Concerns"
                                    | "Fulfilled with Returns"
                                    | "Unfulfilled / Returns" = "Pending";
                                let orderRemarks = "";
                                let linkedSrToReturn: typeof linkedSr | null = null;
                                let items: Array<{
                                    detail_id: number;
                                    product_id: number;
                                    product_code: string;
                                    product_name: string;
                                    product_description: string;
                                    uom: string;
                                    ordered_quantity: number;
                                    invoiced_quantity?: number;
                                    received_quantity: number;
                                    returned_quantity: number;
                                    unit_price: number;
                                    has_concern: boolean;
                                    concern_notes: string;
                                    line_status: "Fulfilled" | "Fulfilled with Returns" | "Unfulfilled / Returns";
                                    reservations: LineItemReservation[];
                                }> = [];

                                if (!isManifestCleared) {
                                    // New/current delivery attempt
                                    isCleared = false;
                                    orderFulfillmentStatus = "Pending";

                                    items = relevantSodDetails.map((sod) => {
                                        const prod = productMap.get(Number(sod.product_id));
                                        const prodName = prod?.description || prod?.product_name || `Product #${sod.product_id}`;
                                        const prodCode = prod?.product_code || `SKU-${sod.product_id}`;
                                        const prodDesc = prod?.short_description || (prod?.description && prod?.description !== prod?.product_name ? prod?.description : "") || "";
                                        const ordered = Number(sod.ordered_quantity || 0);

                                        const conCreatedAtMs = parseDateMs(con.created_at);
                                        const rawLineReservations = sodReservationMap.get(Number(sod.detail_id)) || [];
                                        const lineReservations = conCreatedAtMs > 0
                                            ? rawLineReservations.filter((r) => {
                                                if (!r.created_at) return true;
                                                const resTime = parseDateMs(r.created_at);
                                                return resTime >= (conCreatedAtMs - 15 * 60 * 1000);
                                            })
                                            : rawLineReservations;
                                        const totalPickedFromRes = lineReservations.reduce((s, r) => s + (Number(r.picked_quantity) || 0), 0);
                                        const conDetail = consolidatorDetails.find(
                                            (cd) => Number(cd.consolidator_id) === conId && Number(cd.sales_order_detail_id) === Number(sod.detail_id)
                                        );
                                        const conPicked = conDetail ? Number(conDetail.picked_quantity !== undefined ? conDetail.picked_quantity : conDetail.applied_quantity || 0) : 0;
                                        const sodAllocated = sod.allocated_quantity !== undefined && sod.allocated_quantity !== null ? Number(sod.allocated_quantity) : null;
                                        const actualDispatched = totalPickedFromRes > 0
                                            ? totalPickedFromRes
                                            : conPicked > 0
                                            ? conPicked
                                            : sodAllocated !== null
                                            ? sodAllocated
                                            : 0;

                                        // Authoritative invoiced quantity for this specific order line
                                        let invoicedQty: number | undefined = undefined;

                                        // 1. Sum across all invoices associated with this sales order
                                        if (allInvoicesForOrder.length > 0) {
                                            let sum = 0;
                                            let found = false;
                                            for (const oInv of allInvoicesForOrder) {
                                                const oInvId = Number(oInv.invoice_id || oInv.id);
                                                const fromInv = invoiceProductQtyMap.get(`${oInvId}:${sod.product_id}`);
                                                if (fromInv !== undefined) {
                                                    sum += fromInv;
                                                    found = true;
                                                }
                                            }
                                            if (found) invoicedQty = sum;
                                        }

                                        // 2. Direct invoice ID lookup
                                        if (invoicedQty === undefined && inv?.invoice_id) {
                                            const fromInv = invoiceProductQtyMap.get(`${inv.invoice_id}:${sod.product_id}`);
                                            if (fromInv !== undefined) invoicedQty = fromInv;
                                        }

                                        // 3. Fallback to order key lookup in invoiceProductQtyMap
                                        if (invoicedQty === undefined) {
                                            const fromOrdNo = so?.order_no ? invoiceProductQtyMap.get(`${so.order_no.trim().toLowerCase()}:${sod.product_id}`) : undefined;
                                            if (fromOrdNo !== undefined) {
                                                invoicedQty = fromOrdNo;
                                            } else {
                                                const fromOrd = invoiceProductQtyMap.get(`${orderId}:${sod.product_id}`);
                                                if (fromOrd !== undefined) invoicedQty = fromOrd;
                                            }
                                        }

                                        // Authoritative batch reservations across all invoices of this order
                                        let sibList: DirectusInvoiceBatch[] | undefined = undefined;
                                        if (allInvoicesForOrder.length > 0) {
                                            for (const oInv of allInvoicesForOrder) {
                                                const oInvId = Number(oInv.invoice_id || oInv.id);
                                                const bList = invoiceBatchesMap.get(`${oInvId}:${sod.product_id}`);
                                                if (bList && bList.length > 0) {
                                                    sibList = [...(sibList || []), ...bList];
                                                }
                                            }
                                        }
                                        if (!sibList && inv?.invoice_id) {
                                            sibList = invoiceBatchesMap.get(`${inv.invoice_id}:${sod.product_id}`);
                                        }

                                        const effectiveReservations: LineItemReservation[] = (sibList && sibList.length > 0)
                                            ? sibList.map((sib) => {
                                                const invLot = invLotMap.get(Number(sib.inventory_lot_id));
                                                const lotId = Number(sib.lot_id || (typeof invLot?.lot_id === "object" ? invLot.lot_id?.lot_id : invLot?.lot_id) || 0);
                                                const lot = lotMap.get(lotId);
                                                const lotName = (typeof invLot?.lot_id === "object" ? invLot.lot_id?.lot_name : undefined) || lot?.lot_name || `Lot #${lotId}`;
                                                return {
                                                    reservation_id: Number(sib.id),
                                                    sales_order_detail_id: Number(sod.detail_id),
                                                    inventory_lot_id: Number(sib.inventory_lot_id),
                                                    product_id: Number(sod.product_id),
                                                    lot_id: lotId,
                                                    lot_name: lotName,
                                                    lot_number: lotName,
                                                    batch_no: sib.batch_no || invLot?.batch_no || "",
                                                    reserved_quantity: Number(sib.quantity || 0),
                                                    picked_quantity: Number(sib.quantity || 0),
                                                    returned_quantity: 0,
                                                    status: "Dispatched",
                                                };
                                            })
                                            : lineReservations;

                                        // STRICT NO FALLBACK:
                                        // If this order has sales invoices, the baseline is strictly the invoiced quantity.
                                        // If invoicedQty is undefined (not on invoice), invoiced_quantity is undefined (displays as '-' in UI per user request).
                                        const hasInvoice = allInvoicesForOrder.length > 0 || Boolean(inv?.invoice_id);
                                        const baseDeliverable = invoicedQty !== undefined
                                            ? invoicedQty
                                            : (hasInvoice ? 0 : Math.min(ordered, actualDispatched));

                                        return {
                                            detail_id: Number(sod.detail_id),
                                            product_id: Number(sod.product_id),
                                            product_code: prodCode,
                                            product_name: prodName,
                                            product_description: prodDesc,
                                            uom: "",
                                            ordered_quantity: ordered,
                                            invoiced_quantity: invoicedQty,
                                            received_quantity: baseDeliverable,
                                            returned_quantity: 0,
                                            unit_price: Number(sod.unit_price || 0),
                                            has_concern: false,
                                            concern_notes: "",
                                            line_status: "Fulfilled" as const,
                                            reservations: effectiveReservations,
                                        };
                                    });

                                    orderRemarks = "";
                                    linkedSrToReturn = null;
                                } else {
                                    // Historical completed delivery attempt
                                    isCleared = true;

                                    // Read the clearance result belonging to THIS manifest.
                                    // Do not derive it from current SO/invoice state.
                                    items = relevantSodDetails.map((sod) => {
                                        const prod = productMap.get(Number(sod.product_id));
                                        const prodName = prod?.description || prod?.product_name || `Product #${sod.product_id}`;
                                        const prodCode = prod?.product_code || `SKU-${sod.product_id}`;
                                        const prodDesc = prod?.short_description || (prod?.description && prod?.description !== prod?.product_name ? prod?.description : "") || "";
                                        const ordered = Number(sod.ordered_quantity || 0);

                                        const conCreatedAtMs = parseDateMs(con.created_at);
                                        const rawLineReservations = sodReservationMap.get(Number(sod.detail_id)) || [];
                                        const lineReservations = conCreatedAtMs > 0
                                            ? rawLineReservations.filter((r) => {
                                                if (!r.created_at) return true;
                                                const resTime = parseDateMs(r.created_at);
                                                return resTime >= (conCreatedAtMs - 15 * 60 * 1000);
                                            })
                                            : rawLineReservations;
                                        const totalPickedFromRes = lineReservations.reduce((s, r) => s + (Number(r.picked_quantity) || 0), 0);
                                        const conDetail = consolidatorDetails.find(
                                            (cd) => Number(cd.consolidator_id) === conId && Number(cd.sales_order_detail_id) === Number(sod.detail_id)
                                        );
                                        const conPicked = conDetail ? Number(conDetail.picked_quantity !== undefined ? conDetail.picked_quantity : conDetail.applied_quantity || 0) : 0;
                                        const sodAllocated = sod.allocated_quantity !== undefined && sod.allocated_quantity !== null ? Number(sod.allocated_quantity) : null;
                                        const actualDispatched = totalPickedFromRes > 0
                                            ? totalPickedFromRes
                                            : conPicked > 0
                                            ? conPicked
                                            : sodAllocated !== null
                                            ? sodAllocated
                                            : 0;

                                        // Authoritative invoiced quantity for this specific order line
                                        let invoicedQty: number | undefined = undefined;

                                        // 1. Sum across all invoices associated with this sales order
                                        if (allInvoicesForOrder.length > 0) {
                                            let sum = 0;
                                            let found = false;
                                            for (const oInv of allInvoicesForOrder) {
                                                const oInvId = Number(oInv.invoice_id || oInv.id);
                                                const fromInv = invoiceProductQtyMap.get(`${oInvId}:${sod.product_id}`);
                                                if (fromInv !== undefined) {
                                                    sum += fromInv;
                                                    found = true;
                                                }
                                            }
                                            if (found) invoicedQty = sum;
                                        }

                                        // 2. Direct invoice ID lookup
                                        if (invoicedQty === undefined && inv?.invoice_id) {
                                            const fromInv = invoiceProductQtyMap.get(`${inv.invoice_id}:${sod.product_id}`);
                                            if (fromInv !== undefined) invoicedQty = fromInv;
                                        }

                                        // 3. Fallback to order key lookup in invoiceProductQtyMap
                                        if (invoicedQty === undefined) {
                                            const fromOrdNo = so?.order_no ? invoiceProductQtyMap.get(`${so.order_no.trim().toLowerCase()}:${sod.product_id}`) : undefined;
                                            if (fromOrdNo !== undefined) {
                                                invoicedQty = fromOrdNo;
                                            } else {
                                                const fromOrd = invoiceProductQtyMap.get(`${orderId}:${sod.product_id}`);
                                                if (fromOrd !== undefined) invoicedQty = fromOrd;
                                            }
                                        }

                                        // Authoritative batch reservations across all invoices of this order
                                        let sibList: DirectusInvoiceBatch[] | undefined = undefined;
                                        if (allInvoicesForOrder.length > 0) {
                                            for (const oInv of allInvoicesForOrder) {
                                                const oInvId = Number(oInv.invoice_id || oInv.id);
                                                const bList = invoiceBatchesMap.get(`${oInvId}:${sod.product_id}`);
                                                if (bList && bList.length > 0) {
                                                    sibList = [...(sibList || []), ...bList];
                                                }
                                            }
                                        }
                                        if (!sibList && inv?.invoice_id) {
                                            sibList = invoiceBatchesMap.get(`${inv.invoice_id}:${sod.product_id}`);
                                        }

                                        const effectiveReservations: LineItemReservation[] = (sibList && sibList.length > 0)
                                            ? sibList.map((sib) => {
                                                const invLot = invLotMap.get(Number(sib.inventory_lot_id));
                                                const lotId = Number(sib.lot_id || (typeof invLot?.lot_id === "object" ? invLot.lot_id?.lot_id : invLot?.lot_id) || 0);
                                                const lot = lotMap.get(lotId);
                                                const lotName = (typeof invLot?.lot_id === "object" ? invLot.lot_id?.lot_name : undefined) || lot?.lot_name || `Lot #${lotId}`;
                                                return {
                                                    reservation_id: Number(sib.id),
                                                    sales_order_detail_id: Number(sod.detail_id),
                                                    inventory_lot_id: Number(sib.inventory_lot_id),
                                                    product_id: Number(sod.product_id),
                                                    lot_id: lotId,
                                                    lot_name: lotName,
                                                    lot_number: lotName,
                                                    batch_no: sib.batch_no || invLot?.batch_no || "",
                                                    reserved_quantity: Number(sib.quantity || 0),
                                                    picked_quantity: Number(sib.quantity || 0),
                                                    returned_quantity: 0,
                                                    status: "Dispatched",
                                                };
                                            })
                                            : lineReservations;

                                        // STRICT NO FALLBACK:
                                        // If this order has sales invoices, the baseline is strictly the invoiced quantity.
                                        const hasInvoice = allInvoicesForOrder.length > 0 || Boolean(inv?.invoice_id);
                                        const baseDeliverable = invoicedQty !== undefined
                                            ? invoicedQty
                                            : (hasInvoice ? 0 : Math.min(ordered, actualDispatched));

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

                                        let received = baseDeliverable;
                                        let returned = 0;

                                        if (matchingUst) {
                                            const matchingUstd = ustDetailsForMatching.find(
                                                (d) => Number(d.product_id) === Number(sod.product_id) || Number(d.sales_invoice_detail_id) === Number(sod.detail_id)
                                            );
                                            const ustRet = matchingUstd ? Number(matchingUstd.returned_quantity || matchingUstd.missing_quantity || 0) : baseDeliverable;
                                            returned = Math.min(baseDeliverable, ustRet > 0 ? ustRet : baseDeliverable);
                                            received = Math.max(0, baseDeliverable - returned);
                                        } else if (srReturned > 0) {
                                            returned = Math.min(baseDeliverable, srReturned);
                                            received = Math.max(0, baseDeliverable - returned);
                                        } else {
                                            received = baseDeliverable;
                                            returned = 0;
                                        }

                                        let lineStatus: "Fulfilled" | "Fulfilled with Returns" | "Unfulfilled / Returns" = "Fulfilled";
                                        if (received === 0 && returned >= baseDeliverable && baseDeliverable > 0) {
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
                                            uom: "",
                                            ordered_quantity: ordered,
                                            invoiced_quantity: invoicedQty,
                                            received_quantity: received,
                                            returned_quantity: returned,
                                            unit_price: Number(sod.unit_price || 0),
                                            has_concern: false,
                                            concern_notes: "",
                                            line_status: lineStatus,
                                            reservations: effectiveReservations,
                                        };
                                    });

                                    const hasAnyReturns = items.some((it) => it.returned_quantity > 0) || Boolean(linkedSr);
                                    const hasAnyConcerns = items.some((it) => it.has_concern || (it.concern_notes && it.concern_notes.trim().length > 0));
                                    const isAllUnfulfilled = items.length > 0 && items.every((it) => it.received_quantity === 0 && it.returned_quantity > 0);

                                    if (matchingUst || isAllUnfulfilled) {
                                        orderFulfillmentStatus = "Unfulfilled / Returns";
                                        orderRemarks = matchingUst?.nte || so?.remarks || inv?.remarks || "";
                                    } else if (hasAnyReturns || linkedSr) {
                                        orderFulfillmentStatus = "Fulfilled with Returns";
                                        orderRemarks = so?.remarks || inv?.remarks || "";
                                        linkedSrToReturn = linkedSr;
                                    } else {
                                        orderFulfillmentStatus = hasAnyConcerns ? "Fulfilled with Concerns" : "Fulfilled";
                                        orderRemarks = "";
                                    }
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
                                    amount: totalInvoiceAmount > 0
                                        ? totalInvoiceAmount
                                        : Number(so?.net_amount || so?.total_amount || inv?.net_amount || inv?.total_amount || 0),
                                    remarks: orderRemarks,
                                    fulfillment_status: orderFulfillmentStatus,
                                    is_cleared: isCleared,
                                    linked_sales_return: linkedSrToReturn,
                                    items,
                                };
                            })
                            .filter((o): o is NonNullable<typeof o> => o !== null);

                        if (childOrders.length === 0) return null;

                        // console.log("[fulfilment-and-deliveries API] 📦 Manifest Child Orders Resolved:", {
                        //     consolidator_id: conId,
                        //     consolidator_no: con.consolidator_no,
                        //     childOrders: childOrders.map((co) => ({
                        //         order_id: co.order_id,
                        //         order_no: co.order_no,
                        //         invoice_id: co.invoice_id,
                        //         invoice_no: co.invoice_no,
                        //         invoice_date: co.invoice_date,
                        //         customer_name: co.customer_name,
                        //         salesman_name: co.salesman_name,
                        //         salesman_code: co.salesman_code,
                        //         fulfillment_status: co.fulfillment_status,
                        //     })),
                        // });

                        // ─── GATEKEEPING RULE 4: Quantity Variance Check (Shortfall Allowed) ─────────
                        // Retain manifests even if total picked quantity in consolidator does not match total ordered quantity.
                        // Picking shortfalls are reconciled and cleared during delivery reconciliation.
                        // const conDetailsForThisCon = consolidatorDetails.filter(
                        //     (cd) => Number(cd.consolidator_id) === conId
                        // );

                        // const totalPickedQty = conDetailsForThisCon.reduce((sum, cd) => {
                        //     const picked = Number(cd.picked_quantity || 0);
                        //     const applied = Number(cd.applied_quantity || 0);
                        //     const ordered = Number(cd.ordered_quantity || 0);
                        //     return sum + (picked > 0 ? picked : applied > 0 ? applied : ordered);
                        // }, 0);

                        // const totalInvoicedAllocationQty = childOrders.reduce(
                        //     (sum, o) => sum + o.items.reduce((itemSum, item) => itemSum + item.ordered_quantity, 0),
                        //     0
                        // );

                        // Calculate consolidator level aggregations
                        const totalOrdersCount = childOrders.length;
                        const totalItemsCount = childOrders.reduce((sum, o) => sum + o.items.length, 0);
                        const totalAmount = childOrders.reduce((sum, o) => sum + o.amount, 0);

                        // const isAllDelivered = childOrders.length > 0 && childOrders.every((o) => o.is_cleared);
                        const hasAnyReturns = childOrders.some((o) => o.fulfillment_status === "Fulfilled with Returns" || Boolean(o.linked_sales_return));
                        const hasAnyConcerns = childOrders.some((o) => o.fulfillment_status === "Fulfilled with Concerns");
                        const isAllUnfulfilled = childOrders.length > 0 && childOrders.every((o) => o.fulfillment_status === "Unfulfilled / Returns");

                        let conFulfillmentStatus: "Pending" | "Fulfilled" | "Fulfilled with Concerns" | "Fulfilled with Returns" | "Unfulfilled / Returns" = "Pending";
                        if (!isManifestCleared) {
                            conFulfillmentStatus = "Pending";
                        } else if (isAllUnfulfilled) {
                            conFulfillmentStatus = "Unfulfilled / Returns";
                        } else if (hasAnyReturns) {
                            conFulfillmentStatus = "Fulfilled with Returns";
                        } else if (hasAnyConcerns) {
                            conFulfillmentStatus = "Fulfilled with Concerns";
                        } else {
                            conFulfillmentStatus = "Fulfilled";
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
                            is_cleared: isManifestCleared,
                            orders: childOrders,
                        };
                    })
                    .filter((r): r is NonNullable<typeof r> => r !== null && r.total_orders > 0 && (r.status === "Dispatched" || r.status === "Delivered" || r.status === "Completed" || r.status === "Approved" || r.status === "Audited"));

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
                r.status.toLowerCase() === statusFilter.toLowerCase() ||
                (statusFilter === "Completed" && (r.status === "Completed" || r.status === "Delivered")) ||
                (statusFilter === "Dispatched" && r.status === "Dispatched") ||
                (statusFilter === "Approved" && r.status === "Approved") ||
                (statusFilter === "Audited" && r.status === "Audited") ||
                (statusFilter === "Pending" && r.fulfillment_status === "Pending") ||
                (statusFilter === "Fulfilled" && r.fulfillment_status === "Fulfilled") ||
                (statusFilter === "Fulfilled with Concerns" && r.fulfillment_status === "Fulfilled with Concerns") ||
                (statusFilter === "Fulfilled with Returns" && r.fulfillment_status === "Fulfilled with Returns") ||
                (statusFilter === "Unfulfilled / Returns" && r.fulfillment_status === "Unfulfilled / Returns");

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
            const { order_id, invoice_id, items, clearance_remarks: orderRemarks, linked_return_id, fulfillment_status: clientFulfillmentStatus } = orderData;
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

            // Resolve effective invoice ID upfront
            let effectiveInvoiceId = Number(invoice_id || 0);
            if (!effectiveInvoiceId && targetOrderId) {
                try {
                    const invLookupRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_invoice?filter[order_id][_eq]=${targetOrderId}&filter[transaction_status][_neq]=Cancelled&fields=invoice_id&limit=1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (invLookupRes.ok) {
                        const invLookupData = (await invLookupRes.json()).data;
                        if (invLookupData && invLookupData.length > 0) {
                            effectiveInvoiceId = Number(invLookupData[0].invoice_id);
                        }
                    }
                } catch (e) {
                    console.warn("[POST] Failed to lookup invoice_id for order:", e);
                }
            }

            // Fetch sales_invoice_details for this invoice to get authoritative expected quantities
            const invoiceDetailQtyMap = new Map<number, number>();
            const invoiceDetailMap = new Map<number, number>();
            if (effectiveInvoiceId) {
                try {
                    const sidRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_eq]=${effectiveInvoiceId}&limit=-1&fields=detail_id,product_id,quantity`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (sidRes.ok) {
                        const sidData: Array<{ detail_id: number; product_id: number; quantity?: number }> = (await sidRes.json()).data || [];
                        for (const sid of sidData) {
                            const pid = Number(sid.product_id);
                            if (pid) {
                                if (sid.detail_id) invoiceDetailMap.set(pid, Number(sid.detail_id));
                                invoiceDetailQtyMap.set(pid, (invoiceDetailQtyMap.get(pid) || 0) + Number(sid.quantity || 0));
                            }
                        }
                    }
                } catch (sidErr) {
                    console.warn("[POST] Error fetching sales_invoice_details for expected quantity mapping:", sidErr);
                }
            }

            let totalReceived = 0;
            let totalReturned = 0;
            let totalExpected = 0;
            let totalMissing = 0;

            for (const item of items) {
                const detailId = Number(item.detail_id);
                const dbItem = dbDetailMap.get(detailId);
                const prodId = Number(item.product_id || (dbItem ? dbItem.product_id : 0));
                const rec = Number(item.received_quantity);
                const ret = Number(item.returned_quantity);
                const dbOrdered = dbItem ? Number(dbItem.ordered_quantity || 0) : rec + ret;

                if (isNaN(rec) || isNaN(ret) || rec < 0 || ret < 0) {
                    return NextResponse.json(
                        { message: `Quantities for line #${detailId} must be non-negative numbers.` },
                        { status: 422 }
                    );
                }

                const invQty = invoiceDetailQtyMap.get(prodId) ?? (item.invoiced_quantity !== undefined && item.invoiced_quantity !== null ? Number(item.invoiced_quantity) : undefined);
                const expectedQty = invQty !== undefined ? invQty : dbOrdered;

                const missing = Math.max(0, expectedQty - (rec + ret));
                totalMissing += missing;
                totalReceived += rec;
                totalReturned += ret;
                totalExpected += expectedQty;
            }

            // Derive order status based on authoritative expected units
            const hasOrderConcerns =
                items.some((it) => it.has_concern || (it.concern_notes && String(it.concern_notes).trim().length > 0)) ||
                clientFulfillmentStatus === "Fulfilled with Concerns";

            let derivedStatus: "Unfulfilled / Returns" | "Fulfilled with Returns" | "Fulfilled with Concerns" | "Fulfilled";
            let targetSoStatus: "Delivered" | "Partially Delivered" | "Not Fulfilled";

            if (totalReceived === 0 && (totalReturned > 0 || totalMissing > 0 || totalExpected > 0)) {
                derivedStatus = "Unfulfilled / Returns";
                targetSoStatus = "Not Fulfilled";
            } else if (totalReceived > 0 && totalReturned > 0) {
                derivedStatus = "Fulfilled with Returns";
                targetSoStatus = "Partially Delivered";
            } else if (totalReceived === totalExpected && totalReturned === 0 && hasOrderConcerns) {
                derivedStatus = "Fulfilled with Concerns";
                targetSoStatus = "Delivered";
            } else if (totalReceived === totalExpected && totalReturned === 0 && !hasOrderConcerns) {
                derivedStatus = "Fulfilled";
                targetSoStatus = "Delivered";
            } else if (totalReceived > 0 && totalMissing > 0 && totalReturned === 0) {
                derivedStatus = "Fulfilled with Concerns";
                targetSoStatus = "Partially Delivered";
            } else if (clientFulfillmentStatus === "Fulfilled with Concerns") {
                derivedStatus = "Fulfilled with Concerns";
                targetSoStatus = "Delivered";
            } else {
                derivedStatus = "Fulfilled";
                targetSoStatus = "Delivered";
            }

            // Mandatory Remarks Validation: Required for 'Fulfilled with Returns', 'Fulfilled with Concerns', 'Unfulfilled / Returns', or quantity variances
            if (
                (derivedStatus === "Fulfilled with Returns" ||
                 derivedStatus === "Fulfilled with Concerns" ||
                 derivedStatus === "Unfulfilled / Returns" ||
                 clientFulfillmentStatus === "Fulfilled with Returns" ||
                 clientFulfillmentStatus === "Fulfilled with Concerns" ||
                 clientFulfillmentStatus === "Unfulfilled / Returns" ||
                 totalMissing > 0) &&
                (!orderRemarks || typeof orderRemarks !== "string" || orderRemarks.trim().length === 0)
            ) {
                const reason = totalMissing > 0 ? "quantity variance" : `status "${clientFulfillmentStatus || derivedStatus}"`;
                return NextResponse.json(
                    {
                        message: `Remarks are required for order #${targetOrderId || invoice_id} due to ${reason}. Please provide clearance remarks.`,
                    },
                    { status: 422 }
                );
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
            const isOrderUnfulfilled = targetSoStatus === "Not Fulfilled" || derivedStatus === "Unfulfilled / Returns";

            // If unfulfilled: sales order transitions back to "For Consolidation" to re-enter consolidation planning
            const finalOrderStatus = isOrderUnfulfilled ? "For Consolidation" : targetSoStatus;

            // Update sales order
            if (targetOrderId) {
                const soPayload: Record<string, unknown> = {
                    order_status: finalOrderStatus,
                    isDelivered: isOrderDelivered ? 1 : 0,
                    modified_by: userId,
                    modified_date: phNow,
                    posted_by: userId,
                    posted_date: phNow,
                };
                if (isOrderDelivered) {
                    soPayload.delivered_at = phNow;
                    soPayload.not_fulfilled_at = null;
                    soPayload.remarks = "";
                } else if (isOrderUnfulfilled) {
                    soPayload.not_fulfilled_at = phNow;
                    if (orderRemarks && typeof orderRemarks === "string" && orderRemarks.trim()) {
                        soPayload.remarks = orderRemarks.trim();
                    }
                }

                await fetch(`${DIRECTUS_URL}/items/sales_order/${targetOrderId}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify(soPayload),
                }).catch((err) => console.warn(`[POST] Failed to update sales_order #${targetOrderId}:`, err));
            }

            // Update sales invoice if present: when unfulfilled, reset flags to allow re-dispatch reuse
            if (effectiveInvoiceId) {
                const invoicePayload: Record<string, unknown> = {
                    isDelivered: isOrderDelivered ? 1 : 0,
                    isDispatched: isOrderUnfulfilled ? 0 : 1,
                    posted_by: userId,
                    posted_date: phNow,
                    modified_by: userId,
                    modified_date: phNow,
                    delivered_at: isOrderDelivered ? phNow : null,
                };

                if (isOrderUnfulfilled) {
                    invoicePayload.transaction_status = "Not Delivered";
                } else if (derivedStatus === "Fulfilled with Returns") {
                    invoicePayload.transaction_status = "Completed with Returns";
                }

                await fetch(`${DIRECTUS_URL}/items/sales_invoice/${effectiveInvoiceId}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify(invoicePayload),
                }).catch((err) => console.warn(`[POST] Failed to update sales_invoice #${effectiveInvoiceId}:`, err));
            }

            // Update sales_order_reservation status for lot-level inventory movement reflection
            // For Unfulfilled: reservations stay 'Consumed' — OUT movement remains in v_mm_inventory_movements permanently.
            // The IN reversal is written via unfulfilled_sales_transaction_details (inventory_lot_id + returned_quantity).
            let allLotReservations: Array<{
                reservation_id?: number;
                id?: number;
                sales_order_detail_id: number;
                product_id?: number;
                inventory_lot_id: number;
                reserved_quantity?: number | string;
                picked_quantity?: number | string;
                status: string;
            }> = [];

            const dbDetailIds = Array.from(dbDetailMap.keys());
            if (dbDetailIds.length > 0) {
                try {
                    const resvRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${dbDetailIds.join(",")}&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (resvRes.ok) {
                        const rawResvData: Array<{
                            reservation_id?: number;
                            id?: number;
                            sales_order_detail_id: number;
                            product_id?: number;
                            inventory_lot_id: number;
                            reserved_quantity?: number | string;
                            picked_quantity?: number | string;
                            status: string;
                        }> = (await resvRes.json()).data || [];

                        // Expose to the unfulfilled detail insertion block below
                        allLotReservations = rawResvData;

                        const lineItemMap = new Map<number, (typeof items)[0]>();
                        for (const it of items) {
                            lineItemMap.set(Number(it.detail_id), it);
                        }

                        // Group reservations by sales_order_detail_id
                        const resvByDetail = new Map<number, typeof rawResvData>();
                        for (const r of rawResvData) {
                            const sodId = Number(r.sales_order_detail_id);
                            const list = resvByDetail.get(sodId) || [];
                            list.push(r);
                            resvByDetail.set(sodId, list);
                        }

                        for (const [, resvList] of resvByDetail.entries()) {
                            if (!isOrderUnfulfilled) {
                                // Fulfilled, Fulfilled with Concerns, or Fulfilled with Returns:
                                // Mark reservations Consumed so the OUT movement stays in the ledger.
                                // (For Fulfilled with Returns, the Sales Return module handles return inventory movements).
                                for (const resv of resvList) {
                                    const resvId = Number(resv.reservation_id || resv.id);
                                    if (!resvId) continue;
                                    if (resv.status !== "Consumed") {
                                        await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${resvId}`, {
                                            method: "PATCH",
                                            headers: directusHeaders,
                                            body: JSON.stringify({ status: "Consumed" }),
                                        }).catch((err) => console.warn(`[POST] Failed to update reservation #${resvId} to Consumed:`, err));
                                    }
                                }
                            }
                            // Unfulfilled: reservations already Consumed from Consolidation Approval — leave untouched.
                            // The IN reversal is recorded via unfulfilled_sales_transaction_details below.
                        }
                    }
                } catch (resvErr) {
                    console.warn("[POST] Error updating sales_order_reservation status:", resvErr);
                }
            }

            // Fallback: for unfulfilled orders, if allLotReservations is still empty
            // (dbDetailIds was empty or the fetch returned no results), re-fetch
            // reservations directly using targetOrderId → sales_order_details → sales_order_reservation.
            if (isOrderUnfulfilled && allLotReservations.length === 0 && targetOrderId) {
                try {
                    const detailRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${targetOrderId}&limit=-1&fields=detail_id`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (detailRes.ok) {
                        const detailData: Array<{ detail_id: number }> = (await detailRes.json()).data || [];
                        const directDetailIds = detailData.map((d) => Number(d.detail_id)).filter(Boolean);
                        if (directDetailIds.length > 0) {
                            const retryResvRes = await fetch(
                                `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${directDetailIds.join(",")}&limit=-1`,
                                { headers: directusHeaders, cache: "no-store" }
                            );
                            if (retryResvRes.ok) {
                                allLotReservations = (await retryResvRes.json()).data || [];
                            }
                        }
                    }
                } catch (fallbackErr) {
                    console.warn("[POST] Fallback reservation fetch error:", fallbackErr);
                }
            }

            // Log discrepancy in unfulfilled_sales_transaction for returns, variances, unfulfilled, or concerns
            if (
                totalReturned > 0 ||
                totalMissing > 0 ||
                derivedStatus === "Unfulfilled / Returns" ||
                derivedStatus === "Fulfilled with Concerns"
            ) {
                try {
                    let unfulfilledId: number | null = null;
                    const finalUstInvoiceId = effectiveInvoiceId || Number(invoice_id || targetOrderId);

                    // Check if an unfulfilled_sales_transaction already exists for this sales_invoice_id (to avoid unique key constraint violation)
                    if (finalUstInvoiceId) {
                        try {
                            const existingUstRes = await fetch(
                                `${DIRECTUS_URL}/items/unfulfilled_sales_transaction?filter[sales_invoice_id][_eq]=${finalUstInvoiceId}&limit=1&fields=id`,
                                { headers: directusHeaders, cache: "no-store" }
                            );
                            if (existingUstRes.ok) {
                                const existingUstData = (await existingUstRes.json()).data;
                                if (existingUstData && existingUstData.length > 0) {
                                    unfulfilledId = Number(existingUstData[0].id);
                                    await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction/${unfulfilledId}`, {
                                        method: "PATCH",
                                        headers: directusHeaders,
                                        body: JSON.stringify({
                                            nte: typeof orderRemarks === "string" ? orderRemarks.trim() : "",
                                            isCleared: 1,
                                            checked_by: userId,
                                            date_acknowledged: phNow,
                                            variance_amount: totalReturned + totalMissing,
                                        }),
                                    }).catch(() => null);
                                }
                            }
                        } catch (checkErr) {
                            console.warn("[POST] Error checking existing unfulfilled_sales_transaction:", checkErr);
                        }
                    }

                    if (!unfulfilledId) {
                        const unfulfilledRes = await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction`, {
                            method: "POST",
                            headers: directusHeaders,
                            body: JSON.stringify({
                                sales_invoice_id: finalUstInvoiceId,
                                nte: typeof orderRemarks === "string" ? orderRemarks.trim() : "",
                                isCleared: 1,
                                checked_by: userId,
                                date_acknowledged: phNow,
                                date_created: phNow,
                                variance_amount: totalReturned + totalMissing,
                            }),
                        });
                        if (unfulfilledRes.ok) {
                            const unfulfilledHeader = (await unfulfilledRes.json()).data;
                            unfulfilledId = unfulfilledHeader?.id ? Number(unfulfilledHeader.id) : null;
                        } else {
                            const errText = await unfulfilledRes.text();
                            console.error(`[POST] Failed to create unfulfilled_sales_transaction: ${unfulfilledRes.status} ${errText}`);
                        }
                    }

                    if (unfulfilledId) {
                        // Lookup real sales_invoice_details by invoice_no to map product_id -> sales_invoice_detail_id
                        const invoiceDetailMap = new Map<number, number>();
                        if (finalUstInvoiceId) {
                            try {
                                const sidRes = await fetch(
                                    `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_eq]=${finalUstInvoiceId}&limit=-1&fields=detail_id,product_id`,
                                    { headers: directusHeaders, cache: "no-store" }
                                );
                                if (sidRes.ok) {
                                    const sidData: Array<{ detail_id: number; product_id: number }> = (await sidRes.json()).data || [];
                                    for (const sid of sidData) {
                                        if (sid.product_id && sid.detail_id) {
                                            invoiceDetailMap.set(Number(sid.product_id), Number(sid.detail_id));
                                        }
                                    }
                                }
                            } catch (sidErr) {
                                console.warn("[POST] Error fetching sales_invoice_details for UST mapping:", sidErr);
                            }
                        }

                        // Clean up existing details for this unfulfilled_sales_transaction_id to prevent duplicates on repeated clearance
                        try {
                            const existingDetailsRes = await fetch(
                                `${DIRECTUS_URL}/items/unfulfilled_sales_transaction_details?filter[unfulfilled_sales_transaction_id][_eq]=${unfulfilledId}&limit=-1&fields=id`,
                                { headers: directusHeaders, cache: "no-store" }
                            );
                            if (existingDetailsRes.ok) {
                                const existingDetails = (await existingDetailsRes.json()).data || [];
                                for (const det of existingDetails) {
                                    if (det.id) {
                                        await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction_details/${det.id}`, {
                                            method: "DELETE",
                                            headers: directusHeaders,
                                        }).catch(() => null);
                                    }
                                }
                            }
                        } catch (cleanErr) {
                            console.warn("[POST] Error cleaning up old unfulfilled details:", cleanErr);
                        }

                        for (const item of items) {
                            const sodId = Number(item.detail_id);
                            const prodId = Number(item.product_id);
                            const dbItem = dbDetailMap.get(sodId);
                            const rec = Number(item.received_quantity);
                            const ret = Number(item.returned_quantity);
                            const dbOrdered = dbItem ? Number(dbItem.ordered_quantity || 0) : rec + ret;
                            const expectedQty = item.invoiced_quantity !== undefined && item.invoiced_quantity !== null
                                ? Number(item.invoiced_quantity)
                                : dbOrdered;
                            const missing = Math.max(0, expectedQty - (rec + ret));

                            // If this item line has 0 returned, 0 missing, and no concerns, strictly skip detail insertion
                            if (ret <= 0 && missing <= 0 && !item.has_concern && derivedStatus !== "Fulfilled with Concerns") {
                                continue;
                            }

                            // Foreign key requires matching sales_invoice_details.detail_id or null
                            const validInvoiceDetailId = (prodId && invoiceDetailMap.get(prodId)) || null;

                            // 1. Check if client sent per-batch allocations in item.reservations
                            const clientReservations: Array<{
                                inventory_lot_id?: number;
                                returned_quantity?: number | string;
                                picked_quantity?: number | string;
                                product_id?: number;
                            }> = Array.isArray(item.reservations) ? item.reservations : [];
                            const allocatedClientResvs = clientReservations.filter(
                                (r) => Number(r.returned_quantity || 0) > 0 && r.inventory_lot_id
                            );

                            if (allocatedClientResvs.length > 0) {
                                // Insert detail rows using exact allocated returned_quantity per batch
                                for (const resv of allocatedClientResvs) {
                                    const allocQty = Number(resv.returned_quantity);
                                    if (allocQty <= 0) continue;
                                    const detailRes = await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction_details`, {
                                        method: "POST",
                                        headers: directusHeaders,
                                        body: JSON.stringify({
                                            unfulfilled_sales_transaction_id: unfulfilledId,
                                            sales_invoice_detail_id: validInvoiceDetailId,
                                            inventory_lot_id: resv.inventory_lot_id,
                                            product_id: resv.product_id || prodId || null,
                                            returned_quantity: allocQty,
                                            missing_quantity: allocQty,
                                            invoice_quantity: Number(resv.picked_quantity) || expectedQty,
                                            total_amount: 0,
                                        }),
                                    });
                                    if (!detailRes.ok) {
                                        const errText = await detailRes.text();
                                        console.error(`[POST] Failed to insert unfulfilled detail: ${detailRes.status} ${errText}`);
                                    }
                                }
                            } else if (ret > 0 || missing > 0 || item.has_concern || derivedStatus === "Fulfilled with Concerns") {
                                // Item-level variance without batch allocation or non-lot item
                                const detailRes = await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction_details`, {
                                    method: "POST",
                                    headers: directusHeaders,
                                    body: JSON.stringify({
                                        unfulfilled_sales_transaction_id: unfulfilledId,
                                        sales_invoice_detail_id: validInvoiceDetailId,
                                        inventory_lot_id: null,
                                        product_id: prodId || null,
                                        returned_quantity: ret,
                                        missing_quantity: ret + missing,
                                        invoice_quantity: expectedQty,
                                        total_amount: 0,
                                    }),
                                });
                                if (!detailRes.ok) {
                                    const errText = await detailRes.text();
                                    console.error(`[POST] Failed to insert non-lot unfulfilled detail: ${detailRes.status} ${errText}`);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn("[POST] Error logging unfulfilled transaction:", e);
                }
            }
        }

        // Update consolidator status to Completed
        await fetch(`${DIRECTUS_URL}/items/consolidator/${consolidator_id}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({
                status: "Completed",
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