import { DIRECTUS_URL, headers as directusHeaders } from "../directus-api";
import { resolveVersions } from "./version-resolver";
import { SPRING_API_BASE, getSpringAuthHeaders } from "./_auth";
import { getPhTimestamp } from "./_time-utils";
import type { MovementRow } from "./inventory-movements-client";

type ReservationStatus = "Pending" | "Reserved" | "Consumed" | "Released";

export interface InvoiceRow {
    invoice_id: number;
    invoice_no: string;
    invoice_date: string | null;
    customer_code: string;
    branch_id: number;
    transaction_status: string;
    isDispatched: boolean | null;
    total_amount?: number | null;
}

export interface DetailRow {
    detail_id: number;
    invoice_no: number;
    product_id: number;
    quantity: number;
    isSalesInvoiceDetail?: boolean;
}

interface InventoryLotRow {
    id: number;
    product_id: number;
    branch_id: number;
    lot_id: number | { lot_id: number; lot_name?: string | null } | null;
    lot_number?: string | null;
    batch_no?: string | null;
    expiry_date?: string | null;
    created_on?: string | null;
    quantity: number;
    qa_status: string;
    source_type?: string | null;
    source_reference?: string | null;
}

type StockLot = InventoryLotRow & { stockKey: string; versionId: number };

interface ReservationRow {
    id: number;
    sales_invoice_detail_id: number | DetailRow;
    inventory_lot_id: number | InventoryLotRow;
    quantity: number;
    status: ReservationStatus;
    created_at?: string | null;
}

function numericId(value: unknown, keys: string[] = ["id"]): number | null {
    if (typeof value === "number") return value;
    if (typeof value === "string") return Number(value) || null;
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const id = Number(record[key]);
            if (id) return id;
        }
    }
    return null;
}

function detailId(row: ReservationRow): number {
    return numericId(row.sales_invoice_detail_id, ["detail_id", "id"]) || 0;
}

function inventoryLotId(row: ReservationRow): number {
    return numericId(row.inventory_lot_id, ["id"]) || 0;
}

function batchNumber(batchNo?: string | null, lotNumber?: string | null): string {
    return String(batchNo || lotNumber || "LOT-N/A").trim() || "LOT-N/A";
}

function stockKey(productId: number, branchId: number, lotId: number, batchNo: string, versionId: number): string {
    return `${productId}:${branchId}:${lotId}:${batchNo}:${versionId}`;
}

function fefoCompare(a: InventoryLotRow, b: InventoryLotRow): number {
    return (a.expiry_date || "9999-12-31").localeCompare(b.expiry_date || "9999-12-31")
        || (a.created_on || "9999-12-31").localeCompare(b.created_on || "9999-12-31")
        || a.id - b.id;
}

interface POReceivingRow {
    product_id?: number | { product_id?: number } | null;
    batch_no?: string | null;
    lot_no?: string | null;
    qa_status?: string | null;
    expiry_date?: string | null;
    received_date?: string | null;
}

interface YieldLedgerRow {
    job_order_id?: {
        product_id?: number | null;
        job_order_no?: string | null;
    } | null;
    lot_number?: string | null;
    qa_status?: string | null;
    expiry_date?: string | null;
    logged_at?: string | null;
}

async function resolveLotsMetadata(productIds: number[], branchId?: number): Promise<{
    batchStatusMap: Map<string, string>;
    batchExpiryMap: Map<string, string>;
    batchCreatedMap: Map<string, string>;
}> {
    const batchStatusMap = new Map<string, string>();
    const batchExpiryMap = new Map<string, string>();
    const batchCreatedMap = new Map<string, string>();

    if (productIds.length > 0) {
        try {
            // 1. PO Receivings
            const branchFilter = branchId ? `&filter[branch_id][_eq]=${branchId}` : "";
            const recRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_in]=${productIds.join(",")}${branchFilter}&limit=-1`, { headers: directusHeaders, cache: "no-store" });
            if (recRes.ok) {
                const receipts: POReceivingRow[] = (await recRes.json()).data || [];
                receipts.forEach((rec) => {
                    const prodId = typeof rec.product_id === "object" ? rec.product_id?.product_id : rec.product_id;
                    const productId = Number(prodId);
                    const batchNo = String(rec.batch_no || rec.lot_no || "LOT-N/A").trim() || "LOT-N/A";
                    const key = `${productId}:${batchNo}`;
                    batchStatusMap.set(key, rec.qa_status || "Passed");
                    if (rec.expiry_date) batchExpiryMap.set(key, rec.expiry_date);
                    if (rec.received_date) batchCreatedMap.set(key, rec.received_date);
                });
            }
        } catch (err) {
            console.error("Error loading PO receipts for stock check:", err);
        }

        try {
            // 2. Yield Ledger
            const yieldRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][product_id][_in]=${productIds.join(",")}&fields=*,job_order_id.product_id,job_order_id.job_order_no&limit=-1`, { headers: directusHeaders, cache: "no-store" });
            if (yieldRes.ok) {
                const yields: YieldLedgerRow[] = (await yieldRes.json()).data || [];
                yields.forEach((yl) => {
                    const productId = Number(yl.job_order_id?.product_id);
                    if (!productId) return;
                    const batchNo = String(yl.lot_number || `MFG-${yl.job_order_id?.job_order_no}`).trim() || "LOT-N/A";
                    const key = `${productId}:${batchNo}`;
                    batchStatusMap.set(key, yl.qa_status || "Pending");
                    if (yl.expiry_date) batchExpiryMap.set(key, yl.expiry_date);
                    if (yl.logged_at) batchCreatedMap.set(key, yl.logged_at);
                });
            }
        } catch (err) {
            console.error("Error loading yield ledger for stock check:", err);
        }
    }

    return { batchStatusMap, batchExpiryMap, batchCreatedMap };
}

function canonicalStockLots(
    metadata: InventoryLotRow[],
    movements: MovementRow[],
    jobVersionMap: Map<string, number>,
    activeVersionMap: Map<number, number>,
    batchStatusMap: Map<string, string>,
    batchExpiryMap: Map<string, string>,
    batchCreatedMap: Map<string, string>,
): { lots: StockLot[]; keyByLotId: Map<number, string> } {
    // 1. Group movements and sum quantity by composite key: productId:branchId:physicalLotId:batchNo:versionId
    const quantityByKey = new Map<string, number>();

    for (const movement of movements) {
        const physicalLotId = Number(movement.lot_id);
        const productId = Number(movement.product_id);
        const branchId = Number(movement.branch_id);
        const batchNo = batchNumber(movement.batch_no);

        // Find the lot record matching this movement to resolve version
        const lot = metadata.find(l => 
            Number(l.product_id) === productId && 
            Number(l.branch_id) === branchId && 
            numericId(l.lot_id, ["lot_id"]) === physicalLotId && 
            batchNumber(l.batch_no, l.lot_number) === batchNo
        );

        const fallbackVersion = (lot?.source_reference && jobVersionMap.get(lot.source_reference))
            || activeVersionMap.get(productId) || 0;
        const versionId = Number(movement.version_id) || fallbackVersion;

        const key = stockKey(productId, branchId, physicalLotId, batchNo, versionId);
        quantityByKey.set(key, (quantityByKey.get(key) || 0) + Number(movement.quantity || 0));
    }

    // 2. Build the StockLot array
    const lotsByKey = new Map<string, StockLot>();
    const keyByLotId = new Map<number, string>();

    // Sort metadata by resolved expiry date and created_on using batchStatusMap/batchExpiryMap
    const sortedMetadata = [...metadata].map(lot => {
        const productId = Number(lot.product_id);
        const batchNo = batchNumber(lot.batch_no, lot.lot_number);
        const metaKey = `${productId}:${batchNo}`;
        
        return {
            ...lot,
            qa_status: batchStatusMap.get(metaKey) || lot.qa_status || "Pending",
            expiry_date: batchExpiryMap.get(metaKey) || lot.expiry_date || null,
            created_on: batchCreatedMap.get(metaKey) || lot.created_on || null
        };
    }).sort(fefoCompare);

    for (const lot of sortedMetadata) {
        const physicalLotId = numericId(lot.lot_id, ["lot_id"]) || Number(lot.id);
        if (!physicalLotId) continue;

        const productId = Number(lot.product_id);
        const branchId = Number(lot.branch_id);
        const batchNo = batchNumber(lot.batch_no, lot.lot_number);

        const fallbackVersion = (lot.source_reference && jobVersionMap.get(lot.source_reference))
            || activeVersionMap.get(productId) || 0;

        const matchingVersions = [...quantityByKey.keys()].filter((key) => key.startsWith(
            `${productId}:${branchId}:${physicalLotId}:${batchNo}:`
        ));

        for (const key of matchingVersions.length > 0 ? matchingVersions : [stockKey(productId, branchId, physicalLotId, batchNo, fallbackVersion)]) {
            keyByLotId.set(lot.id, key);
            
            // Include lot quantity from movements or metadata on-hand
            const qty = quantityByKey.has(key) ? (quantityByKey.get(key) || 0) : Number(lot.quantity || 0);
            if (qty > 0 && !lotsByKey.has(key)) {
                const versionId = Number(key.slice(key.lastIndexOf(":") + 1));
                lotsByKey.set(key, { 
                    ...lot, 
                    quantity: qty, 
                    stockKey: key, 
                    versionId 
                });
            }
        }
    }

    return { lots: [...lotsByKey.values()], keyByLotId };
}

