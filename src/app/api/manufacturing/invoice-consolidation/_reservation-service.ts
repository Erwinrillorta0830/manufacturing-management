import { DIRECTUS_URL, headers as directusHeaders } from "../directus-api";
import { resolveVersions } from "./version-resolver";
import type { MovementRow } from "./inventory-movements-client";

type ReservationStatus = "Pending" | "Reserved" | "Consumed" | "Released";

interface InvoiceRow {
    invoice_id: number;
    invoice_no: string;
    invoice_date: string | null;
    customer_code: string;
    branch_id: number;
    transaction_status: string;
    isDispatched: boolean | null;
}

interface DetailRow {
    detail_id: number;
    invoice_no: number;
    product_id: number;
    quantity: number;
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
        const physicalLotId = numericId(lot.lot_id, ["lot_id"]);
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
            
            // Only include in lots if it has a positive quantity
            const qty = quantityByKey.get(key) || 0;
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

async function fetchEligibleInvoices(branchId: number): Promise<InvoiceRow[]> {
    const filter: Record<string, unknown> = {
        _and: [
            { branch_id: { _eq: branchId } },
            { transaction_status: { _eq: "Prepared" } },
            {
                _or: [
                    { isDispatched: { _eq: false } },
                    { isDispatched: { _null: true } },
                ],
            },
        ],
    };
    const query = new URLSearchParams({
        filter: JSON.stringify(filter),
        fields: "invoice_id,invoice_no,invoice_date,customer_code,branch_id,transaction_status,isDispatched",
        sort: "-invoice_date,-invoice_id",
        limit: "-1",
    });
    const invoiceJson = await directusJson(`${DIRECTUS_URL}/items/sales_invoice?${query.toString()}`);
    let invoices: InvoiceRow[] = invoiceJson.data || [];
    if (invoices.length === 0) return [];

    const linkedJson = await directusJson(
        `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][consolidator_no][_starts_with]=CLINV-&filter[consolidator_id][is_delete][_eq]=0&fields=invoice_id&limit=-1`
    );
    const linkedIds = new Set<number>((linkedJson.data || []).map((row: { invoice_id: number }) => Number(row.invoice_id)));
    invoices = invoices.filter((invoice) => !linkedIds.has(Number(invoice.invoice_id)));
    return invoices;
}

export async function getInvoiceReservationSummaries(branchId: number, search?: string) {
    const invoices = await fetchEligibleInvoices(branchId);
    if (invoices.length === 0) return [];

    const invoiceIds = invoices.map((invoice) => invoice.invoice_id);
    const detailsJson = await directusJson(
        `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.join(",")}&fields=detail_id,invoice_no,product_id,quantity&limit=-1`
    );
    const details: DetailRow[] = detailsJson.data || [];
    const detailIds = details.map((detail) => detail.detail_id);

    let reservations: ReservationRow[] = [];
    if (detailIds.length > 0) {
        const reservationFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { sales_invoice_detail_id: { _in: detailIds } },
                { status: { _eq: "Reserved" } },
            ],
        }));
        const reservationJson = await directusJson(
            `${DIRECTUS_URL}/items/sales_invoice_reservation?filter=${reservationFilter}&fields=id,sales_invoice_detail_id,inventory_lot_id.id,inventory_lot_id.lot_number,inventory_lot_id.batch_no,inventory_lot_id.expiry_date,inventory_lot_id.lot_id.lot_id,inventory_lot_id.lot_id.lot_name,quantity,status&limit=-1`
        );
        reservations = reservationJson.data || [];
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
                    const lot = typeof row.inventory_lot_id === "object" ? row.inventory_lot_id : null;
                    const physicalLot = lot && typeof lot.lot_id === "object" ? lot.lot_id : null;
                    return {
                        id: row.id,
                        inventoryLotId: inventoryLotId(row),
                        lotName: physicalLot?.lot_name || "Unassigned",
                        batchNo: lot?.batch_no || lot?.lot_number || "LOT-N/A",
                        expiryDate: lot?.expiry_date || null,
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

    const branchFilter = branchId ? { branch_id: { _eq: branchId } } : null;
    const movFilterObj: Record<string, unknown> = {
        _and: [
            { product_id: { _in: productIds } },
            ...(branchFilter ? [branchFilter] : []),
        ],
    };

    const movFilter = encodeURIComponent(JSON.stringify(movFilterObj));
    const movJson = await directusJson(
        `${DIRECTUS_URL}/items/inventory_movements?filter=${movFilter}&limit=-1`
    );
    const movements: MovementRow[] = movJson.data || [];
    if (movements.length === 0) {
        return { synthesizedLots: [], movements: [] };
    }

    const lotIds = [...new Set(movements.map((m) => {
        return typeof m.lot_id === "object"
            ? Number((m.lot_id as { lot_id?: number })?.lot_id)
            : Number(m.lot_id);
    }).filter(Boolean))];

    const masterLotMap = new Map<number, MasterLotRow>();
    if (lotIds.length > 0) {
        const lotJson = await directusJson(
            `${DIRECTUS_URL}/items/mm_lots?filter[lot_id][_in]=${lotIds.join(",")}&fields=lot_id,lot_name,branch_id&limit=-1`
        );
        for (const lot of (lotJson.data || []) as MasterLotRow[]) {
            masterLotMap.set(Number(lot.lot_id), lot);
        }
    }

    const lotMap = new Map<string, InventoryLotRow>();

    for (const m of movements) {
        const productId = Number(typeof m.product_id === "object" ? (m.product_id as { product_id?: number })?.product_id : m.product_id);
        const bId = Number(m.branch_id);
        const physicalLotId = typeof m.lot_id === "object"
            ? Number((m.lot_id as { lot_id?: number })?.lot_id)
            : Number(m.lot_id);
        if (!productId || !physicalLotId) continue;

        const masterLot = masterLotMap.get(physicalLotId);
        const batchNo = batchNumber(m.batch_no || masterLot?.batch_no);
        const compositeKey = `${productId}:${bId}:${physicalLotId}:${batchNo}`;

        if (!lotMap.has(compositeKey)) {
            lotMap.set(compositeKey, {
                id: physicalLotId,
                product_id: productId,
                branch_id: bId,
                lot_id: masterLot ? { lot_id: masterLot.lot_id, lot_name: masterLot.lot_name } : physicalLotId,
                lot_number: batchNo,
                batch_no: batchNo,
                expiry_date: m.expiry_date || masterLot?.expiry_date || null,
                created_on: masterLot?.created_on || m.created_at || null,
                quantity: 0,
                qa_status: "Passed",
                source_type: null,
                source_reference: null,
            });
        }
    }

    return { synthesizedLots: [...lotMap.values()], movements };
}

