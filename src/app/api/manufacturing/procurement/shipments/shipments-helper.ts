/* eslint-disable */
import { DIRECTUS_URL, headers } from "../_directus";
import { canonicalBatchNumber, INVENTORY_STATUS, inventoryStatusToPurchaseOrderStatus, inventoryStatusToShipmentStatus, PAYMENT_STATUS, RECEIVING_QUEUE_INVENTORY_STATUS_IDS, shipmentStatusToInventoryStatus, type ShipmentStatusLabel } from "../_domain";
import { DirectusShipment } from "@/modules/manufacturing-management/procurement/types";
import type { PurchaseOrderListQuery } from "../../purchase-orders/_schemas";
import { buildPurchaseOrderProductPayload, calculatePurchaseOrderLine } from "../../purchase-orders/_domain";
import { resolvePurchaseOrderLineId, summarizeReceivingHistory } from "../../qa-receiving/_receiving-history";
import { assertMrpProductJobOrderPairs } from "../../purchase-orders/_mrp-validation";
import {
    CURRENCY_DECIMAL_SCALE,
    DecimalValue,
    EXCHANGE_RATE_DECIMAL_SCALE,
    normalizeDecimal,
    UNIT_PRICE_DECIMAL_SCALE
} from "@/modules/manufacturing-management/decimal";

const LEGACY_DEFAULT_EXCHANGE_RATE = "58.000000";

function normalizeLegacyDecimal(value: unknown, fallback: string, decimalPlaces: number, label: string): string {
    const raw = value == null ? "" : String(value).trim();
    if (!raw) return fallback;
    try {
        return DecimalValue.from(raw).toFixed(decimalPlaces);
    } catch (error) {
        console.warn(`[Manufacturing Directus API] Invalid decimal in ${label}; using ${fallback}.`, error);
        return fallback;
    }
}

function normalizeLegacyDecimalOrNull(value: unknown, decimalPlaces: number, label: string): string | null {
    const raw = value == null ? "" : String(value).trim();
    if (!raw) return null;
    try {
        return DecimalValue.from(raw).toFixed(decimalPlaces);
    } catch (error) {
        console.warn(`[Manufacturing Directus API] Invalid decimal in ${label}; using a derived value.`, error);
        return null;
    }
}

function normalizeLegacyExchangeRate(value: unknown, label: string): string {
    const raw = value == null ? "" : String(value).trim();
    if (!raw) return LEGACY_DEFAULT_EXCHANGE_RATE;
    try {
        const rate = DecimalValue.from(raw);
        if (rate.compare(0) > 0) return rate.toFixed(EXCHANGE_RATE_DECIMAL_SCALE);
    } catch (error) {
        console.warn(`[Manufacturing Directus API] Invalid exchange rate in ${label}; using ${LEGACY_DEFAULT_EXCHANGE_RATE}.`, error);
        return LEGACY_DEFAULT_EXCHANGE_RATE;
    }
    console.warn(`[Manufacturing Directus API] Non-positive exchange rate in ${label}; using ${LEGACY_DEFAULT_EXCHANGE_RATE}.`);
    return LEGACY_DEFAULT_EXCHANGE_RATE;
}

interface DirectusPO {
    purchase_order_id: number;
    purchase_order_no?: string;
    reference?: string;
    supplier_name?: number | Record<string, unknown> | null;
    date_received?: string | null;
    lead_time_receiving?: string | null;
    total_amount?: number | string | null;
    gross_amount?: number | string | null;
    inventory_status?: number | null;
    payment_status?: number | null;
    date_encoded?: string | null;
    branch_id?: number | null;
    payment_type?: number | null;
    price_type?: string | null;
    exchange_rate?: number | string | null;
    total_foreign_currency?: number | string | null;
    remark?: string | null;
    currency_code?: "PHP" | "USD" | null;
    workflow_revision?: number | null;
    approver_id?: number | null;
    finance_id?: number | null;
    date_approved?: string | null;
    date_financed?: string | null;
    approval_rule_id?: number | null;
    approval_requires_finance?: boolean | null;
    approval_allow_self_approval?: boolean | null;
}

interface DirectusSupplier {
    id: number;
    supplier_name: string;
}

interface DirectusPOProduct {
    purchase_order_product_id: number;
    purchase_order_id: number;
    product_id: number | { product_id: number };
    ordered_quantity?: number | string;
    unit_price?: number | string;
    discount_type?: number | null;
    purchase_intent?: "MRP_Demand" | "Buffer_Stock";
    job_order_id?: number | null;
    discount_percent?: number | string;
    vat_percent?: number | string;
    withholding_percent?: number | string;
    unit_price_foreign?: number | string;
}

interface ProductMin {
    product_id: number;
    product_name?: string;
    product_code?: string;
    unit_of_measurement?: any;
    unit_of_measurement_count?: number;
    parent_id?: any;
}

interface DirectusInventoryLot {
    id: number;
    product_id: number;
    quantity: number;
    qa_status?: string;
    unit_cost?: number | string;
    lot_number?: string;
    batch_no?: string;
    lot_id?: number | { lot_id: number; lot_name?: string } | null;
    expiry_date?: string;
    branch_id?: number;
}