async function directusJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
        ...init,
        headers: directusHeaders,
        cache: "no-store",
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Directus request failed (${response.status}): ${text}`);
    }
    return response.json();
}

export async function loadCandidateDocuments(documentIds: number[], _branchId?: number): Promise<{ invoices: InvoiceRow[]; details: DetailRow[] }> {
    void _branchId;
    if (!documentIds || documentIds.length === 0) {
        return { invoices: [], details: [] };
    }

    const [soRes, joRes] = await Promise.all([
        fetch(
            `${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${documentIds.join(",")}&limit=-1&fields=order_id,order_no,order_date,customer_code,branch_id,order_status,total_amount,net_amount`,
            { headers: directusHeaders, cache: "no-store" }
        ).catch(() => null),
        fetch(
            `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_id][_in]=${documentIds.join(",")}&limit=-1&fields=job_order_id,job_order_no,product_id,version_id,target_quantity,actual_quantity_produced,status,start_date,branch_id`,
            { headers: directusHeaders, cache: "no-store" }
        ).catch(() => null),
    ]);

    const soList: Array<{ order_id: number; order_no: string; order_date: string; customer_code: string; branch_id: number; order_status: string; total_amount?: number; net_amount?: number }> =
        soRes && soRes.ok ? (await soRes.json()).data || [] : [];
    const joList: Array<{ job_order_id: number; job_order_no: string; product_id: number; version_id: number; target_quantity: number; actual_quantity_produced: number; status: string; start_date?: string; branch_id: number }> =
        joRes && joRes.ok ? (await joRes.json()).data || [] : [];

    const unifiedInvoices: InvoiceRow[] = [];
    const unifiedDetails: DetailRow[] = [];

    // Map Sales Orders
    if (soList.length > 0) {
        for (const so of soList) {
            unifiedInvoices.push({
                invoice_id: Number(so.order_id),
                invoice_no: so.order_no,
                invoice_date: so.order_date,
                customer_code: so.customer_code,
                branch_id: Number(so.branch_id),
                transaction_status: so.order_status,
                isDispatched: false,
                total_amount: Number(so.net_amount || so.total_amount || 0),
            });
        }
        const sodRes = await fetch(
            `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${soList.map((s) => s.order_id).join(",")}&limit=-1&fields=detail_id,order_id,product_id,ordered_quantity`,
            { headers: directusHeaders, cache: "no-store" }
        ).catch(() => null);
        const sodList: Array<{ detail_id: number; order_id: number; product_id: number; ordered_quantity: number; quantity?: number }> =
            sodRes && sodRes.ok ? (await sodRes.json()).data || [] : [];
        for (const d of sodList) {
            const qty = Number(d.ordered_quantity || d.quantity || 0);
            if (qty > 0) {
                unifiedDetails.push({
                    detail_id: Number(d.detail_id),
                    invoice_no: Number(d.order_id),
                    product_id: Number(d.product_id),
                    quantity: qty,
                    isSalesInvoiceDetail: false,
                });
            }
        }
    }

    // Map Job Orders
    if (joList.length > 0) {
        for (const jo of joList) {
            unifiedInvoices.push({
                invoice_id: Number(jo.job_order_id),
                invoice_no: jo.job_order_no,
                invoice_date: jo.start_date || "",
                customer_code: "INTERNAL",
                branch_id: Number(jo.branch_id),
                transaction_status: jo.status,
                isDispatched: false,
            });
            const qty = Number(jo.actual_quantity_produced || jo.target_quantity || 0);
            if (qty > 0) {
                unifiedDetails.push({
                    detail_id: Number(jo.job_order_id),
                    invoice_no: Number(jo.job_order_id),
                    product_id: Number(jo.product_id),
                    quantity: qty,
                    isSalesInvoiceDetail: false,
                });
            }
        }
    }

    return { invoices: unifiedInvoices, details: unifiedDetails };
}

async function fetchEligibleInvoices(branchId: number): Promise<InvoiceRow[]> {
    const filter: Record<string, unknown> = {
        _and: [
            { branch_id: { _eq: branchId } },
            { order_status: { _in: ["For Consolidation", "For Production", "For Picking"] } },
        ],
    };
    const query = new URLSearchParams({
        filter: JSON.stringify(filter),
        fields: "order_id,order_no,order_date,customer_code,branch_id,order_status",
        sort: "-order_date,-order_id",
        limit: "-1",
    });
    const soJson = await directusJson(`${DIRECTUS_URL}/items/sales_order?${query.toString()}`).catch(() => ({ data: [] }));
    let salesOrders: Array<Record<string, unknown>> = soJson.data || [];

    const consolidatorJson = await directusJson(
        `${DIRECTUS_URL}/items/consolidator?limit=-1&fields=id,status,is_delete`
    ).catch(() => ({ data: [] }));
    const activeConsolidatorIds = ((consolidatorJson.data || []) as Array<{ id: number; status: string; is_delete?: number | boolean }>)
        .filter((c) => !c.is_delete && ["Pending", "Picking", "Picked", "Audited"].includes(c.status))
        .map((c) => Number(c.id))
        .filter(Boolean);

    let linkedIds = new Set<number>();
    if (activeConsolidatorIds.length > 0) {
        const linkedJson = await directusJson(
            `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_in]=${activeConsolidatorIds.join(",")}&fields=invoice_id&limit=-1`
        ).catch(() => ({ data: [] }));
        linkedIds = new Set<number>((linkedJson.data || []).map((row: { invoice_id: number }) => Number(row.invoice_id)));
    }
    salesOrders = salesOrders.filter((so) => !linkedIds.has(Number(so.order_id)));

    return salesOrders.map((so) => ({
        invoice_id: Number(so.order_id),
        invoice_no: String(so.order_no),
        invoice_date: so.order_date as string | null,
        customer_code: String(so.customer_code),
        branch_id: Number(so.branch_id),
        transaction_status: String(so.order_status),
        isDispatched: false,
    }));
}

export async function getInvoiceReservationSummaries(branchId: number, search?: string) {
    const invoices = await fetchEligibleInvoices(branchId);
    if (invoices.length === 0) return [];

    const invoiceIds = invoices.map((invoice) => invoice.invoice_id);
    const { details } = await loadCandidateDocuments(invoiceIds, branchId);
    const detailIds = details.map((detail) => detail.detail_id);

    let reservations: ReservationRow[] = [];
    if (detailIds.length > 0) {
        const soFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { sales_order_detail_id: { _in: detailIds } },
                { status: { _eq: "Reserved" } },
            ],
        }));
        const siFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { sales_invoice_detail_id: { _in: detailIds } },
                { status: { _eq: "Reserved" } },
            ],
        }));
        const [soRes, siRes] = await Promise.all([
            directusJson(`${DIRECTUS_URL}/items/sales_order_reservation?filter=${soFilter}&fields=reservation_id,sales_order_detail_id,inventory_lot_id,reserved_quantity,status&limit=-1`).catch(() => ({ data: [] })),
            directusJson(`${DIRECTUS_URL}/items/sales_invoice_reservation?filter=${siFilter}&fields=id,sales_invoice_detail_id,inventory_lot_id,quantity,status&limit=-1`).catch(() => ({ data: [] })),
        ]);
        const mappedSo: ReservationRow[] = (soRes.data || []).map((r: { reservation_id?: number; id?: number; sales_order_detail_id: number; inventory_lot_id: number; reserved_quantity?: number; quantity?: number; status: ReservationStatus }) => ({
            id: Number(r.reservation_id || r.id),
            sales_invoice_detail_id: r.sales_order_detail_id,
            inventory_lot_id: r.inventory_lot_id,
            quantity: Number(r.reserved_quantity ?? r.quantity ?? 0),
            status: r.status,
        }));
        reservations = [...mappedSo, ...(siRes.data || [])];
    }

    const productIds = [...new Set(details.map((detail) => Number(detail.product_id)).filter(Boolean))];
    const productMap = new Map<number, { product_name: string; product_code: string }>();
    if (productIds.length > 0) {
        const productJson = await directusJson(
            `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,product_code&limit=-1`
        );
        for (const product of productJson.data || []) {
            productMap.set(Number(product.product_id), product);
        }
    }

    const [invLotsJson, lotsJson] = await Promise.all([
        productIds.length > 0
            ? directusJson(`${DIRECTUS_URL}/items/mm_inventory_lots?filter[product_id][_in]=${productIds.join(",")}&fields=*&limit=-1`).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        directusJson(`${DIRECTUS_URL}/items/mm_lots?limit=-1&fields=*`).catch(() => ({ data: [] })),
    ]);

    const lotNameMap = new Map<number, string>();
    for (const lot of (lotsJson.data || []) as Array<Record<string, unknown>>) {
        const lid = Number(lot.lot_id || lot.id);
        const lname = String(lot.lot_name || lot.name || lot.lot_number || "").trim();
        if (lid && lname) lotNameMap.set(lid, lname);
    }

    const invLotMetaMap = new Map<number, { lotId: number; lotName: string; batchNo: string; expiryDate: string | null }>();
    const productBatchMap = new Map<number, { lotId: number; lotName: string; batchNo: string; expiryDate: string | null }[]>();
    for (const row of (invLotsJson.data || []) as Array<Record<string, unknown>>) {
        const invId = Number(row.inventory_lot_id || row.id || 0);
        const pId = Number(typeof row.product_id === "object" && row.product_id !== null ? (row.product_id as { product_id?: number }).product_id : row.product_id || 0);
        const rawLotId = typeof row.lot_id === "object" && row.lot_id !== null
            ? (row.lot_id as { lot_id?: number; id?: number }).lot_id || (row.lot_id as { lot_id?: number; id?: number }).id
            : row.lot_id;
        const lotId = Number(rawLotId || 0);
        const lotName = lotNameMap.get(lotId) || (lotId ? lotNameMap.get(lotId) : undefined) || "Unknown";
        const batchNo = String(row.batch_no || (row as { lot_number?: string }).lot_number || "LOT-N/A");
        const expiryDate = (row.expiry_date || row.expiration_date || null) as string | null;

        const meta = { lotId, lotName, batchNo, expiryDate };
        if (invId) invLotMetaMap.set(invId, meta);
        if (lotId && !invLotMetaMap.has(lotId)) invLotMetaMap.set(lotId, meta);
        if (pId) {
            const list = productBatchMap.get(pId) || [];
            list.push(meta);
            productBatchMap.set(pId, list);
        }
    }

    const customerCodes = [...new Set(invoices.map((invoice) => invoice.customer_code).filter(Boolean))];
    const customerMap = new Map<string, string>();
    if (customerCodes.length > 0) {
        const customerFilter = encodeURIComponent(JSON.stringify({ customer_code: { _in: customerCodes } }));
        const customerJson = await directusJson(
            `${DIRECTUS_URL}/items/customer?filter=${customerFilter}&fields=customer_code,customer_name&limit=-1`
        );
        for (const customer of customerJson.data || []) {
            customerMap.set(String(customer.customer_code), customer.customer_name);
        }
    }

    const reservationsByDetail = new Map<number, ReservationRow[]>();
    for (const reservation of reservations) {
        const id = detailId(reservation);
        const rows = reservationsByDetail.get(id) || [];
        rows.push(reservation);
        reservationsByDetail.set(id, rows);
    }

    const summaries = invoices.map((invoice) => {
        const invoiceDetails = details.filter((detail) => Number(detail.invoice_no) === Number(invoice.invoice_id));
        const mappedDetails = invoiceDetails.map((detail) => {
            const rows = reservationsByDetail.get(detail.detail_id) || [];
            const requiredQuantity = Number(detail.quantity || 0);
            const reservedQuantity = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
            const product = productMap.get(Number(detail.product_id));

            return {
                detailId: detail.detail_id,
                productId: Number(detail.product_id),
                productName: product?.product_name || `Product #${detail.product_id}`,
                productCode: product?.product_code || "",
                requiredQuantity,
                reservedQuantity,
                shortageQuantity: Math.max(0, requiredQuantity - reservedQuantity),
                allocations: rows.map((row) => {
                    const invId = inventoryLotId(row);
                    const pId = Number(detail.product_id);
                    let meta = invLotMetaMap.get(invId);
                    if (!meta || meta.batchNo === "LOT-N/A") {
                        const pBatches = productBatchMap.get(pId) || [];
                        if (pBatches.length > 0) meta = pBatches[0];
                    }

                    return {
                        id: row.id,
                        inventoryLotId: invId,
                        lotName: meta?.lotName || "Unassigned",
                        batchNo: meta?.batchNo || "LOT-N/A",
                        expiryDate: meta?.expiryDate || null,
                        quantity: Number(row.quantity || 0),
                        status: row.status,
                    };
                }),
            };
        });

        const requiredQuantity = mappedDetails.reduce((sum, detail) => sum + detail.requiredQuantity, 0);
        const reservedQuantity = mappedDetails.reduce((sum, detail) => sum + detail.reservedQuantity, 0);
        const fullyReservedDetails = mappedDetails.filter((detail) => detail.shortageQuantity <= 0).length;
        const status = reservedQuantity <= 0
            ? "Unallocated"
            : fullyReservedDetails === mappedDetails.length && mappedDetails.length > 0
                ? "Reserved"
                : "Partial";

        return {
            invoiceId: invoice.invoice_id,
            invoiceNo: invoice.invoice_no,
            invoiceDate: invoice.invoice_date,
            customerName: customerMap.get(invoice.customer_code) || invoice.customer_code || "Unknown Customer",
            branchId: Number(invoice.branch_id),
            totalDetails: mappedDetails.length,
            fullyReservedDetails,
            requiredQuantity,
            reservedQuantity,
            status,
            details: mappedDetails,
        };
    });

    const normalizedSearch = search?.trim().toLowerCase();
    return normalizedSearch
        ? summaries.filter((invoice) =>
            invoice.invoiceNo.toLowerCase().includes(normalizedSearch)
            || invoice.customerName.toLowerCase().includes(normalizedSearch)
        )
        : summaries;
}