async function reconcileInventoryLots(inventoryLotIds: number[], userId: number) {
    if (inventoryLotIds.length === 0) return;

    // Resolve physical lots from inventory_movements; query movements by physical lot + product
    const touchedMovJson = await directusJson(
        `${DIRECTUS_URL}/items/inventory_movements?filter[lot_id][_in]=${inventoryLotIds.join(",")}&fields=product_id,branch_id,lot_id&limit=-1`
    );
    const touchedMovs: MovementRow[] = touchedMovJson.data || [];
    if (touchedMovs.length === 0) return;

    const productIds = [...new Set(touchedMovs.map((m) => Number(typeof m.product_id === "object" ? (m.product_id as { product_id?: number })?.product_id : m.product_id)).filter(Boolean))];
    const branchIds = [...new Set(touchedMovs.map((m) => Number(m.branch_id)).filter(Boolean))];
    if (productIds.length === 0) return;

    const { synthesizedLots: inventoryLots, movements } = await fetchLotsAndMovements(
        productIds,
        branchIds.length === 1 ? branchIds[0] : undefined
    );
    if (inventoryLots.length === 0) return;

    const jobOrderNumbers = [...new Set(inventoryLots.map((lot) => lot.source_reference).filter(Boolean))] as string[];
    const jobVersionMap = new Map<string, number>();
    if (jobOrderNumbers.length > 0) {
        const jobFilter = encodeURIComponent(JSON.stringify({ job_order_no: { _in: jobOrderNumbers } }));
        const jobJson = await directusJson(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter=${jobFilter}&fields=job_order_no,version_id&limit=-1`);
        for (const row of jobJson.data || []) jobVersionMap.set(String(row.job_order_no), Number(row.version_id));
    }
    const activeFilter = encodeURIComponent(JSON.stringify({ _and: [
        { product_id: { _in: productIds } },
        { status: { _eq: "Active" } },
    ] }));
    const activeJson = await directusJson(`${DIRECTUS_URL}/items/product_manufacturing_version?filter=${activeFilter}&fields=product_id,version_id&limit=-1`);
    const activeVersionMap = new Map<number, number>();
    for (const row of activeJson.data || []) {
        const productId = Number(row.product_id);
        if (!activeVersionMap.has(productId)) activeVersionMap.set(productId, Number(row.version_id));
    }
    const { lots, keyByLotId } = canonicalStockLots(
        inventoryLots,
        movements,
        jobVersionMap,
        activeVersionMap,
        (await resolveLotsMetadata(productIds, branchIds.length === 1 ? branchIds[0] : undefined)).batchStatusMap,
        (await resolveLotsMetadata(productIds, branchIds.length === 1 ? branchIds[0] : undefined)).batchExpiryMap,
        (await resolveLotsMetadata(productIds, branchIds.length === 1 ? branchIds[0] : undefined)).batchCreatedMap
    );
    const capacityByKey = new Map(lots.map((lot) => [lot.stockKey, Number(lot.quantity)]));
    const allLotIds = inventoryLots.map((lot) => lot.id);

    const filter = encodeURIComponent(JSON.stringify({
        _and: [
            { inventory_lot_id: { _in: allLotIds } },
            { status: { _in: ["Reserved", "Pending"] } },
        ],
    }));
    const reservationJson = await directusJson(
        `${DIRECTUS_URL}/items/sales_invoice_reservation?filter=${filter}&fields=id,inventory_lot_id,quantity,status,created_at&sort=created_at,id&limit=-1`
    );
    const rows: ReservationRow[] = reservationJson.data || [];
    const touchedLotIds = new Set(inventoryLotIds);
    const grouped = new Map<string, ReservationRow[]>();
    for (const row of rows) {
        const id = inventoryLotId(row);
        if (row.status === "Pending" && !touchedLotIds.has(id)) continue;
        const key = keyByLotId.get(id);
        if (!key) continue;
        const entries = grouped.get(key) || [];
        entries.push(row);
        grouped.set(key, entries);
    }

    const now = new Date().toISOString();
    for (const [key, lotRows] of grouped) {
        let remaining = capacityByKey.get(key) || 0;
        const reservedRows = lotRows.filter((row) => row.status === "Reserved");
        const pendingRows = lotRows.filter((row) => row.status === "Pending");

        for (const row of reservedRows) {
            remaining = Math.max(0, remaining - Number(row.quantity || 0));
        }

        for (const row of pendingRows) {
            const requested = Number(row.quantity || 0);
            const accepted = Math.min(requested, remaining);
            remaining -= accepted;
            const payload = accepted > 0
                ? { quantity: accepted, status: "Reserved", updated_by: userId, updated_at: now }
                : { status: "Released", updated_by: userId, updated_at: now };
            await directusJson(`${DIRECTUS_URL}/items/sales_invoice_reservation/${row.id}`, {
                method: "PATCH",
                body: JSON.stringify(payload),
            });
        }
    }
}

export async function allocateInvoice(invoiceId: number, userId: number) {
    const invoiceJson = await directusJson(
        `${DIRECTUS_URL}/items/sales_invoice/${invoiceId}?fields=invoice_id,invoice_no,invoice_date,customer_code,branch_id,transaction_status,isDispatched`
    );
    const invoice: InvoiceRow | undefined = invoiceJson.data;
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.transaction_status !== "Prepared" || invoice.isDispatched === true) {
        throw new Error("Only prepared, undispatched invoices can be allocated");
    }

    const linkedJson = await directusJson(
        `${DIRECTUS_URL}/items/consolidator_invoices?filter[invoice_id][_eq]=${invoiceId}&filter[consolidator_id][consolidator_no][_starts_with]=CLINV-&filter[consolidator_id][is_delete][_eq]=0&fields=id&limit=1`
    );
    if ((linkedJson.data || []).length > 0) {
        throw new Error("Invoice is already linked to a consolidation batch");
    }

    const detailsJson = await directusJson(
        `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_eq]=${invoiceId}&fields=detail_id,invoice_no,product_id,quantity&limit=-1`
    );
    const details: DetailRow[] = detailsJson.data || [];
    if (details.length === 0) throw new Error("Invoice has no product details");

    const customerFilter = encodeURIComponent(JSON.stringify({ customer_code: { _eq: invoice.customer_code } }));
    const customerJson = await directusJson(
        `${DIRECTUS_URL}/items/customer?filter=${customerFilter}&fields=id&limit=1`
    );
    const customerId = Number(customerJson.data?.[0]?.id || 0);
    if (!customerId) throw new Error("Invoice customer cannot be resolved for BOM version allocation");

    const pairs = details.map((detail) => ({ customerId, productId: Number(detail.product_id) }));
    const demandVersionMap = await resolveVersions(pairs);
    for (const detail of details) {
        const version = demandVersionMap.get(`${customerId}:${Number(detail.product_id)}`)?.versionId;
        if (!version) throw new Error(`No manufacturing version is configured for product ${detail.product_id}`);
    }

    const productIds = [...new Set(details.map((detail) => Number(detail.product_id)))];
    const branchId = Number(invoice.branch_id);
    const { synthesizedLots: unfilteredLots, movements } = await fetchLotsAndMovements(productIds, branchId);
    const jobOrderNumbers = [...new Set(unfilteredLots.map((lot) => lot.source_reference).filter(Boolean))] as string[];
    const jobVersionMap = new Map<string, number>();
    if (jobOrderNumbers.length > 0) {
        const joFilter = encodeURIComponent(JSON.stringify({ job_order_no: { _in: jobOrderNumbers } }));
        const joJson = await directusJson(
            `${DIRECTUS_URL}/items/manufacturing_job_orders?filter=${joFilter}&fields=job_order_no,version_id&limit=-1`
        );
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
    );
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
        );
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

    const now = new Date().toISOString();
    const pendingRows: Record<string, unknown>[] = [];
    for (const detail of details) {
        let remaining = Math.max(0, Number(detail.quantity || 0) - (reservedByDetail.get(detail.detail_id) || 0));
        if (remaining <= 0) continue;

        const targetVersion = demandVersionMap.get(`${customerId}:${Number(detail.product_id)}`)!.versionId;
        const matchingLots = lots
            .filter((lot) => {
                if (Number(lot.product_id) !== Number(detail.product_id)) return false;
                return lot.versionId === targetVersion && (availableByLot.get(lot.id) || 0) > 0;
            })
            .sort(fefoCompare);

        for (const lot of matchingLots) {
            if (remaining <= 0) break;
            const available = availableByLot.get(lot.id) || 0;
            const quantity = Math.min(remaining, available);
            if (quantity <= 0) continue;
            pendingRows.push({
                sales_invoice_detail_id: detail.detail_id,
                inventory_lot_id: lot.id,
                quantity,
                status: "Pending",
                created_by: userId,
                created_at: now,
                updated_by: userId,
                updated_at: now,
            });
            availableByLot.set(lot.id, available - quantity);
            remaining -= quantity;
        }
    }

    const createdReservationIds: number[] = [];
    if (pendingRows.length > 0) {
        const createdJson = await directusJson(`${DIRECTUS_URL}/items/sales_invoice_reservation`, {
            method: "POST",
            body: JSON.stringify(pendingRows),
        });
        for (const row of createdJson.data || []) {
            const id = Number(row.id);
            if (id) createdReservationIds.push(id);
        }
        const touchedLotIds = [...new Set(pendingRows.map((row) => Number(row.inventory_lot_id)))];
        try {
            await reconcileInventoryLots(touchedLotIds, userId);
        } catch (error) {
            await releaseReservationIds(createdReservationIds, userId);
            throw error;
        }
    }

    return { created: createdReservationIds.length, createdReservationIds };
}

export async function releaseReservationIds(reservationIds: number[], userId: number): Promise<boolean> {
    if (reservationIds.length === 0) return true;
    const now = new Date().toISOString();
    const results = await Promise.all(reservationIds.map((id) => directusJson(
        `${DIRECTUS_URL}/items/sales_invoice_reservation/${id}`,
        {
            method: "PATCH",
            body: JSON.stringify({ status: "Released", updated_by: userId, updated_at: now }),
        }
    ).catch(() => null)));
    return results.every(Boolean);
}

export async function allocateInvoicesForConsolidation(invoiceIds: number[], userId: number) {
    const createdReservationIds: number[] = [];

    try {
        for (const invoiceId of invoiceIds) {
            const result = await allocateInvoice(invoiceId, userId);
            createdReservationIds.push(...result.createdReservationIds);
        }

        const detailsJson = await directusJson(
            `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.join(",")}&fields=detail_id,invoice_no,product_id,quantity&limit=-1`
        );
        const details: DetailRow[] = detailsJson.data || [];
        if (details.length === 0) throw new Error("Selected invoices have no product details");

        const detailIds = details.map((detail) => detail.detail_id);
        const reservationFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { sales_invoice_detail_id: { _in: detailIds } },
                { status: { _eq: "Reserved" } },
            ],
        }));
        const reservationJson = await directusJson(
            `${DIRECTUS_URL}/items/sales_invoice_reservation?filter=${reservationFilter}&fields=sales_invoice_detail_id,quantity&limit=-1`
        );
        const reservedByDetail = new Map<number, number>();
        for (const row of (reservationJson.data || []) as ReservationRow[]) {
            const id = detailId(row);
            reservedByDetail.set(id, (reservedByDetail.get(id) || 0) + Number(row.quantity || 0));
        }

        const shortages = details.filter((detail) =>
            (reservedByDetail.get(detail.detail_id) || 0) < Number(detail.quantity || 0)
        );
        if (shortages.length > 0) {
            const invoiceList = [...new Set(shortages.map((detail) => detail.invoice_no))].join(", ");
            throw new Error(`Insufficient eligible stock for invoice IDs: ${invoiceList}`);
        }

        return { createdReservationIds };
    } catch (error) {
        await releaseReservationIds(createdReservationIds, userId);
        throw error;
    }
}

export interface CustomAllocationInput {
    invoiceDetailId?: number;
    invoiceId?: number;
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
        const detailsJson = await directusJson(
            `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.join(",")}&fields=detail_id,invoice_no,product_id,quantity&limit=-1`
        );
        const details: DetailRow[] = detailsJson.data || [];
        if (details.length === 0) throw new Error("Selected invoices have no product details");

        // Clone custom allocations pool
        const allocPool = customAllocations.map((a) => ({ ...a }));
        const pendingRows: Array<{
            sales_invoice_detail_id: number;
            inventory_lot_id: number;
            quantity: number;
            status: string;
            reserved_by: number;
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
                        sales_invoice_detail_id: detail.detail_id,
                        inventory_lot_id: item.inventoryLotId,
                        quantity: take,
                        status: "Reserved",
                        reserved_by: userId,
                    });
                    item.quantity -= take;
                    remaining -= take;
                }
            }

            if (remaining > 0) {
                throw new Error(`Insufficient custom allocation for product #${pId} in invoice ${detail.invoice_no}`);
            }
        }

        if (pendingRows.length > 0) {
            const createdJson = await directusJson(`${DIRECTUS_URL}/items/sales_invoice_reservation`, {
                method: "POST",
                body: JSON.stringify(pendingRows),
            });
            for (const row of createdJson.data || []) {
                const id = Number(row.id);
                if (id) createdReservationIds.push(id);
            }
            const touchedLotIds = [...new Set(pendingRows.map((row) => Number(row.inventory_lot_id)))];
            try {
                await reconcileInventoryLots(touchedLotIds, userId);
            } catch (error) {
                await releaseReservationIds(createdReservationIds, userId);
                throw error;
            }
        }

        return { createdReservationIds };
    } catch (error) {
        await releaseReservationIds(createdReservationIds, userId);
        throw error;
    }
}