interface DirectusReceivingRecord {
    purchase_order_product_id: number | string;
    purchase_order_line_id?: number | { purchase_order_product_id: number } | null;
    product_id: number | { product_id: number };
    receipt_no?: string | null;
    batch_no?: string | null;
    lot_id?: number | { lot_id: number } | null;
    received_quantity?: number | string | null;
    quantity_rejected?: number | string | null;
    expiry_date?: string | null;
    rejection_reason?: string | null;
    qa_status?: string | null;
    branch_id?: number | { id: number } | null;
    received_date?: string | null;
}

interface DirectusInventoryMovement {
    source_document_id: number | { purchase_order_product_id: number };
    product_id: number | { product_id: number };
    lot_id: number | { lot_id: number };
    branch_id?: number | { id: number } | null;
    quantity?: number | string | null;
    batch_no?: string | null;
    manufacturing_date?: string | null;
}

interface ReceivingLotAllocationSnapshot {
    storage_lot_id: number;
    quantity: number;
}

interface LatestReceivingSnapshot {
    receipt_number: string;
    received_quantity: number;
    accepted_quantity: number;
    rejected_quantity: number;
    supplier_batch_number: string;
    storage_lot_id: number | null;
    accepted_lot_allocations: ReceivingLotAllocationSnapshot[];
    rejected_lot_allocations: ReceivingLotAllocationSnapshot[];
    manufacturing_date: string | null;
    expiration_date: string | null;
    rejection_reason: string;
    qa_status: string;
    branch_id: number | null;
}

export interface ExtendedShipmentLineItem {
    line_id?: number;
    shipment_id?: number;
    product_id: number | { product_id: number; product_name?: string; product_code?: string };
    quantity_ordered?: number;
    quantity_received?: number;
    quantity_rejected?: number;
    previously_received_quantity?: number;
    previously_rejected_quantity?: number;
    remaining_quantity?: number;
    latest_receipt?: LatestReceivingSnapshot | null;
    rejection_reason?: string;
    qa_status?: string;
    base_unit_cost_php?: number | string;
    unit_price_foreign?: number | string;
    allocated_expense_php?: number | string;
    final_landed_unit_cost?: number | string;
    lot_number?: string;
    batch_no?: string;
    lot_id?: number | null;
    manufacturing_date?: string | null;
    expiration_date?: string;
    discount_type?: number | null;
    discount_percent?: number;
    vat_percent?: number;
    withholding_percent?: number;
    purchase_intent?: "MRP_Demand" | "Buffer_Stock";
    job_order_id?: number | null;
}

function resolveInventoryLotId(value: DirectusInventoryLot["lot_id"]): number | null {
    if (typeof value === "number") return value;
    return value?.lot_id || null;
}

function receivingRecordId(value: DirectusReceivingRecord["purchase_order_product_id"]): number {
    return Number(value);
}

function movementRelationId(value: unknown, key: string): number {
    return Number(value && typeof value === "object" ? (value as Record<string, unknown>)[key] : value);
}

function sumMovementAllocations(
    movements: DirectusInventoryMovement[],
    branchId: number | null
): ReceivingLotAllocationSnapshot[] {
    const quantities = new Map<number, number>();
    for (const movement of movements) {
        const movementBranchId = movementRelationId(movement.branch_id, "id");
        if (!Number.isSafeInteger(movementBranchId) || (branchId !== null && movementBranchId !== branchId)) continue;
        const storageLotId = movementRelationId(movement.lot_id, "lot_id");
        const quantity = Number(movement.quantity || 0);
        if (!Number.isSafeInteger(storageLotId) || storageLotId <= 0 || !Number.isFinite(quantity) || quantity <= 0) continue;
        quantities.set(storageLotId, (quantities.get(storageLotId) || 0) + quantity);
    }
    return [...quantities.entries()].map(([storage_lot_id, quantity]) => ({ storage_lot_id, quantity }));
}