interface MasterLotRow {
    lot_id: number;
    lot_name?: string | null;
    branch_id?: number | null;
    batch_no?: string | null;
    expiry_date?: string | null;
    created_on?: string | null;
}

async function fetchLotsAndMovements(productIds: number[], branchId?: number): Promise<{
    synthesizedLots: InventoryLotRow[];
    movements: MovementRow[];
}> {
    if (productIds.length === 0) {
        return { synthesizedLots: [], movements: [] };
    }

    const springHeaders = await getSpringAuthHeaders();

    // 1. Fetch Directus mm_lots, mm_inventory_lots, and Spring Boot batch on-hand in parallel
    const [lotRes, invLotRes, springBatchRes] = await Promise.all([
        fetch(`${DIRECTUS_URL}/items/mm_lots?limit=-1&fields=*`, {
            headers: directusHeaders,
            cache: "no-store",
        }).catch(() => null),
        fetch(
            `${DIRECTUS_URL}/items/mm_inventory_lots?limit=-1&fields=*`,
            { headers: directusHeaders, cache: "no-store" }
        ).catch(() => null),
        fetch(`${SPRING_API_BASE}/api/mm-batch-onhand/all`, {
            headers: springHeaders,
            cache: "no-store",
        }).catch(() => null),
    ]);

    if (!springBatchRes || !springBatchRes.ok) {
        console.error(`[Consolidation Stock] Failed to fetch batch on-hand from ${SPRING_API_BASE}/api/mm-batch-onhand/all, status: ${springBatchRes?.status}`);
        throw new Error(
            `Spring Boot inventory service error (${springBatchRes ? `HTTP ${springBatchRes.status}` : "Unreachable"}). Unable to fetch live stock from Spring Boot.`
        );
    }

    const masterLotMap = new Map<number, MasterLotRow>();
    if (lotRes && lotRes.ok) {
        const lotData: Array<MasterLotRow & { id?: number; name?: string }> = (await lotRes.json()).data || [];
        for (const l of lotData) {
            const lid = Number(l.lot_id || l.id);
            const lotName = String(l.lot_name || l.name || "").trim();
            const standardizedLot = {
                ...l,
                lot_id: lid,
                lot_name: lotName || "Unknown",
            };
            if (lid) masterLotMap.set(lid, standardizedLot);
        }
    }

    let springBatchOnhand: Array<{
        branchId: number;
        inventoryLotId?: number;
        lotId: number;
        productId: number;
        batchNo?: string;
        inventoryCondition?: string;
        onhandQuantity: number;
    }> = [];
    try {
        const sbJson = await springBatchRes.json();
        springBatchOnhand = Array.isArray(sbJson) ? sbJson : sbJson?.data || [];
    } catch (err) {
        console.error("[Consolidation Stock] Failed to parse Spring Boot batch on-hand response:", err);
        throw new Error("Spring Boot inventory service returned invalid JSON for batch on-hand.");
    }

    // Build lookup for existing mm_inventory_lots IDs in Directus
    const mmInvLots: Array<Record<string, unknown>> = invLotRes && invLotRes.ok ? (await invLotRes.json()).data || [] : [];
    const directusBatchLookup = new Map<string, number>();
    const invLotPhysicalLotMap = new Map<number, number>();
    const invLotPhysicalLotObjMap = new Map<number, { lot_id: number; lot_name: string }>();

    for (const row of mmInvLots) {
        const id = Number(row.inventory_lot_id || row.id);
        const pId = Number(typeof row.product_id === "object" ? (row.product_id as { product_id?: number })?.product_id : row.product_id);
        const rawBatchStr = String(row.batch_no || (row as { lot_number?: string }).lot_number || "").trim();
        const rawLotId = typeof row.lot_id === "object" && row.lot_id !== null
            ? (row.lot_id as { lot_id?: number; id?: number }).lot_id || (row.lot_id as { lot_id?: number; id?: number }).id
            : row.lot_id;
        const physLotId = Number(rawLotId || 0);

        if (id && physLotId) {
            invLotPhysicalLotMap.set(id, physLotId);
            const mLot = masterLotMap.get(physLotId);
            if (mLot) {
                invLotPhysicalLotObjMap.set(id, { lot_id: mLot.lot_id, lot_name: mLot.lot_name || "Unknown" });
            }
        }

        if (id && pId && rawBatchStr) {
            const parts = rawBatchStr.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
            for (const part of parts) {
                if (!directusBatchLookup.has(`${pId}:${part}`)) {
                    directusBatchLookup.set(`${pId}:${part}`, id);
                }
            }
        }
    }

    const productIdSet = new Set(productIds);
    const synthesizedLots: InventoryLotRow[] = [];
    const seenStockKeys = new Set<string>();

    // 1. Process Spring Boot batch onhand records
    for (const sb of springBatchOnhand as Array<Record<string, unknown>>) {
        const pId = Number(sb.productId ?? sb.product_id ?? (sb.product as { product_id?: number })?.product_id ?? 0);
        const bId = Number(sb.branchId ?? sb.branch_id ?? (sb.branch as { branch_id?: number })?.branch_id ?? 0);
        const lId = Number(sb.lotId ?? sb.lot_id ?? (sb.lot as { lot_id?: number })?.lot_id ?? 0);
        const rawBatchStr = String(sb.batchNo ?? sb.batch_no ?? "").trim() || "LOT-N/A";
        const batchList = rawBatchStr.includes(",") ? rawBatchStr.split(",").map((s) => s.trim()).filter(Boolean) : [rawBatchStr];
        const onhandTotal = Number(sb.onhandQuantity ?? sb.onhand_quantity ?? sb.quantity ?? 0);
        const invLotId = Number(sb.inventoryLotId ?? sb.inventory_lot_id ?? sb.id ?? 0);

        if (branchId && bId && bId !== branchId) continue;
        if (!pId || !productIdSet.has(pId)) continue;
        if (onhandTotal <= 0) continue;

        const masterLot = masterLotMap.get(lId);
        const expDate = String(sb.expirationDate || sb.expiration_date || sb.expiryDate || sb.expiry_date || "") || null;
        const mfgDate = String(sb.manufacturingDate || sb.manufacturing_date || "") || null;
        const condition = String(sb.inventoryCondition || sb.inventory_condition || "Passed");
        const onhandPerBatch = batchList.length > 1 ? onhandTotal / batchList.length : onhandTotal;

        for (const bNo of batchList) {
            let resolvedInvLotId = (invLotId > 0 ? invLotId : 0)
                || directusBatchLookup.get(`${pId}:${bNo.toUpperCase()}`)
                || 0;

            if (!resolvedInvLotId) {
                // Query existing mm_inventory_lots by batch_no
                const findRes = await fetch(
                    `${DIRECTUS_URL}/items/mm_inventory_lots?filter[batch_no][_eq]=${encodeURIComponent(bNo)}&limit=1&fields=inventory_lot_id,id,lot_id`,
                    { headers: directusHeaders, cache: "no-store" }
                ).catch(() => null);
                if (findRes && findRes.ok) {
                    const findJson = await findRes.json();
                    const firstRow = findJson?.data?.[0];
                    resolvedInvLotId = Number(firstRow?.inventory_lot_id || firstRow?.id || 0);
                    if (resolvedInvLotId) {
                        directusBatchLookup.set(`${pId}:${bNo.toUpperCase()}`, resolvedInvLotId);
                        const rawPhys = typeof firstRow.lot_id === "object" && firstRow.lot_id !== null
                            ? (firstRow.lot_id as { lot_id?: number; id?: number }).lot_id || (firstRow.lot_id as { lot_id?: number; id?: number }).id
                            : firstRow.lot_id;
                        const phys = Number(rawPhys || 0);
                        if (phys) {
                            invLotPhysicalLotMap.set(resolvedInvLotId, phys);
                            const mLot = masterLotMap.get(phys);
                            if (mLot) invLotPhysicalLotObjMap.set(resolvedInvLotId, { lot_id: mLot.lot_id, lot_name: mLot.lot_name || "Unknown" });
                        }
                    }
                }
            }

            if (!resolvedInvLotId) {
                // This record from batch-onhand is a document reference (e.g. JO yield/SO transaction)
                // and does not correspond to a storage lot in mm_inventory_lots. Skip it.
                continue;
            }

            const stockKey = `${pId}:${bId}:${lId}:${bNo.toUpperCase()}`;
            seenStockKeys.add(stockKey);

            const resolvedMasterLot = masterLot
                || invLotPhysicalLotObjMap.get(resolvedInvLotId)
                || masterLotMap.get(invLotPhysicalLotMap.get(resolvedInvLotId) || 0)
                || (resolvedInvLotId ? masterLotMap.get(resolvedInvLotId) : undefined);
            const resolvedLotName = resolvedMasterLot?.lot_name
                || (lId && masterLotMap.has(lId) ? masterLotMap.get(lId)?.lot_name : undefined)
                || "Unknown";
            const finalLotId = resolvedMasterLot?.lot_id || lId || resolvedInvLotId || 0;

            synthesizedLots.push({
                id: resolvedInvLotId,
                product_id: pId,
                branch_id: bId || branchId || 0,
                lot_id: { lot_id: finalLotId, lot_name: resolvedLotName },
                lot_number: bNo,
                batch_no: bNo,
                quantity: onhandPerBatch,
                qa_status: condition === "Passed" || condition === "GOOD" ? "Approved" : "Quarantine",
                expiry_date: expDate,
                created_on: mfgDate,
                source_type: null,
                source_reference: (sb.sourceReference as string | null) || (sb.source_reference as string | null) || null,
            });
        }
    }

    return { synthesizedLots, movements: [] };
}