export async function previewConsolidationAllocations(branchId: number, invoiceIds: number[]) {
    const invoiceJson = await directusJson(
        `${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${invoiceIds.join(",")}&fields=invoice_id,invoice_date,customer_code,branch_id,transaction_status,isDispatched&limit=-1`
    );
    const invoices: InvoiceRow[] = invoiceJson.data || [];
    if (invoices.length !== invoiceIds.length) throw new Error("One or more selected invoices were not found");
    if (invoices.some((invoice) => Number(invoice.branch_id) !== branchId)) {
        throw new Error("Selected invoices must belong to the selected branch");
    }
    if (invoices.some((invoice) => invoice.transaction_status !== "Prepared" || invoice.isDispatched === true)) {
        throw new Error("Only prepared, undispatched invoices can be previewed");
    }

    const detailsJson = await directusJson(
        `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.join(",")}&fields=detail_id,invoice_no,product_id,quantity&limit=-1`
    );
    const details: DetailRow[] = detailsJson.data || [];
    if (details.length === 0) throw new Error("Selected invoices have no product details");

    const customerCodes = [...new Set(invoices.map((invoice) => invoice.customer_code).filter(Boolean))];
    const customerFilter = encodeURIComponent(JSON.stringify({ customer_code: { _in: customerCodes } }));
    const customerJson = await directusJson(
        `${DIRECTUS_URL}/items/customer?filter=${customerFilter}&fields=id,customer_code&limit=-1`
    );
    const customerByCode = new Map<string, number>();
    for (const customer of customerJson.data || []) {
        customerByCode.set(String(customer.customer_code), Number(customer.id));
    }

    const invoiceById = new Map(invoices.map((invoice) => [Number(invoice.invoice_id), invoice]));
    const versionPairs = details.map((detail) => {
        const invoice = invoiceById.get(Number(detail.invoice_no));
        return {
            customerId: customerByCode.get(invoice?.customer_code || "") || 0,
            productId: Number(detail.product_id),
        };
    });
    if (versionPairs.some((pair) => !pair.customerId)) {
        throw new Error("An invoice customer cannot be resolved for BOM version allocation");
    }
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
    const reservations: ReservationRow[] = lotIds.length > 0
        ? (await directusJson(
            `${DIRECTUS_URL}/items/sales_invoice_reservation?filter[inventory_lot_id][_in]=${lotIds.join(",")}&filter[status][_eq]=Reserved&fields=id,sales_invoice_detail_id,inventory_lot_id,quantity,status&limit=-1`
        )).data || []
        : [];
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
        availableBatches.push({
            productId: pId,
            productName: product?.description || product?.product_name || `Product #${pId}`,
            productCode: product?.product_code || "",
            inventoryLotId: lot.id,
            lotId: physicalLotId,
            lotName: physicalLot?.lot_name || `Lot #${physicalLotId}`,
            batchNo: lot.batch_no || lot.lot_number || `LOT-${physicalLotId}`,
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
                lotName: physicalLot?.lot_name || `Lot #${physicalLotId}`,
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
                lotName: physicalLot?.lot_name || `Lot #${physicalLotId}`,
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

            const targetVersion = demandVersionMap.get(`${customerId}:${productId}`)?.versionId;
            if (!targetVersion) {
                shortages.set(productId, (shortages.get(productId) || 0) + Math.max(0, remaining));
                continue;
            }
            const matchingLots = lots
                .filter((lot) => {
                    if (Number(lot.product_id) !== productId) return false;
                    return lot.versionId === targetVersion && (availableByLot.get(lot.id) || 0) > 0;
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
        const reservationFilter = encodeURIComponent(JSON.stringify({ _and: [{ inventory_lot_id: { _in: lotIds } }, { status: { _eq: "Reserved" } }] }));
        const reservationJson = await directusJson(`${DIRECTUS_URL}/items/sales_invoice_reservation?filter=${reservationFilter}&fields=inventory_lot_id,quantity&limit=-1`);
        for (const reservation of (reservationJson.data || []) as { inventory_lot_id: number | { id?: number }; quantity: number }[]) {
            const id = typeof reservation.inventory_lot_id === "object" ? Number(reservation.inventory_lot_id?.id || 0) : Number(reservation.inventory_lot_id || 0);
            const key = keyByLotId.get(id);
            if (key) reservedByStock.set(key, (reservedByStock.get(key) || 0) + Number(reservation.quantity || 0));
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
        `${DIRECTUS_URL}/items/consolidator_invoices?filter[invoice_id][_eq]=${invoiceId}&filter[consolidator_id][consolidator_no][_starts_with]=CLINV-&filter[consolidator_id][is_delete][_eq]=0&fields=id&limit=1`
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