function relationId(value: unknown, key: string): number | null {
    const raw = value && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
        : value;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

interface ExtendedShipment extends Partial<DirectusShipment> {
    remark?: string;
    notes?: string;
    branch_id?: number;
}

function supplierId(value: DirectusPO["supplier_name"]): number | null {
    if (typeof value === "number") return value;
    if (!value || typeof value !== "object") return null;
    return Number(value.id) || null;
}

function mapPurchaseOrder(po: DirectusPO, suppliers: ReadonlyMap<number, DirectusSupplier>, canonicalStatus = false) {
    const poLabel = `purchase_order/${po.purchase_order_id}`;
    const rate = normalizeLegacyExchangeRate(po.exchange_rate, `${poLabel}.exchange_rate`);
    const totalPhp = normalizeLegacyDecimal(
        po.total_amount ?? po.gross_amount,
        "0.00",
        CURRENCY_DECIMAL_SCALE,
        `${poLabel}.total_amount`
    );
    const foreignCurrency = normalizeLegacyDecimalOrNull(
        po.total_foreign_currency,
        CURRENCY_DECIMAL_SCALE,
        `${poLabel}.total_foreign_currency`
    ) || DecimalValue.from(totalPhp).divideRounded(rate, CURRENCY_DECIMAL_SCALE).toFixed(CURRENCY_DECIMAL_SCALE);
    const storedSupplierId = supplierId(po.supplier_name);
    const supplier = storedSupplierId ? suppliers.get(storedSupplierId) || storedSupplierId : null;
    const status = canonicalStatus
        ? inventoryStatusToPurchaseOrderStatus(po.inventory_status, po.payment_status)
        : inventoryStatusToShipmentStatus(po.inventory_status, po.payment_status);

    return {
        shipment_id: po.purchase_order_id,
        reference_number: po.reference || po.purchase_order_no || "",
        purchase_order_no: po.purchase_order_no || "",
        supplier_id: supplier,
        date_received: po.date_received || null,
        lead_time_receiving: po.lead_time_receiving || null,
        total_foreign_currency: foreignCurrency,
        exchange_rate: rate,
        total_php_value: totalPhp,
        inventory_status: po.inventory_status || null,
        payment_status: po.payment_status || null,
        status,
        remark: po.remark || "",
        created_at: po.date_encoded || "",
        branch_id: po.branch_id || null,
        payment_type: po.payment_type || null,
        price_type: po.price_type || null
        ,currency_code: po.currency_code || "PHP"
        ,workflow_revision: Number(po.workflow_revision || 0)
        ,approver_id: po.approver_id || null
        ,finance_id: po.finance_id || null
        ,date_approved: po.date_approved || null
        ,date_financed: po.date_financed || null
        ,approval_rule_id: po.approval_rule_id || null
        ,approval_requires_finance: po.approval_requires_finance == null ? null : Number(po.approval_requires_finance) === 1
        ,approval_allow_self_approval: po.approval_allow_self_approval == null ? null : Number(po.approval_allow_self_approval) === 1
    };
}

async function fetchSupplierMap(ids: readonly number[]): Promise<Map<number, DirectusSupplier>> {
    const uniqueIds = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
    if (uniqueIds.length === 0) return new Map();
    const params = new URLSearchParams({
        fields: "id,supplier_name",
        limit: String(uniqueIds.length),
        filter: JSON.stringify({ id: { _in: uniqueIds } })
    });
    const response = await fetch(`${DIRECTUS_URL}/items/suppliers?${params.toString()}`, { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load purchase-order suppliers (${response.status}).`);
    const rows = ((await response.json()).data || []) as DirectusSupplier[];
    return new Map(rows.map(row => [Number(row.id), row]));
}

async function findSupplierIds(search: string): Promise<number[]> {
    const params = new URLSearchParams({
        fields: "id",
        limit: "100",
        filter: JSON.stringify({ supplier_name: { _icontains: search } })
    });
    const response = await fetch(`${DIRECTUS_URL}/items/suppliers?${params.toString()}`, { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to search purchase-order suppliers (${response.status}).`);
    const rows = ((await response.json()).data || []) as Array<{ id: number }>;
    return rows.map(row => Number(row.id)).filter(id => Number.isSafeInteger(id) && id > 0);
}

async function findApprovalHistoryPurchaseOrderIds(stage: "Plant" | "Finance", action: "Rejected") {
    const params = new URLSearchParams({
        fields: "purchase_order_id",
        filter: JSON.stringify({
            _and: [
                { approval_stage: { _eq: stage } },
                { action: { _eq: action } }
            ]
        }),
        limit: "-1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/purchase_order_approval_history?${params.toString()}`, { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load ${stage} approval history (${response.status}).`);
    const rows = ((await response.json()).data || []) as Array<{ purchase_order_id?: number | { purchase_order_id?: number } }>;
    return [...new Set(rows.map(row => relationId(row.purchase_order_id, "purchase_order_id")).filter((id): id is number => id !== null))];
}

async function addApprovalStageFilter(clauses: Record<string, unknown>[], query: PurchaseOrderListQuery) {
    if (!query.approvalStage) return;

    if (!query.status || query.status === "Requested") {
        if (query.approvalStage === "Plant") {
            clauses.push({
                _and: [
                    { inventory_status: { _eq: INVENTORY_STATUS.REQUESTED } },
                    { approver_id: { _null: true } }
                ]
            });
        } else {
            clauses.push({
                _and: [
                    { inventory_status: { _in: [INVENTORY_STATUS.REQUESTED, INVENTORY_STATUS.APPROVED] } },
                    { finance_id: { _null: true } },
                    { approval_requires_finance: { _eq: 1 } }
                ]
            });
        }
        return;
    }

    if (query.status === "Approved") {
        clauses.push({ inventory_status: { _eq: INVENTORY_STATUS.APPROVED } });
        clauses.push({
            [query.approvalStage === "Plant" ? "approver_id" : "finance_id"]: { _nnull: true }
        });
        return;
    }

    if (query.status === "Awaiting Payment") {
        clauses.push({
            _and: [
                { inventory_status: { _in: [INVENTORY_STATUS.REQUESTED, INVENTORY_STATUS.APPROVED] } },
                { payment_status: { _eq: PAYMENT_STATUS.AWAITING_PAYMENT } },
                { [query.approvalStage === "Plant" ? "approver_id" : "finance_id"]: { _nnull: true } }
            ]
        });
        return;
    }

    if (query.status === "Rejected") {
        const rejectedIds = await findApprovalHistoryPurchaseOrderIds(query.approvalStage, "Rejected");
        clauses.push({ inventory_status: { _eq: INVENTORY_STATUS.REJECTED } });
        clauses.push({ purchase_order_id: { _in: rejectedIds.length ? rejectedIds : [-1] } });
        return;
    }

    clauses.push({ purchase_order_id: { _in: [-1] } });
}

export async function fetchIncomingShipmentsPage(query: PurchaseOrderListQuery) {
    const filter: Record<string, unknown> = {};
    const clauses: Record<string, unknown>[] = [];
    if (query.search) {
        const matchingSupplierIds = await findSupplierIds(query.search);
        clauses.push({
            _or: [
                { reference: { _icontains: query.search } },
                { purchase_order_no: { _icontains: query.search } },
                ...(matchingSupplierIds.length ? [{ supplier_name: { _in: matchingSupplierIds } }] : [])
            ]
        });
    }
    if (query.queue === "receiving" && !query.status && !query.approvalStage) {
        clauses.push({
            inventory_status: {
                _in: [
                    ...RECEIVING_QUEUE_INVENTORY_STATUS_IDS,
                    ...(query.includeReceived ? [INVENTORY_STATUS.RECEIVED] : [])
                ]
            }
        });
    } else if (query.status === "Awaiting Payment") {
        clauses.push({
            _and: [
                { inventory_status: { _in: [INVENTORY_STATUS.REQUESTED, INVENTORY_STATUS.APPROVED] } },
                { payment_status: { _eq: PAYMENT_STATUS.AWAITING_PAYMENT } }
            ]
        });
    } else if (query.status && !(query.approvalStage && query.status === "Requested")) {
        clauses.push({ inventory_status: { _eq: shipmentStatusToInventoryStatus(query.status) } });
    }
    await addApprovalStageFilter(clauses, query);
    if (query.startDate) clauses.push({ date_encoded: { _gte: `${query.startDate}T00:00:00` } });
    if (query.endDate) clauses.push({ date_encoded: { _lte: `${query.endDate}T23:59:59` } });
    if (clauses.length === 1) Object.assign(filter, clauses[0]);
    if (clauses.length > 1) filter._and = clauses;

    const params = new URLSearchParams({
        fields: "purchase_order_id,purchase_order_no,reference,supplier_name,date_received,lead_time_receiving,total_amount,gross_amount,inventory_status,payment_status,date_encoded,branch_id,payment_type,price_type,exchange_rate,total_foreign_currency,currency_code,workflow_revision,remark,approver_id,finance_id,date_approved,date_financed,approval_rule_id,approval_requires_finance,approval_allow_self_approval",
        limit: String(query.limit),
        offset: String((query.page - 1) * query.limit),
        sort: `${query.direction === "desc" ? "-" : ""}${query.sort}`,
        meta: "filter_count"
    });
    if (Object.keys(filter).length > 0) params.set("filter", JSON.stringify(filter));

    const res = await fetch(`${DIRECTUS_URL}/items/purchase_order?${params.toString()}`, { headers, cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load purchase orders (${res.status}).`);
    const body = await res.json();
    const rows = (body.data || []) as DirectusPO[];
    const suppliers = await fetchSupplierMap(rows.map(row => supplierId(row.supplier_name)).filter((id): id is number => id !== null));
    const total = Number(body.meta?.filter_count || 0);
    return {
        data: rows.map(row => mapPurchaseOrder(row, suppliers, true)),
        meta: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / query.limit))
        }
    };
}

export async function fetchIncomingShipments(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/purchase_order?fields=*&sort=-date_encoded&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        const poList = ((await res.json()).data || []) as DirectusPO[];
        const suppliers = await fetchSupplierMap(poList.map(row => supplierId(row.supplier_name)).filter((id): id is number => id !== null));

        return poList.map(row => mapPurchaseOrder(row, suppliers));
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch incoming shipments:", e);
        return [];
    }
}

export async function fetchShipmentLineItems(shipmentId: number): Promise<ExtendedShipmentLineItem[]> {
    try {
        // Fetch purchase_order_products
        const popUrl = `${DIRECTUS_URL}/items/purchase_order_products?filter[purchase_order_id][_eq]=${shipmentId}&fields=*,product_id.*,product_id.unit_of_measurement.*&limit=-1`;
        const popRes = await fetch(popUrl, { headers, cache: "no-store" });
        if (!popRes.ok) return [];
        const popData = (await popRes.json()).data as DirectusPOProduct[] || [];

        // Fetch inventory_lots for this procurement PO
        const filterQuery = encodeURIComponent(JSON.stringify({
            _and: [
                { source_type: { _eq: "procurement" } },
                { source_reference: { _eq: String(shipmentId) } }
            ]
        }));
        const porUrl = `${DIRECTUS_URL}/items/inventory_lots?filter=${filterQuery}&fields=*,lot_id.lot_id,lot_id.lot_name&limit=-1`;
        const porRes = await fetch(porUrl, { headers, cache: "no-store" });
        const porData = (porRes.ok ? (await porRes.json()).data || [] : []) as DirectusInventoryLot[];

        // Manufacturing dates are persisted on inventory movements. Resolve them through
        // the receiving-record IDs instead of substituting the inventory lot creation date.
        const receivingUrl = `${DIRECTUS_URL}/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${shipmentId}&filter[is_reverted][_eq]=0&fields=purchase_order_product_id,purchase_order_line_id,product_id,receipt_no,batch_no,lot_id,received_quantity,quantity_rejected,expiry_date,rejection_reason,qa_status,branch_id,received_date&limit=-1`;
        let receivingRes = await fetch(receivingUrl, { headers, cache: "no-store" });
        if (!receivingRes.ok) {
            receivingRes = await fetch(
                `${DIRECTUS_URL}/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${shipmentId}&filter[is_reverted][_eq]=0&fields=purchase_order_product_id,product_id,receipt_no,batch_no,lot_id,received_quantity,quantity_rejected,expiry_date,rejection_reason,qa_status,branch_id,received_date&limit=-1`,
                { headers, cache: "no-store" }
            );
        }
        const receivingData = (receivingRes.ok ? (await receivingRes.json()).data || [] : []) as DirectusReceivingRecord[];
        const receivingHistory = summarizeReceivingHistory(receivingData, popData);
        const receivingIds = receivingData
            .map(row => receivingRecordId(row.purchase_order_product_id))
            .filter(id => Number.isSafeInteger(id) && id > 0);
        let movementData: DirectusInventoryMovement[] = [];
        if (receivingIds.length > 0) {
            const movementParams = new URLSearchParams({
                "filter[source_document_id][_in]": receivingIds.join(","),
                fields: "source_document_id,product_id,lot_id,branch_id,quantity,batch_no,manufacturing_date",
                limit: "-1"
            });
            const movementRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements?${movementParams.toString()}`, { headers, cache: "no-store" });
            movementData = (movementRes.ok ? (await movementRes.json()).data || [] : []) as DirectusInventoryMovement[];
        }

        // Fetch actual product details from products table as a fallback/guarantee
        const productIds = popData.map((p) => typeof p.product_id === "object" && p.product_id ? p.product_id.product_id : p.product_id).filter(Boolean);
        let products: ProductMin[] = [];
        if (productIds.length > 0) {
            const prodUrl = `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=*,unit_of_measurement.*,parent_id.unit_of_measurement.unit_shortcut&limit=-1`;
            const prodRes = await fetch(prodUrl, { headers, cache: "no-store" });
            if (prodRes.ok) {
                products = (await prodRes.json()).data as ProductMin[] || [];
            }
        }

        // Merge them
        return popData.map((pop) => {
            const rawProdId = typeof pop.product_id === "object" && pop.product_id ? pop.product_id.product_id : pop.product_id;
            const productObj = products.find((p) => Number(p.product_id) === Number(rawProdId)) || {
                product_id: Number(rawProdId) || 0,
                product_name: `Product ID: ${rawProdId}`,
                product_code: `ID-${rawProdId}`
            };
            const matchingLots = porData.filter((r) => Number(r.product_id) === Number(rawProdId));
            const acceptedLot = matchingLots.find(lot => Number(lot.branch_id) !== 182);
            const activeLot = acceptedLot || matchingLots[0];
            const receivingIdsForProduct = receivingData
                .filter(row => relationId(row.product_id, "product_id") === Number(rawProdId))
                .map(row => receivingRecordId(row.purchase_order_product_id));
            const lineHistory = receivingHistory.byLine.get(Number(pop.purchase_order_product_id)) || { received: 0, rejected: 0 };
            const previouslyReceivedQuantity = lineHistory.received;
            const previouslyRejectedQuantity = lineHistory.rejected;
            const remainingQuantity = Math.max(0, Number(pop.ordered_quantity || 0) - previouslyReceivedQuantity);
            const lineId = Number(pop.purchase_order_product_id);
            const latestReceipt = receivingData
                .filter(row => resolvePurchaseOrderLineId(row, popData) === lineId)
                .sort((left, right) => {
                    const rightDate = Date.parse(String(right.received_date || "")) || 0;
                    const leftDate = Date.parse(String(left.received_date || "")) || 0;
                    return rightDate - leftDate || receivingRecordId(right.purchase_order_product_id) - receivingRecordId(left.purchase_order_product_id);
                })[0];
            const latestReceiptId = latestReceipt ? receivingRecordId(latestReceipt.purchase_order_product_id) : 0;
            const latestReceiptBranchId = latestReceipt ? movementRelationId(latestReceipt.branch_id, "id") : NaN;
            const latestReceiptMovements = latestReceiptId > 0
                ? movementData.filter(row => relationId(row.source_document_id, "purchase_order_product_id") === latestReceiptId)
                : [];
            const latestAcceptedAllocations = sumMovementAllocations(
                latestReceiptMovements,
                Number.isSafeInteger(latestReceiptBranchId) ? latestReceiptBranchId : null
            );
            const latestRejectedByLot = new Map<number, number>();
            if (Number.isSafeInteger(latestReceiptBranchId)) {
                for (const movement of latestReceiptMovements) {
                    const movementBranchId = movementRelationId(movement.branch_id, "id");
                    if (movementBranchId === latestReceiptBranchId) continue;
                    const storageLotId = movementRelationId(movement.lot_id, "lot_id");
                    const quantity = Number(movement.quantity || 0);
                    if (Number.isSafeInteger(storageLotId) && storageLotId > 0 && Number.isFinite(quantity) && quantity > 0) {
                        latestRejectedByLot.set(storageLotId, (latestRejectedByLot.get(storageLotId) || 0) + quantity);
                    }
                }
            }
            const rejectedAllocations = [...latestRejectedByLot.entries()].map(([storage_lot_id, quantity]) => ({ storage_lot_id, quantity }));
            const latestMovementWithDate = latestReceiptMovements.find(row => Boolean(row.manufacturing_date));
            const latestReceivedQuantity = Number(latestReceipt?.received_quantity || 0);
            const latestRejectedQuantity = Number(latestReceipt?.quantity_rejected || 0);
            const latestAcceptedQuantity = Math.max(0, latestReceivedQuantity - latestRejectedQuantity);
            const latestPrimaryLotId = resolveInventoryLotId(latestReceipt?.lot_id)
                || latestAcceptedAllocations[0]?.storage_lot_id
                || rejectedAllocations[0]?.storage_lot_id
                || null;
            const latestSnapshot: LatestReceivingSnapshot | null = latestReceipt
                ? {
                    receipt_number: String(latestReceipt.receipt_no || ""),
                    received_quantity: latestReceivedQuantity,
                    accepted_quantity: latestAcceptedQuantity,
                    rejected_quantity: latestRejectedQuantity,
                    supplier_batch_number: String(latestReceipt.batch_no || ""),
                    storage_lot_id: latestPrimaryLotId,
                    accepted_lot_allocations: latestAcceptedAllocations,
                    rejected_lot_allocations: rejectedAllocations,
                    manufacturing_date: latestMovementWithDate?.manufacturing_date || null,
                    expiration_date: latestReceipt.expiry_date || null,
                    rejection_reason: String(latestReceipt.rejection_reason || ""),
                    qa_status: String(latestReceipt.qa_status || "Pending"),
                    branch_id: Number.isSafeInteger(latestReceiptBranchId) ? latestReceiptBranchId : null
                }
                : null;
            const movementForProduct = movementData.filter(row => receivingIdsForProduct.includes(relationId(row.source_document_id, "purchase_order_product_id") || 0));
            const activeLotId = resolveInventoryLotId(activeLot?.lot_id);
            const activeBatch = activeLot ? canonicalBatchNumber(activeLot.batch_no, activeLot.lot_number) : null;
            const matchingMovement = movementForProduct.find(row => {
                const movementLotId = relationId(row.lot_id, "lot_id");
                const movementBatch = canonicalBatchNumber(row.batch_no, null);
                return (!activeLotId || movementLotId === activeLotId)
                    && (!activeBatch || movementBatch === activeBatch)
                    && Boolean(row.manufacturing_date);
            }) || movementForProduct.find(row => Boolean(row.manufacturing_date));

            return {
                line_id: pop.purchase_order_product_id, // map line_id to pop.purchase_order_product_id so QA receiving can update it
                shipment_id: shipmentId,
                product_id: productObj,
                quantity_ordered: Number(pop.ordered_quantity || 0),
                quantity_received: previouslyReceivedQuantity,
                quantity_rejected: previouslyRejectedQuantity,
                previously_received_quantity: previouslyReceivedQuantity,
                previously_rejected_quantity: previouslyRejectedQuantity,
                remaining_quantity: remainingQuantity,
                latest_receipt: latestSnapshot,
                rejection_reason: latestSnapshot?.rejection_reason || "",
                qa_status: activeLot ? activeLot.qa_status || "Pending" : "Pending",
                // purchase_order_products.unit_price is the PHP base price;
                // unit_price_foreign is the submitted transaction-currency price.
                base_unit_cost_php: normalizeLegacyDecimal(
                    pop.unit_price,
                    "0.0000",
                    UNIT_PRICE_DECIMAL_SCALE,
                    `purchase_order_products/${pop.purchase_order_product_id}.unit_price`
                ),
                unit_price_foreign: normalizeLegacyDecimal(
                    pop.unit_price_foreign ?? pop.unit_price,
                    "0.0000",
                    UNIT_PRICE_DECIMAL_SCALE,
                    `purchase_order_products/${pop.purchase_order_product_id}.unit_price_foreign`
                ),
                allocated_expense_php: "0.00",
                final_landed_unit_cost: normalizeLegacyDecimal(
                    activeLot?.unit_cost ?? pop.unit_price,
                    "0.0000",
                    UNIT_PRICE_DECIMAL_SCALE,
                    `purchase_order_products/${pop.purchase_order_product_id}.final_landed_unit_cost`
                ),
                batch_no: activeLot ? canonicalBatchNumber(activeLot.batch_no, activeLot.lot_number) || "" : "",
                lot_number: activeLot ? canonicalBatchNumber(activeLot.batch_no, activeLot.lot_number) || "" : "",
                lot_id: resolveInventoryLotId(activeLot?.lot_id),
                manufacturing_date: latestSnapshot?.manufacturing_date || matchingMovement?.manufacturing_date || null,
                expiration_date: latestSnapshot?.expiration_date || (activeLot ? activeLot.expiry_date || "" : ""),
                purchase_intent: pop.purchase_intent || "Buffer_Stock",
                job_order_id: pop.job_order_id || null,
                discount_percent: Number(pop.discount_percent || 0),
                vat_percent: Number(pop.vat_percent || 0),
                withholding_percent: Number(pop.withholding_percent || 0)
            };
        });
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch shipment line items:", e);
        return [];
    }
}

export async function createIncomingShipment(
    shipmentData: Partial<DirectusShipment>,
    lineItems: ExtendedShipmentLineItem[],
    userId?: number | null
): Promise<unknown> {
    let poId: number | null = null;
    const createdProductIds: number[] = [];
    try {
        await assertMrpProductJobOrderPairs(lineItems);
        const totalPhp = normalizeDecimal(String(shipmentData.total_php_value ?? 0));
        const extendedData = shipmentData as ExtendedShipment;
        const exchangeRate = DecimalValue.from(extendedData.exchange_rate ?? 58).toFixed(6);
        const totalForeignCurrency = extendedData.total_foreign_currency != null
            ? normalizeDecimal(String(extendedData.total_foreign_currency))
            : DecimalValue.from(totalPhp).divideRounded(exchangeRate, 2).toFixed(2);

        const poPayload = {
            purchase_order_no: `PO-${extendedData.reference_number || Date.now()}`,
            reference: extendedData.reference_number,
            remark: extendedData.remark || extendedData.notes || "Registered via Incoming Shipments portal.",
            supplier_name: typeof extendedData.supplier_id === "object" && extendedData.supplier_id ? (extendedData.supplier_id as Record<string, unknown>).id : extendedData.supplier_id,
            receiving_type: 1,
            payment_type: 1,
            price_type: "Internal",
            date_encoded: new Date().toISOString(),
            date: new Date().toISOString().split("T")[0],
            time: new Date().toTimeString().split(" ")[0],
            datetime: new Date().toISOString().replace("Z", "").replace("T", " "),
            gross_amount: totalPhp,
            total_amount: totalPhp,
            inventory_status: shipmentStatusToInventoryStatus(extendedData.status || "Ordered"),
            payment_status: 1, // Pending Payment
            branch_id: extendedData.branch_id || 182,
            is_posted: 0,
            lead_time_receiving: extendedData.date_received || null,
            encoder_id: userId || null,
            exchange_rate: exchangeRate,
            total_foreign_currency: totalForeignCurrency
        };

        const res = await fetch(`${DIRECTUS_URL}/items/purchase_order`, {
            method: "POST",
            headers,
            body: JSON.stringify(poPayload)
        });

        if (!res.ok) {
            let errorMsg = `Failed to create PO header: ${res.status}`;
            try {
                const errorJson = await res.json();
                if (errorJson.errors && errorJson.errors[0]?.message) {
                    errorMsg = errorJson.errors[0].message;
                }
            } catch { }
            throw new Error(errorMsg);
        }
        const poJson = await res.json();
        poId = poJson.data.purchase_order_id;
        if (!poId) throw new Error("Directus did not return the created purchase-order ID.");

        // Sync to purchase_order_products for this PO

        for (const item of lineItems) {
            const qty = Number(item.quantity_ordered || 0);
            const price = item.base_unit_cost_php || 0;
            const amounts = calculatePurchaseOrderLine({
                quantity: qty,
                unitPrice: price,
                discountPercent: Number(item.discount_percent || 0),
                vatPercent: Number(item.vat_percent || 0),
                withholdingPercent: Number(item.withholding_percent || 0)
            }, 1);

            const popRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_products`, {
                method: "POST",
                headers,
                body: JSON.stringify(buildPurchaseOrderProductPayload({
                    purchaseOrderId: poId,
                    productId: typeof item.product_id === "object" ? item.product_id.product_id : item.product_id,
                    quantity: qty,
                    unitPrice: price,
                    discountPercent: Number(item.discount_percent || 0),
                    vatPercent: Number(item.vat_percent || 0),
                    withholdingPercent: Number(item.withholding_percent || 0),
                    exchangeRate: 1,
                    branchId: (shipmentData as ExtendedShipment).branch_id || 182,
                    purchaseIntent: item.purchase_intent,
                    jobOrderId: item.job_order_id,
                    discountType: item.discount_type,
                    received: 0
                }, amounts))
            });

            if (!popRes.ok) {
                let errorMsg = `Failed to create PO product item: ${popRes.status}`;
                try {
                    const errorJson = await popRes.json();
                    if (errorJson.errors && errorJson.errors[0]?.message) {
                        errorMsg = errorJson.errors[0].message;
                    }
                } catch { }
                throw new Error(errorMsg);
            }
            const popJson = await popRes.json();
            createdProductIds.push(popJson.data.purchase_order_product_id);
        }

        return { success: true, shipment_id: poId };
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to save purchase order. Rolling back...", e);
        for (const pid of createdProductIds) {
            await fetch(`${DIRECTUS_URL}/items/purchase_order_products/${pid}`, { method: "DELETE", headers }).catch(() => { });
        }
        if (poId) {
            await fetch(`${DIRECTUS_URL}/items/purchase_order/${poId}`, { method: "DELETE", headers }).catch(() => { });
        }
        throw e;
    }
}

export async function updateIncomingShipmentStatus(
    shipmentId: number,
    status: ShipmentStatusLabel,
    userId?: number | null,
    leadTimeReceiving?: string | null
) {
    try {
        if (status === "Receiving (QA)" || status === "Received") {
            const linesRes = await fetchShipmentLineItems(shipmentId);
            for (const l of linesRes) {
                const finalLandedUnitCost = Number(l.final_landed_unit_cost || l.base_unit_cost_php || 0);
                const prod = l.product_id;
                const prodId = prod && typeof prod === "object" ? prod.product_id : prod;
                if (finalLandedUnitCost > 0 && prodId) {
                    await fetch(`${DIRECTUS_URL}/items/products/${prodId}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({
                            cost_per_unit: finalLandedUnitCost,
                            estimated_unit_cost: finalLandedUnitCost
                        })
                    }).catch(err => console.error("Error updating product cost on status change:", err));
                }
            }
        }

        const updatePayload: Record<string, unknown> = {
            inventory_status: shipmentStatusToInventoryStatus(status)
        };
        if (status === "Received" || status === "Receiving (QA)") {
            updatePayload.date_received = new Date().toISOString().split('T')[0];
            updatePayload.receiver_id = userId || null;
        }
        if (status === "Approved") {
            updatePayload.approver_id = userId || null;
            updatePayload.date_approved = new Date().toISOString();
        }
        if (leadTimeReceiving !== undefined) {
            updatePayload.lead_time_receiving = leadTimeReceiving;
        }
        const res = await fetch(`${DIRECTUS_URL}/items/purchase_order/${shipmentId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload)
        });

        if (!res.ok) throw new Error(`Failed to update purchase order status: ${res.status}`);

        return { success: true };
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to update purchase order status:", e);
        throw e;
    }
}

export async function receiveIncomingShipment(
    shipmentId: number,
    branchId: number,
    lineItemUpdates: Array<{
        line_id: number;
        product_id: number;
        batch_no?: string | null;
        lot_id: number;
        expiry_date?: string | null;
        received_quantity: number;
        unit_price: number;
        total_amount: number;
        qa_status?: string | null;
        quantity_rejected?: number | null;
        rejection_reason?: string | null;
    }>,
    userId?: number | null
) {
    try {
        // Insert into purchase_order_receiving table for each item
        for (const item of lineItemUpdates) {
            const porPayload = {
                purchase_order_id: shipmentId,
                purchase_order_line_id: item.line_id,
                product_id: item.product_id,
                batch_no: item.batch_no || null,
                lot_id: item.lot_id,
                expiry_date: item.expiry_date || null,
                received_quantity: item.received_quantity,
                unit_price: item.unit_price,
                discounted_amount: 0,
                total_amount: item.total_amount,
                branch_id: branchId,
                receipt_no: `REC-${shipmentId}-${Date.now()}`,
                received_date: new Date().toISOString(),
                isPosted: 1,
                qa_status: item.qa_status || "Passed",
                quantity_rejected: item.quantity_rejected || 0,
                rejection_reason: item.rejection_reason || null,
                allocated_expense_php: 0,
                final_landed_unit_cost: item.unit_price
            };

            const porRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving`, {
                method: "POST",
                headers,
                body: JSON.stringify(porPayload)
            });
            if (!porRes.ok) {
                const errText = await porRes.text();
                throw new Error(`Failed to insert receiving log for product ${item.product_id}: ${errText}`);
            }
        }

        // Update purchase_order status to Received (6)
        const poPayload = {
            inventory_status: shipmentStatusToInventoryStatus("Received"),
            date_received: new Date().toISOString(),
            receiver_id: userId || null
        };
        const poRes = await fetch(`${DIRECTUS_URL}/items/purchase_order/${shipmentId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(poPayload)
        });
        if (!poRes.ok) {
            throw new Error(`Failed to update PO header: ${poRes.statusText}`);
        }

        return { success: true };
    } catch (e) {
        console.error("Error in receiveIncomingShipment helper:", e);
        throw e;
    }
}