async function createReservationsInDirectus(rows: Array<{
    sales_order_detail_id?: number | null;
    sales_invoice_detail_id?: number | null;
    product_id: number;
    inventory_lot_id: number;
    lot_id?: number;
    batch_no?: string;
    reserved_quantity: number;
    quantity: number;
    status: string;
    created_by: number;
    created_at: string;
    updated_by: number;
    updated_at: string;
}>): Promise<number[]> {
    if (rows.length === 0) return [];
    
    // Ensure all inventory_lot_id values exist in mm_inventory_lots
    const pIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))];
    const invLotsRes = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots?filter[product_id][_in]=${pIds.join(",")}&limit=-1&fields=inventory_lot_id,id,product_id,lot_id,batch_no`, { headers: directusHeaders, cache: "no-store" }).catch(() => null);
    const existingInvLots: Array<{ inventory_lot_id: number; id?: number; product_id: number; lot_id: number; batch_no: string }> = invLotsRes && invLotsRes.ok ? (await invLotsRes.json()).data || [] : [];
    
    const validInvLotIds = new Set(existingInvLots.map((r) => Number(r.inventory_lot_id || r.id)));
    const invByProdAndBatch = new Map<string, number>();
    for (const r of existingInvLots) {
        const id = Number(r.inventory_lot_id || r.id);
        const p = Number(r.product_id);
        const rawBatchStr = String(r.batch_no || "").trim().toUpperCase();
        if (p && rawBatchStr) {
            const parts = rawBatchStr.split(",").map((s) => s.trim()).filter(Boolean);
            for (const part of parts) {
                if (!invByProdAndBatch.has(`${p}:${part}`)) {
                    invByProdAndBatch.set(`${p}:${part}`, id);
                }
            }
        }
    }

    const sanitizedRows = [];
    for (const r of rows) {
        let invId = r.inventory_lot_id;
        const bNo = String(r.batch_no || "").trim();
        if (!validInvLotIds.has(invId)) {
            if (bNo && invByProdAndBatch.has(`${r.product_id}:${bNo.toUpperCase()}`)) {
                invId = invByProdAndBatch.get(`${r.product_id}:${bNo.toUpperCase()}`)!;
            } else if (bNo) {
                // Check if lot exists across all products by batch_no
                const findRes = await fetch(
                    `${DIRECTUS_URL}/items/mm_inventory_lots?filter[batch_no][_eq]=${encodeURIComponent(bNo)}&limit=1&fields=inventory_lot_id,id`,
                    { headers: directusHeaders, cache: "no-store" }
                ).catch(() => null);
                if (findRes && findRes.ok) {
                    const findJson = await findRes.json();
                    invId = Number(findJson?.data?.[0]?.inventory_lot_id || findJson?.data?.[0]?.id || 0);
                    if (invId) {
                        validInvLotIds.add(invId);
                        invByProdAndBatch.set(`${r.product_id}:${bNo.toUpperCase()}`, invId);
                    }
                }
            }
        }
        if (!invId || (!validInvLotIds.has(invId) && invId <= 0)) {
            throw new Error(`Cannot reserve stock: inventory lot for batch "${bNo}" does not exist in collection "mm_inventory_lots"`);
        }
        sanitizedRows.push({ ...r, inventory_lot_id: invId });
    }

    // Post to sales_order_reservation directly and fail fast if error occurs
    const soPayload = sanitizedRows.map((r) => ({
        sales_order_detail_id: r.sales_order_detail_id || 0,
        product_id: r.product_id || 0,
        inventory_lot_id: r.inventory_lot_id,
        reserved_quantity: r.reserved_quantity,
        status: r.status,
        created_by: r.created_by,
        created_at: r.created_at,
        updated_by: r.updated_by,
        updated_at: r.updated_at,
    }));

    const res = await directusJson(`${DIRECTUS_URL}/items/sales_order_reservation`, {
        method: "POST",
        body: JSON.stringify(soPayload),
    });

    // Update sales_order_details.allocated_quantity and modified_date
    const phNow = getPhTimestamp();
    const qtyByDetail = new Map<number, number>();
    for (const r of sanitizedRows) {
        const dId = Number(r.sales_order_detail_id);
        if (dId > 0) {
            qtyByDetail.set(dId, (qtyByDetail.get(dId) || 0) + Number(r.reserved_quantity || 0));
        }
    }
    await Promise.all(
        Array.from(qtyByDetail.entries()).map(([detailId, allocatedQty]) =>
            directusJson(`${DIRECTUS_URL}/items/sales_order_details/${detailId}`, {
                method: "PATCH",
                body: JSON.stringify({
                    allocated_quantity: allocatedQty,
                    modified_date: phNow,
                }),
            }).catch((err) => console.warn(`Failed to update sales_order_details ${detailId}:`, err))
        )
    );

    return (res.data || []).map((row: { reservation_id?: number; id?: number }) => Number(row.reservation_id || row.id)).filter(Boolean);
}

export async function allocateInvoice(invoiceId: number, userId: number) {
    const { invoices, details } = await loadCandidateDocuments([invoiceId]);
    const invoice: InvoiceRow | undefined = invoices[0];
    if (!invoice) throw new Error("Document not found");

    const linkedJson = await directusJson(
        `${DIRECTUS_URL}/items/consolidator_invoices?filter[invoice_id][_eq]=${invoiceId}&filter[consolidator_id][is_delete][_eq]=0&fields=id&limit=1`
    ).catch(() => ({ data: [] }));
    if ((linkedJson.data || []).length > 0) {
        throw new Error("Document is already linked to a consolidation batch");
    }

    if (details.length === 0) throw new Error("Document has no product details");

    let customerId = 1;
    if (invoice.customer_code && invoice.customer_code !== "INTERNAL") {
        const customerFilter = encodeURIComponent(JSON.stringify({ customer_code: { _eq: invoice.customer_code } }));
        const customerJson = await directusJson(
            `${DIRECTUS_URL}/items/customer?filter=${customerFilter}&fields=id&limit=1`
        ).catch(() => ({ data: [] }));
        customerId = Number(customerJson.data?.[0]?.id || 1);
    }

    const pairs = details.map((detail) => ({ customerId, productId: Number(detail.product_id) }));
    const demandVersionMap = await resolveVersions(pairs);

    const productIds = [...new Set(details.map((detail) => Number(detail.product_id)))];
    const branchId = Number(invoice.branch_id);
    const { synthesizedLots: unfilteredLots, movements } = await fetchLotsAndMovements(productIds, branchId);
    const jobOrderNumbers = [...new Set(unfilteredLots.map((lot) => lot.source_reference).filter(Boolean))] as string[];
    const jobVersionMap = new Map<string, number>();
    if (jobOrderNumbers.length > 0) {
        const joFilter = encodeURIComponent(JSON.stringify({ job_order_no: { _in: jobOrderNumbers } }));
        const joJson = await directusJson(
            `${DIRECTUS_URL}/items/manufacturing_job_orders?filter=${joFilter}&fields=job_order_no,version_id&limit=-1`
        ).catch(() => ({ data: [] }));
        for (const jobOrder of joJson.data || []) {
            if (jobOrder.job_order_no && jobOrder.version_id) {
                jobVersionMap.set(String(jobOrder.job_order_no), Number(jobOrder.version_id));
            }
        }
    }

    const activeFilter = encodeURIComponent(JSON.stringify({
        _and: [
            { product_id: { _in: productIds } },
            { status: { _eq: "Active" } },
        ],
    }));
    const activeJson = await directusJson(
        `${DIRECTUS_URL}/items/product_manufacturing_version?filter=${activeFilter}&fields=product_id,version_id&limit=-1`
    ).catch(() => ({ data: [] }));
    const activeVersionMap = new Map<number, number>();
    for (const version of activeJson.data || []) {
        const productId = Number(version.product_id);
        if (!activeVersionMap.has(productId)) activeVersionMap.set(productId, Number(version.version_id));
    }

    const metaRes = await resolveLotsMetadata(productIds, branchId);
    const { lots, keyByLotId } = canonicalStockLots(unfilteredLots, movements, jobVersionMap, activeVersionMap, metaRes.batchStatusMap, metaRes.batchExpiryMap, metaRes.batchCreatedMap);

    const lotIds = unfilteredLots.map((lot) => lot.id);
    const reservedByStock = new Map<string, number>();
    const reservedByDetail = new Map<number, number>();
    if (lotIds.length > 0) {
        const reservationFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { inventory_lot_id: { _in: lotIds } },
                { status: { _eq: "Reserved" } },
            ],
        }));
        const activeReservationsJson = await directusJson(
            `${DIRECTUS_URL}/items/sales_invoice_reservation?filter=${reservationFilter}&fields=id,sales_invoice_detail_id,inventory_lot_id,quantity,status&limit=-1`
        ).catch(() => ({ data: [] }));
        for (const reservation of (activeReservationsJson.data || []) as ReservationRow[]) {
            const lotId = inventoryLotId(reservation);
            const detId = detailId(reservation);
            const key = keyByLotId.get(lotId);
            if (key) reservedByStock.set(key, (reservedByStock.get(key) || 0) + Number(reservation.quantity || 0));
            reservedByDetail.set(detId, (reservedByDetail.get(detId) || 0) + Number(reservation.quantity || 0));
        }
    }

    const availableByLot = new Map<number, number>();
    for (const lot of lots) {
        availableByLot.set(lot.id, Math.max(0, Number(lot.quantity || 0) - (reservedByStock.get(lot.stockKey) || 0)));
    }

    const now = getPhTimestamp();
    const pendingRows: Array<{
        sales_order_detail_id?: number | null;
        sales_invoice_detail_id?: number | null;
        product_id: number;
        inventory_lot_id: number;
        lot_id?: number;
        batch_no?: string;
        reserved_quantity: number;
        quantity: number;
        status: string;
        created_by: number;
        created_at: string;
        updated_by: number;
        updated_at: string;
    }> = [];
    for (const detail of details) {
        let remaining = Math.max(0, Number(detail.quantity || 0) - (reservedByDetail.get(detail.detail_id) || 0));
        if (remaining <= 0) continue;

        const targetVersion = demandVersionMap.get(`${customerId}:${Number(detail.product_id)}`)?.versionId ?? null;
        const matchingLots = lots
            .filter((lot) => {
                if (Number(lot.product_id) !== Number(detail.product_id)) return false;
                if ((availableByLot.get(lot.id) || 0) <= 0) return false;
                if (targetVersion && lot.versionId && lot.versionId !== targetVersion) return false;
                return true;
            })
            .sort(fefoCompare);

        for (const lot of matchingLots) {
            if (remaining <= 0) break;
            const available = availableByLot.get(lot.id) || 0;
            const quantity = Math.min(remaining, available);
            if (quantity <= 0) continue;
            const rawLotId = numericId(lot.lot_id, ["lot_id"]) || 0;
            pendingRows.push({
                sales_order_detail_id: detail.detail_id,
                sales_invoice_detail_id: detail.isSalesInvoiceDetail ? detail.detail_id : null,
                product_id: Number(detail.product_id),
                inventory_lot_id: lot.id,
                lot_id: rawLotId,
                batch_no: lot.batch_no || lot.lot_number || undefined,
                reserved_quantity: quantity,
                quantity,
                status: "Reserved",
                created_by: userId,
                created_at: now,
                updated_by: userId,
                updated_at: now,
            });
            availableByLot.set(lot.id, available - quantity);
            remaining -= quantity;
        }
    }

    const createdReservationIds: number[] = await createReservationsInDirectus(pendingRows);
    return { created: createdReservationIds.length, createdReservationIds };
}

export async function releaseReservationIds(reservationIds: number[], userId: number): Promise<boolean> {
    if (reservationIds.length === 0) return true;
    const now = getPhTimestamp();
    const results = await Promise.all(reservationIds.map(async (id) => {
        try {
            await directusJson(`${DIRECTUS_URL}/items/sales_order_reservation/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: "Released", updated_by: userId, updated_at: now }),
            });
            return true;
        } catch {
            try {
                await directusJson(`${DIRECTUS_URL}/items/sales_invoice_reservation/${id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: "Released", updated_by: userId, updated_at: now }),
                });
                return true;
            } catch {
                return false;
            }
        }
    }));
    return results.every(Boolean);
}

export async function allocateInvoicesForConsolidation(invoiceIds: number[], userId: number) {
    const createdReservationIds: number[] = [];

    try {
        for (const invoiceId of invoiceIds) {
            const result = await allocateInvoice(invoiceId, userId);
            createdReservationIds.push(...result.createdReservationIds);
        }

        const { details } = await loadCandidateDocuments(invoiceIds);
        if (details.length === 0) throw new Error("Selected documents have no product details");

        return { createdReservationIds };
    } catch (error) {
        await releaseReservationIds(createdReservationIds, userId);
        throw error;
    }
}

export interface CustomAllocationInput {
    productId: number;
    inventoryLotId: number;
    lotId: number;
    batchNo: string;
    quantity: number;
}

export async function allocateInvoicesWithCustomAllocations(
    invoiceIds: number[],
    customAllocations: CustomAllocationInput[],
    userId: number
) {
    const createdReservationIds: number[] = [];

    try {
        const { details } = await loadCandidateDocuments(invoiceIds);
        if (details.length === 0) throw new Error("Selected documents have no product details");

        // Clone custom allocations pool
        const allocPool = customAllocations.map((a) => ({ ...a }));
        const now = getPhTimestamp();
        const pendingRows: Array<{
            sales_order_detail_id?: number | null;
            sales_invoice_detail_id: number | null;
            product_id: number;
            inventory_lot_id: number;
            lot_id?: number;
            batch_no?: string;
            reserved_quantity: number;
            quantity: number;
            status: string;
            created_by: number;
            created_at: string;
            updated_by: number;
            updated_at: string;
        }> = [];

        // Distribute custom allocations to details
        for (const detail of details) {
            const pId = Number(detail.product_id);
            let remaining = Number(detail.quantity || 0);

            // First check if matching invoiceDetailId or invoiceId
            for (const item of allocPool) {
                if (remaining <= 0) break;
                if (item.quantity <= 0) continue;
                if (item.productId === pId) {
                    const take = Math.min(remaining, item.quantity);
                    pendingRows.push({
                        sales_order_detail_id: detail.detail_id,
                        sales_invoice_detail_id: detail.isSalesInvoiceDetail ? detail.detail_id : null,
                        product_id: pId,
                        inventory_lot_id: item.inventoryLotId,
                        lot_id: item.lotId,
                        batch_no: item.batchNo,
                        reserved_quantity: take,
                        quantity: take,
                        status: "Reserved",
                        created_by: userId,
                        created_at: now,
                        updated_by: userId,
                        updated_at: now,
                    });
                    item.quantity -= take;
                    remaining -= take;
                }
            }

            if (remaining > 0) {
                throw new Error(`Insufficient custom allocation for product #${pId} in document #${detail.invoice_no}`);
            }
        }

        if (pendingRows.length > 0) {
            const ids = await createReservationsInDirectus(pendingRows);
            createdReservationIds.push(...ids);
        }

        return { createdReservationIds };
    } catch (error) {
        await releaseReservationIds(createdReservationIds, userId);
        throw error;
    }
}

export async function previewConsolidationAllocations(branchId: number, invoiceIds: number[]) {
    const { invoices, details } = await loadCandidateDocuments(invoiceIds, branchId);
    if (invoices.length !== invoiceIds.length) throw new Error("One or more selected documents were not found");
    if (invoices.some((invoice) => Number(invoice.branch_id) !== branchId)) {
        throw new Error("Selected documents must belong to the selected branch");
    }
    if (details.length === 0) throw new Error("Selected documents have no product details");

    const customerCodes = [...new Set(invoices.map((invoice) => invoice.customer_code).filter(Boolean))];
    const customerByCode = new Map<string, number>();
    customerByCode.set("INTERNAL", 1);
    if (customerCodes.length > 0) {
        const customerFilter = encodeURIComponent(JSON.stringify({ customer_code: { _in: customerCodes } }));
        const customerJson = await directusJson(
            `${DIRECTUS_URL}/items/customer?filter=${customerFilter}&fields=id,customer_code&limit=-1`
        ).catch(() => ({ data: [] }));
        for (const customer of customerJson.data || []) {
            customerByCode.set(String(customer.customer_code), Number(customer.id));
        }
    }

    const invoiceById = new Map(invoices.map((invoice) => [Number(invoice.invoice_id), invoice]));
    const versionPairs = details.map((detail) => {
        const invoice = invoiceById.get(Number(detail.invoice_no));
        return {
            customerId: customerByCode.get(invoice?.customer_code || "") || 1,
            productId: Number(detail.product_id),
        };
    });
    const demandVersionMap = await resolveVersions(versionPairs);

    const productIds = [...new Set(details.map((detail) => Number(detail.product_id)))];
    const { synthesizedLots: unfilteredLots, movements } = await fetchLotsAndMovements(productIds, branchId);
    const jobOrderNumbers = [...new Set(unfilteredLots.map((lot) => lot.source_reference).filter(Boolean))] as string[];
    const jobVersionMap = new Map<string, number>();
    if (jobOrderNumbers.length > 0) {
        const jobFilter = encodeURIComponent(JSON.stringify({ job_order_no: { _in: jobOrderNumbers } }));
        const jobJson = await directusJson(
            `${DIRECTUS_URL}/items/manufacturing_job_orders?filter=${jobFilter}&fields=job_order_no,version_id&limit=-1`
        );
        for (const jobOrder of jobJson.data || []) {
            jobVersionMap.set(String(jobOrder.job_order_no), Number(jobOrder.version_id));
        }
    }

    const activeFilter = encodeURIComponent(JSON.stringify({
        _and: [
            { product_id: { _in: productIds } },
            { status: { _eq: "Active" } },
        ],
    }));
    const activeJson = await directusJson(
        `${DIRECTUS_URL}/items/product_manufacturing_version?filter=${activeFilter}&fields=product_id,version_id&limit=-1`
    );
    const activeVersionMap = new Map<number, number>();
    for (const version of activeJson.data || []) {
        const productId = Number(version.product_id);
        if (!activeVersionMap.has(productId)) activeVersionMap.set(productId, Number(version.version_id));
    }

    const metaRes = await resolveLotsMetadata(productIds, branchId);
    const { lots, keyByLotId } = canonicalStockLots(unfilteredLots, movements, jobVersionMap, activeVersionMap, metaRes.batchStatusMap, metaRes.batchExpiryMap, metaRes.batchCreatedMap);

    const detailIds = details.map((detail) => detail.detail_id);
    const lotIds = unfilteredLots.map((lot) => lot.id);
    let reservations: ReservationRow[] = [];
    if (lotIds.length > 0) {
        const [soRes, siRes] = await Promise.all([
            directusJson(`${DIRECTUS_URL}/items/sales_order_reservation?filter[inventory_lot_id][_in]=${lotIds.join(",")}&filter[status][_eq]=Reserved&fields=reservation_id,sales_order_detail_id,inventory_lot_id,reserved_quantity,status&limit=-1`).catch(() => ({ data: [] })),
            directusJson(`${DIRECTUS_URL}/items/sales_invoice_reservation?filter[inventory_lot_id][_in]=${lotIds.join(",")}&filter[status][_eq]=Reserved&fields=id,sales_invoice_detail_id,inventory_lot_id,quantity,status&limit=-1`).catch(() => ({ data: [] })),
        ]);
        const mappedSo: ReservationRow[] = (soRes.data || []).map((r: { reservation_id?: number; id?: number; sales_order_detail_id: number; inventory_lot_id: number; reserved_quantity?: number; quantity?: number; status: ReservationStatus }) => ({
            id: Number(r.reservation_id || r.id),
            sales_invoice_detail_id: r.sales_order_detail_id,
            inventory_lot_id: r.inventory_lot_id,
            quantity: Number(r.reserved_quantity ?? r.quantity ?? 0),
            status: r.status,
        }));
        reservations = [...mappedSo, ...(siRes.data || [])];
    }
    const reservedByStock = new Map<string, number>();
    const selectedReservationsByDetail = new Map<number, ReservationRow[]>();
    const selectedDetailIds = new Set(detailIds);
    for (const reservation of reservations) {
        const lotId = inventoryLotId(reservation);
        const detId = detailId(reservation);
        const key = keyByLotId.get(lotId);
        if (key) reservedByStock.set(key, (reservedByStock.get(key) || 0) + Number(reservation.quantity || 0));
        if (selectedDetailIds.has(detId)) {
            const rows = selectedReservationsByDetail.get(detId) || [];
            rows.push(reservation);
            selectedReservationsByDetail.set(detId, rows);
        }
    }

    const productJson = await directusJson(
        `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,product_code,description&limit=-1`
    );
    const productMap = new Map<number, { product_name: string; product_code: string; description?: string }>();
    for (const product of productJson.data || []) productMap.set(Number(product.product_id), product);

    const lotById = new Map(unfilteredLots.flatMap((metadata) => {
        const key = keyByLotId.get(metadata.id);
        const lot = lots.find((candidate) => candidate.stockKey === key);
        return lot ? [[metadata.id, lot] as const] : [];
    }));
    const availableByLot = new Map(lots.map((lot) => [
        lot.id,
        Math.max(0, Number(lot.quantity || 0) - (reservedByStock.get(lot.stockKey) || 0)),
    ]));

    // Build available batches list for manual allocation
    const availableBatches: Array<{
        productId: number;
        productName: string;
        productCode: string;
        inventoryLotId: number;
        lotId: number;
        lotName: string;
        batchNo: string;
        expiryDate: string | null;
        onhandQuantity: number;
        availableQuantity: number;
        inventoryCondition: string;
    }> = [];

    for (const lot of lots) {
        const pId = Number(lot.product_id);
        const physicalLotId = numericId(lot.lot_id, ["lot_id"]) || 0;
        const physicalLot = typeof lot.lot_id === "object" ? lot.lot_id : null;
        const product = productMap.get(pId);
        const avail = availableByLot.get(lot.id) || 0;
        const lotName = (physicalLot?.lot_name && !physicalLot.lot_name.toLowerCase().startsWith("lot #") && !physicalLot.lot_name.toLowerCase().startsWith("lot#"))
            ? physicalLot.lot_name
            : "Unknown";

        availableBatches.push({
            productId: pId,
            productName: product?.description || product?.product_name || `Product #${pId}`,
            productCode: product?.product_code || "",
            inventoryLotId: lot.id,
            lotId: physicalLotId,
            lotName,
            batchNo: lot.batch_no || lot.lot_number || (physicalLotId ? `LOT-${physicalLotId}` : "LOT-N/A"),
            expiryDate: lot.expiry_date || null,
            onhandQuantity: Number(lot.quantity || 0),
            availableQuantity: avail,
            inventoryCondition: (lot as unknown as { inventory_condition?: string }).inventory_condition || "GOOD",
        });
    }

    const allocationMap = new Map<string, {
        productId: number;
        productName: string;
        productCode: string;
        inventoryLotId: number;
        lotId: number;
        lotName: string;
        batchNo: string;
        expiryDate: string | null;
        quantity: number;
    }>();

    const invoiceAllocationMap = new Map<number, Array<{
        detailId: number;
        productId: number;
        productName: string;
        productCode: string;
        requiredQuantity: number;
        allocations: Array<{
            inventoryLotId: number;
            lotId: number;
            lotName: string;
            batchNo: string;
            expiryDate: string | null;
            quantity: number;
        }>;
    }>>();

    const addAllocation = (productId: number, lot: InventoryLotRow, quantity: number, invoiceId?: number, detailId?: number) => {
        const physicalLotId = numericId(lot.lot_id, ["lot_id"]) || 0;
        const physicalLot = typeof lot.lot_id === "object" ? lot.lot_id : null;
        const product = productMap.get(productId);
        const key = `${productId}:${lot.id}`;
        const lotName = (physicalLot?.lot_name && !physicalLot.lot_name.toLowerCase().startsWith("lot #") && !physicalLot.lot_name.toLowerCase().startsWith("lot#"))
            ? physicalLot.lot_name
            : "Unknown";

        const existing = allocationMap.get(key);
        if (existing) {
            existing.quantity += quantity;
        } else {
            allocationMap.set(key, {
                productId,
                productName: product?.description || product?.product_name || `Product #${productId}`,
                productCode: product?.product_code || "",
                inventoryLotId: lot.id,
                lotId: physicalLotId,
                lotName,
                batchNo: lot.batch_no || lot.lot_number || "LOT-N/A",
                expiryDate: lot.expiry_date || null,
                quantity,
            });
        }

        if (invoiceId && detailId) {
            const list = invoiceAllocationMap.get(invoiceId) || [];
            let line = list.find((item) => item.detailId === detailId);
            if (!line) {
                line = {
                    detailId,
                    productId,
                    productName: product?.description || product?.product_name || `Product #${productId}`,
                    productCode: product?.product_code || "",
                    requiredQuantity: 0,
                    allocations: [],
                };
                list.push(line);
                invoiceAllocationMap.set(invoiceId, list);
            }
            line.allocations.push({
                inventoryLotId: lot.id,
                lotId: physicalLotId,
                lotName,
                batchNo: lot.batch_no || lot.lot_number || "LOT-N/A",
                expiryDate: lot.expiry_date || null,
                quantity,
            });
        }
    };

    const shortages = new Map<number, number>();
    const sortedInvoices = [...invoices].sort((a, b) =>
        (a.invoice_date || "9999-12-31").localeCompare(b.invoice_date || "9999-12-31")
        || a.invoice_id - b.invoice_id
    );
    for (const invoice of sortedInvoices) {
        const customerId = customerByCode.get(invoice.customer_code) || 0;
        const invId = Number(invoice.invoice_id);

        for (const detail of details.filter((row) => Number(row.invoice_no) === invId)) {
            const productId = Number(detail.product_id);
            const reqQty = Number(detail.quantity || 0);
            const existingRows = selectedReservationsByDetail.get(detail.detail_id) || [];
            let remaining = reqQty;

            // Ensure invoice line is initialized
            const list = invoiceAllocationMap.get(invId) || [];
            let line = list.find((item) => item.detailId === detail.detail_id);
            if (!line) {
                const product = productMap.get(productId);
                line = {
                    detailId: detail.detail_id,
                    productId,
                    productName: product?.description || product?.product_name || `Product #${productId}`,
                    productCode: product?.product_code || "",
                    requiredQuantity: reqQty,
                    allocations: [],
                };
                list.push(line);
                invoiceAllocationMap.set(invId, list);
            }

            for (const reservation of existingRows) {
                const lot = lotById.get(inventoryLotId(reservation));
                const quantity = Math.min(remaining, Number(reservation.quantity || 0));
                if (lot && quantity > 0) addAllocation(productId, lot, quantity, invId, detail.detail_id);
                remaining -= quantity;
            }

            const targetVersion = demandVersionMap.get(`${customerId}:${productId}`)?.versionId ?? null;
            const matchingLots = lots
                .filter((lot) => {
                    if (Number(lot.product_id) !== productId) return false;
                    if ((availableByLot.get(lot.id) || 0) <= 0) return false;
                    if (targetVersion && lot.versionId && lot.versionId !== targetVersion) return false;
                    return true;
                })
                .sort(fefoCompare);
            for (const lot of matchingLots) {
                if (remaining <= 0) break;
                const available = availableByLot.get(lot.id) || 0;
                const quantity = Math.min(remaining, available);
                if (quantity <= 0) continue;
                addAllocation(productId, lot, quantity, invId, detail.detail_id);
                availableByLot.set(lot.id, available - quantity);
                remaining -= quantity;
            }
            if (remaining > 0) shortages.set(productId, (shortages.get(productId) || 0) + remaining);
        }
    }

    // Map invoiceBreakdown array
    const invoiceBreakdown = invoices.map((inv) => ({
        invoiceId: Number(inv.invoice_id),
        lines: invoiceAllocationMap.get(Number(inv.invoice_id)) || [],
    }));

    return {
        allocations: [...allocationMap.values()].sort((a, b) =>
            a.productName.localeCompare(b.productName)
            || (a.expiryDate || "9999-12-31").localeCompare(b.expiryDate || "9999-12-31")
            || a.inventoryLotId - b.inventoryLotId
        ),
        invoiceBreakdown,
        availableBatches,
        shortages: [...shortages.entries()].map(([productId, quantity]) => ({
            productId,
            productName: productMap.get(productId)?.description || productMap.get(productId)?.product_name || `Product #${productId}`,
            quantity,
        })),
    };
}

export async function calculateSalesOrderAvailability(salesOrderId: number) {
    const orderJson = await directusJson(
        `${DIRECTUS_URL}/items/sales_order/${salesOrderId}?fields=order_id,order_no,customer_code,branch_id,order_status`
    );
    const order: { order_id: number; order_no: string; customer_code: string; branch_id: number; order_status: string } | undefined = orderJson.data;
    if (!order) throw new Error("Sales order not found");

    const detailsJson = await directusJson(
        `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${salesOrderId}&fields=detail_id,product_id,bom_version_id,ordered_quantity&limit=-1`
    );
    const details: { detail_id: number; product_id: number; bom_version_id: number; ordered_quantity: number }[] = detailsJson.data || [];
    if (details.length === 0) return { lines: [], overallStockStatus: "Unavailable" as const };

    const productIds = [...new Set(details.map((d) => Number(d.product_id)))];
    const branchId = Number(order.branch_id);

    const customerFilter = encodeURIComponent(JSON.stringify({ customer_code: { _eq: order.customer_code } }));
    const customerJson = await directusJson(`${DIRECTUS_URL}/items/customer?filter=${customerFilter}&fields=id&limit=1`);
    const customerId = Number(customerJson.data?.[0]?.id || 0);
    const pairs = details.map((d) => ({ customerId, productId: Number(d.product_id) }));
    const demandVersionMap = await resolveVersions(pairs);

    const { synthesizedLots: unfilteredLots, movements } = await fetchLotsAndMovements(productIds, branchId);

    const jobOrderNumbers = [...new Set(unfilteredLots.map((lot) => lot.source_reference).filter(Boolean))] as string[];
    const jobVersionMap = new Map<string, number>();
    if (jobOrderNumbers.length > 0) {
        const joFilter = encodeURIComponent(JSON.stringify({ job_order_no: { _in: jobOrderNumbers } }));
        const joJson = await directusJson(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter=${joFilter}&fields=job_order_no,version_id&limit=-1`);
        for (const jobOrder of joJson.data || []) {
            if (jobOrder.job_order_no && jobOrder.version_id) jobVersionMap.set(String(jobOrder.job_order_no), Number(jobOrder.version_id));
        }
    }
    const activeFilter = encodeURIComponent(JSON.stringify({ _and: [{ product_id: { _in: productIds } }, { status: { _eq: "Active" } }] }));
    const activeJson = await directusJson(`${DIRECTUS_URL}/items/product_manufacturing_version?filter=${activeFilter}&fields=product_id,version_id&limit=-1`);
    const activeVersionMap = new Map<number, number>();
    for (const version of activeJson.data || []) {
        const pid = Number(version.product_id);
        if (!activeVersionMap.has(pid)) activeVersionMap.set(pid, Number(version.version_id));
    }

    const metaRes = await resolveLotsMetadata(productIds, branchId);
    const { lots, keyByLotId } = canonicalStockLots(unfilteredLots, movements, jobVersionMap, activeVersionMap, metaRes.batchStatusMap, metaRes.batchExpiryMap, metaRes.batchCreatedMap);

    const lotIds = unfilteredLots.map((lot) => lot.id);
    const reservedByStock = new Map<string, number>();
    if (lotIds.length > 0) {
        const [soRes, siRes] = await Promise.all([
            directusJson(`${DIRECTUS_URL}/items/sales_order_reservation?filter[inventory_lot_id][_in]=${lotIds.join(",")}&filter[status][_eq]=Reserved&fields=inventory_lot_id,reserved_quantity&limit=-1`).catch(() => ({ data: [] })),
            directusJson(`${DIRECTUS_URL}/items/sales_invoice_reservation?filter[inventory_lot_id][_in]=${lotIds.join(",")}&filter[status][_eq]=Reserved&fields=inventory_lot_id,quantity&limit=-1`).catch(() => ({ data: [] })),
        ]);
        for (const reservation of (soRes.data || [])) {
            const id = typeof reservation.inventory_lot_id === "object" ? Number(reservation.inventory_lot_id?.inventory_lot_id || reservation.inventory_lot_id?.id || 0) : Number(reservation.inventory_lot_id || 0);
            const key = keyByLotId.get(id);
            const qty = Number(reservation.reserved_quantity ?? reservation.quantity ?? 0);
            if (key && qty > 0) reservedByStock.set(key, (reservedByStock.get(key) || 0) + qty);
        }
        for (const reservation of (siRes.data || [])) {
            const id = typeof reservation.inventory_lot_id === "object" ? Number(reservation.inventory_lot_id?.id || 0) : Number(reservation.inventory_lot_id || 0);
            const key = keyByLotId.get(id);
            const qty = Number(reservation.quantity || 0);
            if (key && qty > 0) reservedByStock.set(key, (reservedByStock.get(key) || 0) + qty);
        }
    }

    const productJson = await directusJson(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,product_code&limit=-1`);
    const productMap = new Map<number, { product_name: string; product_code: string }>();
    for (const product of productJson.data || []) productMap.set(Number(product.product_id), product);

    const availableByLot = new Map(lots.map((lot) => [
        lot.id, Math.max(0, Number(lot.quantity || 0) - (reservedByStock.get(lot.stockKey) || 0)),
    ]));

    const versionJson = await directusJson(`${DIRECTUS_URL}/items/product_manufacturing_version?filter[version_id][_in]=${[...new Set(details.map((d) => Number(d.bom_version_id)).filter(Boolean))].join(",")}&fields=version_id,version_name&limit=-1`);
    const versionNameMap = new Map<number, string>();
    for (const v of versionJson.data || []) versionNameMap.set(Number(v.version_id), String(v.version_name || `Version ${v.version_id}`));

    const lines: {
        detailId: number;
        productId: number;
        productName: string;
        productCode: string;
        versionId: number;
        versionName: string;
        required: number;
        onHand: number;
        reserved: number;
        available: number;
        shortage: number;
    }[] = [];

    let totalShortage = 0;

    for (const detail of details) {
        const productId = Number(detail.product_id);
        const product = productMap.get(productId) || { product_name: `Product #${productId}`, product_code: "" };
        const required = Number(detail.ordered_quantity);
        const targetVersion = demandVersionMap.get(`${customerId}:${productId}`)?.versionId || Number(detail.bom_version_id);

        const matchingLots = lots.filter((lot) =>
            Number(lot.product_id) === productId && lot.versionId === targetVersion && (availableByLot.get(lot.id) || 0) > 0
        ).sort(fefoCompare);

        let onHand = 0;
        let reserved = 0;
        let available = 0;

        for (const lot of matchingLots) {
            const avail = availableByLot.get(lot.id) || 0;
            onHand += Number(lot.quantity || 0);
            reserved += reservedByStock.get(lot.stockKey) || 0;
            available += avail;
        }

        const availableFromStock = Math.min(required, available);
        const shortage = Math.max(0, required - availableFromStock);
        totalShortage += shortage;

        lines.push({
            detailId: Number(detail.detail_id),
            productId,
            productName: product.product_name,
            productCode: product.product_code,
            versionId: targetVersion,
            versionName: versionNameMap.get(targetVersion) || `Version ${targetVersion}`,
            required,
            onHand,
            reserved,
            available,
            shortage,
        });
    }

    const overallStockStatus: "Available" | "Partial" | "Unavailable" = totalShortage <= 0 ? "Available" : lines.some((l) => l.available > 0 && l.shortage > 0) ? "Partial" : "Unavailable";

    return { lines, overallStockStatus };
}

export async function releaseInvoiceReservations(invoiceId: number, userId: number) {
    const linkedJson = await directusJson(
        `${DIRECTUS_URL}/items/consolidator_invoices?filter[invoice_id][_eq]=${invoiceId}&filter[consolidator_id][is_delete][_eq]=0&fields=id&limit=1`
    );
    if ((linkedJson.data || []).length > 0) {
        throw new Error("Reservations cannot be released after the invoice enters consolidation");
    }

    const detailsJson = await directusJson(
        `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_eq]=${invoiceId}&fields=detail_id&limit=-1`
    );
    const detailIds: number[] = (detailsJson.data || []).map((detail: { detail_id: number }) => Number(detail.detail_id));
    if (detailIds.length === 0) return { released: 0 };

    const filter = encodeURIComponent(JSON.stringify({
        _and: [
            { sales_invoice_detail_id: { _in: detailIds } },
            { status: { _in: ["Pending", "Reserved"] } },
        ],
    }));
    const reservationJson = await directusJson(
        `${DIRECTUS_URL}/items/sales_invoice_reservation?filter=${filter}&fields=id&limit=-1`
    );
    const rows: { id: number }[] = reservationJson.data || [];
    const now = new Date().toISOString();
    await Promise.all(rows.map((row) => directusJson(`${DIRECTUS_URL}/items/sales_invoice_reservation/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Released", updated_by: userId, updated_at: now }),
    })));
    return { released: rows.length };
}
