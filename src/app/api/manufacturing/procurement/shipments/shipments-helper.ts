import { DIRECTUS_URL, headers } from "../_directus";
import { INVENTORY_STATUS, inventoryStatusToPurchaseOrderStatus, inventoryStatusToShipmentStatus, isPurchaseOrderApprovalStatus, PAYMENT_STATUS, RECEIVING_QUEUE_INVENTORY_STATUS_IDS, shipmentStatusToInventoryStatus, type ShipmentStatusLabel } from "../_domain";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";
import { calculateLandedCostAllocations, normalizeAllocationMethod } from "../expenses/expenses-helper";
import {
    ProductWeightValidationError,
    resolveProductWeightBreakdown
} from "@/modules/manufacturing-management/procurement/packaging-weight";

import { DirectusShipment } from "@/modules/manufacturing-management/procurement/types";
import type { PurchaseOrderListQuery } from "../../purchase-orders/_schemas";
import { buildPurchaseOrderProductPayload, calculatePurchaseOrderTotals } from "../../purchase-orders/_domain";
import { resolvePurchaseOrderLineId, summarizeReceivingHistory } from "../../qa-receiving/_receiving-history";
import { forceReceivedById, isForceReceived, remainingReceivingQuantity } from "../../qa-receiving/_force-received";
import { assertMrpProductJobOrderPairs } from "../../purchase-orders/_mrp-validation";
import {
    fetchCurrentPurchaseOrderRejectionStages,
    type PurchaseOrderRejectionStage
} from "../../purchase-orders/_rejection-guard";
import {
    CURRENCY_DECIMAL_SCALE,
    DecimalValue,
    EXCHANGE_RATE_DECIMAL_SCALE,
    UNIT_PRICE_DECIMAL_SCALE
} from "@/modules/manufacturing-management/decimal";
import { PurchaseOrderPaymentModeError, validatePurchaseOrderPaymentMode } from "../../purchase-orders/_payment-modes";
import {
    hasLandedCostStatus,
    isLandedCostPostingEligible
} from "@/modules/manufacturing-management/procurement/landed-cost-eligibility";
import { getLandedCostComputation } from "../landed-cost/_domain";
import {
    ProductCategoryTypeValidationError,
    resolveProductCategoryTypes,
    validatePurchaseOrderCategoryTypes,
    type PurchaseOrderCategoryType
} from "../_category-type";

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
    payment_mode?: number | null;
    payment_terms?: number | null;
    delivery_terms?: string | null;
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
    is_posted?: number | boolean | null;
    is_posted_amounts?: number | boolean | null;
    force_received_at?: string | null;
    force_received_by?: number | Record<string, unknown> | null;
    force_received_reason?: string | null;
}

interface DirectusPaymentMode {
    id: number;
    mode_name?: string | null;
}

interface DirectusSupplier {
    id: number;
    supplier_name: string;
    is_foreign?: number | boolean;
    currency?: string;
    default_currency?: string;
    country?: string;
    payment_terms?: string | null;
    delivery_terms?: string | null;
    notes_or_comments?: string;
}

interface DirectusPOProduct {
    purchase_order_product_id: number;
    purchase_order_id: number;
    product_id: number | { product_id: number };
    ordered_quantity?: number | string;
    unit_price?: number | string;
    discount_type?: number | null;
    discount_mode?: "Percentage" | "Fixed Amount" | null;
    discount_amount?: number | string | null;
    discount_amount_foreign?: number | string | null;
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
    product_type?: unknown;
    unit_of_measurement?: unknown;
    unit_of_measurement_count?: number;
    parent_id?: unknown;
    weight?: number | string | null;
    product_weight?: number | string | null;
    net_weight?: number | string | null;
    outer_carton_weight?: number | string | null;
    pallet_weight?: number | string | null;
    weight_unit_id?: unknown;
    cbm_height?: number | string | null;
    cbm_width?: number | string | null;
    cbm_length?: number | string | null;
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
    receiving_header_id?: number | { id: number; receiving_ticket_no?: string | null } | null;
    batch_no?: string | null;
    lot_id?: number | { lot_id: number } | null;
    received_quantity?: number | string | null;
    quantity_rejected?: number | string | null;
    is_replacement?: boolean | number | null;
    is_over_received?: boolean | number | null;
    over_delivery_quantity?: number | string | null;
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
    is_over_received: boolean;
    over_delivery_quantity: number;
}

export interface ExtendedShipmentLineItem {
    line_id?: number;
    shipment_id?: number;
    product_id: number | ProductMin;
    unit_gross_weight_kg?: number;
    unit_net_weight_kg?: number | null;
    unit_outer_carton_weight_kg?: number | null;
    unit_pallet_weight_kg?: number | null;
    category_type?: PurchaseOrderCategoryType;
    quantity_ordered?: number;
    quantity_received?: number;
    quantity_rejected?: number;
    previously_received_quantity?: number;
    previously_rejected_quantity?: number;
    previously_accepted_quantity?: number;
    remaining_quantity?: number;
    remaining_accepted_quantity?: number;
    is_over_received?: boolean;
    over_delivery_quantity?: number;
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
    discount_mode?: "Percentage" | "Fixed Amount" | null;
    discount_amount?: number | string | null;
    discount_amount_foreign?: number | string | null;
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

function mapPurchaseOrder(
    po: DirectusPO,
    suppliers: ReadonlyMap<number, DirectusSupplier>,
    paymentModes: ReadonlyMap<number, DirectusPaymentMode>,
    canonicalStatus = false,
    rejectionStage: PurchaseOrderRejectionStage | null = null
) {
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
        // Keep the normalized supplier relation available under the legacy
        // field name consumed by purchase-amount selectors and ledgers.
        supplier_name: supplier,
        date_received: po.date_received || null,
        lead_time_receiving: po.lead_time_receiving || null,
        total_foreign_currency: foreignCurrency,
        exchange_rate: rate,
        total_php_value: totalPhp,
        inventory_status: po.inventory_status || null,
        payment_status: po.payment_status || null,
        status,
        rejection_stage: rejectionStage,
        remark: po.remark || "",
        created_at: po.date_encoded || "",
        branch_id: po.branch_id || null,
        payment_type: po.payment_type || null,
        payment_mode: po.payment_mode || null,
        payment_mode_name: po.payment_mode ? paymentModes.get(Number(po.payment_mode))?.mode_name || null : null,
        payment_terms: po.payment_terms || null,
        delivery_terms: po.delivery_terms || null,
        price_type: po.price_type || null,
        currency_code: po.currency_code || "PHP",
        workflow_revision: Number(po.workflow_revision || 0),
        approver_id: po.approver_id || null,
        finance_id: po.finance_id || null,
        date_approved: po.date_approved || null,
        date_financed: po.date_financed || null,
        approval_rule_id: po.approval_rule_id || null,
        approval_requires_finance: po.approval_requires_finance == null ? null : Number(po.approval_requires_finance) === 1,
        approval_allow_self_approval: po.approval_allow_self_approval == null ? null : Number(po.approval_allow_self_approval) === 1,
        is_posted: po.is_posted === true || Number(po.is_posted) === 1 ? 1 : 0,
        is_posted_amounts: po.is_posted_amounts === true || Number(po.is_posted_amounts) === 1 ? 1 : 0,
        isForceReceived: isForceReceived(po.force_received_at),
        forceReceivedAt: po.force_received_at || null,
        forceReceivedBy: forceReceivedById(po.force_received_by),
        forceReceivedReason: po.force_received_reason || null
    };
}

async function fetchPaymentModeMap(ids: readonly number[]): Promise<Map<number, DirectusPaymentMode>> {
    const uniqueIds = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
    if (uniqueIds.length === 0) return new Map();
    try {
        const params = new URLSearchParams({
            fields: "id,mode_name",
            limit: String(uniqueIds.length),
            filter: JSON.stringify({ id: { _in: uniqueIds } })
        });
        const response = await fetch(`${DIRECTUS_URL}/items/purchase_order_payment_modes?${params.toString()}`, { headers, cache: "no-store" });
        if (!response.ok) return new Map();
        const rows = ((await response.json()).data || []) as DirectusPaymentMode[];
        return new Map(rows.map(row => [Number(row.id), row]));
    } catch (error) {
        console.warn("[Manufacturing Directus API] Failed to resolve purchase-order payment type names.", error);
        return new Map();
    }
}

async function fetchItemsWithDeliveryTermsFallback(collection: string, params: URLSearchParams): Promise<Response> {
    const url = `${DIRECTUS_URL}/items/${collection}?${params.toString()}`;
    const response = await fetch(url, { headers, cache: "no-store" });
    if (response.ok || response.status !== 403) return response;

    const requestedFields = (params.get("fields") || "").split(",").filter(Boolean);
    const fallbackFields = requestedFields.filter(field => field !== "delivery_terms");
    if (fallbackFields.length === requestedFields.length) return response;

    console.warn(`[Manufacturing Directus API] ${collection} denied delivery_terms; retrying without the optional field.`);
    const fallbackParams = new URLSearchParams(params);
    fallbackParams.set("fields", fallbackFields.join(","));
    return fetch(`${DIRECTUS_URL}/items/${collection}?${fallbackParams.toString()}`, { headers, cache: "no-store" });
}

async function fetchSupplierMap(ids: readonly number[]): Promise<Map<number, DirectusSupplier>> {
    const uniqueIds = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
    if (uniqueIds.length === 0) return new Map();
    const params = new URLSearchParams({
        fields: "id,supplier_name,is_foreign,currency,country,payment_terms,delivery_terms,notes_or_comments",
        limit: String(uniqueIds.length),
        filter: JSON.stringify({ id: { _in: uniqueIds } })
    });
    const response = await fetchItemsWithDeliveryTermsFallback("suppliers", params);
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

async function findCurrentRejectionPurchaseOrderIds(stage: PurchaseOrderRejectionStage) {
    const params = new URLSearchParams({
        fields: "purchase_order_id,inventory_status,workflow_revision",
        limit: "-1",
        "filter[inventory_status][_eq]": String(INVENTORY_STATUS.REJECTED)
    });
    const response = await fetch(`${DIRECTUS_URL}/items/purchase_order?${params.toString()}`, { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load rejected purchase orders (${response.status}).`);
    const rows = ((await response.json()).data || []) as Array<{
        purchase_order_id?: number;
        inventory_status?: number | null;
        workflow_revision?: number | null;
    }>;
    const stages = await fetchCurrentPurchaseOrderRejectionStages(rows.map(row => ({
        purchaseOrderId: Number(row.purchase_order_id),
        inventoryStatus: row.inventory_status ?? null,
        workflowRevision: Number(row.workflow_revision || 0)
    })));
    return rows
        .map(row => Number(row.purchase_order_id))
        .filter(id => stages.get(id) === stage);
}

async function addApprovalStageFilter(clauses: Record<string, unknown>[], query: PurchaseOrderListQuery) {
    if (!query.approvalStage) return;

    if (!query.status || isPurchaseOrderApprovalStatus(query.status)) {
        clauses.push({
            _and: [
                { finance_id: { _null: true } },
                {
                    _or: [
                        { inventory_status: { _eq: INVENTORY_STATUS.REQUESTED } },
                        {
                            _and: [
                                { inventory_status: { _eq: INVENTORY_STATUS.APPROVED } },
                                { approver_id: { _null: true } }
                            ]
                        }
                    ]
                }
            ]
        });
        return;
    }

    if (query.status === "Approved") {
        clauses.push({ inventory_status: { _in: [INVENTORY_STATUS.APPROVED, INVENTORY_STATUS.FOR_PICKUP] } });
        clauses.push({ finance_id: { _nnull: true } });
        return;
    }

    if (query.status === "Awaiting Payment") {
        clauses.push({
            _and: [
                { inventory_status: { _in: [INVENTORY_STATUS.REQUESTED, INVENTORY_STATUS.APPROVED] } },
                { payment_status: { _eq: PAYMENT_STATUS.AWAITING_PAYMENT } },
                { finance_id: { _nnull: true } }
            ]
        });
        return;
    }

    if (query.status === "Rejected") {
        const rejectedIds = await findCurrentRejectionPurchaseOrderIds(query.approvalStage);
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
    } else if (query.status && !(query.approvalStage && isPurchaseOrderApprovalStatus(query.status))) {
        clauses.push({ inventory_status: { _eq: shipmentStatusToInventoryStatus(query.status) } });
    }
    await addApprovalStageFilter(clauses, query);
    if (query.startDate) clauses.push({ date_encoded: { _gte: `${query.startDate}T00:00:00` } });
    if (query.endDate) clauses.push({ date_encoded: { _lte: `${query.endDate}T23:59:59` } });
    if (clauses.length === 1) Object.assign(filter, clauses[0]);
    if (clauses.length > 1) filter._and = clauses;

    const params = new URLSearchParams({
        fields: "purchase_order_id,purchase_order_no,reference,supplier_name,date_received,lead_time_receiving,total_amount,gross_amount,inventory_status,payment_status,date_encoded,branch_id,payment_type,payment_mode,payment_terms,delivery_terms,price_type,exchange_rate,total_foreign_currency,currency_code,workflow_revision,remark,approver_id,finance_id,date_approved,date_financed,approval_rule_id,approval_requires_finance,approval_allow_self_approval,is_posted,is_posted_amounts,force_received_at,force_received_by,force_received_reason",
        limit: String(query.limit),
        offset: String((query.page - 1) * query.limit),
        sort: `${query.direction === "desc" ? "-" : ""}${query.sort}`,
        meta: "filter_count"
    });
    if (Object.keys(filter).length > 0) params.set("filter", JSON.stringify(filter));

    const res = await fetchItemsWithDeliveryTermsFallback("purchase_order", params);
    if (!res.ok) throw new Error(`Failed to load purchase orders (${res.status}).`);
    const body = await res.json();
    const rows = (body.data || []) as DirectusPO[];
    const suppliers = await fetchSupplierMap(rows.map(row => supplierId(row.supplier_name)).filter((id): id is number => id !== null));
    const paymentModes = await fetchPaymentModeMap(rows.map(row => Number(row.payment_mode)));
    const rejectionStages = await fetchCurrentPurchaseOrderRejectionStages(rows.map(row => ({
        purchaseOrderId: Number(row.purchase_order_id),
        inventoryStatus: row.inventory_status ?? null,
        workflowRevision: Number(row.workflow_revision || 0)
    })));
    const total = Number(body.meta?.filter_count || 0);
    return {
        data: rows.map(row => mapPurchaseOrder(row, suppliers, paymentModes, true, rejectionStages.get(Number(row.purchase_order_id)) || null)),
        meta: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / query.limit))
        }
    };
}

export async function fetchIncomingShipments(options: { landedCostOnly?: boolean; includePosted?: boolean } = {}): Promise<unknown[]> {
    try {
        const landedCostFilter = options.landedCostOnly
            ? `&filter[inventory_status][_eq]=${INVENTORY_STATUS.RECEIVED}&filter[payment_status][_eq]=${PAYMENT_STATUS.AWAITING_PAYMENT}`
            : "";
        const url = `${DIRECTUS_URL}/items/purchase_order?fields=*&sort=-date_encoded&limit=-1${landedCostFilter}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        const fetchedPOList = ((await res.json()).data || []) as DirectusPO[];
        const poList = options.landedCostOnly
            ? fetchedPOList.filter(row => hasLandedCostStatus(row) && (options.includePosted || isLandedCostPostingEligible(row)))
            : fetchedPOList;
        const suppliers = await fetchSupplierMap(poList.map(row => supplierId(row.supplier_name)).filter((id): id is number => id !== null));
        const paymentModes = await fetchPaymentModeMap(poList.map(row => Number(row.payment_mode)));
        const rejectionStages = await fetchCurrentPurchaseOrderRejectionStages(poList.map(row => ({
            purchaseOrderId: Number(row.purchase_order_id),
            inventoryStatus: row.inventory_status ?? null,
            workflowRevision: Number(row.workflow_revision || 0)
        })));

        return poList.map(row => mapPurchaseOrder(row, suppliers, paymentModes, false, rejectionStages.get(Number(row.purchase_order_id)) || null));
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch incoming shipments:", e);
        return [];
    }
}

export async function fetchShipmentLineItems(
    shipmentId: number,
    options: { requireCompletePackagingWeight?: boolean } = {}
): Promise<ExtendedShipmentLineItem[]> {
    try {
        // Fetch the header first so force-closed orders can expose zero remaining intake.
        const headerRes = await fetch(
            `${DIRECTUS_URL}/items/purchase_order/${shipmentId}?fields=purchase_order_id,force_received_at`,
            { headers, cache: "no-store" }
        );
        const header = headerRes.ok ? ((await headerRes.json()).data || {}) as { force_received_at?: unknown } : {};
        const forceClosed = isForceReceived(header.force_received_at);

        // Fetch purchase_order_products
        const popUrl = `${DIRECTUS_URL}/items/purchase_order_products?filter[purchase_order_id][_eq]=${shipmentId}&fields=*,product_id.*,product_id.unit_of_measurement.*,discount_type.*&limit=-1`;
        const popRes = await fetch(popUrl, { headers, cache: "no-store" });
        if (!popRes.ok) return [];
        const popData = (await popRes.json()).data as DirectusPOProduct[] || [];

        // Read the canonical landed-cost computation first. Compatibility rows are
        // retained only as a read fallback for older purchase orders.
        let canonicalRule: string | null = null;
        let canonicalExpenses: Array<{ amount_php?: number | string }> = [];
        try {
            const canonical = await getLandedCostComputation(shipmentId);
            canonicalRule = canonical.computation?.allocation_rule || null;
            canonicalExpenses = canonical.expenses;
        } catch (error) {
            console.warn("[Manufacturing] Canonical landed-cost computation unavailable; using compatibility rows.", error);
        }

        // Fetch purchase_order_expenses for older procurement POs to calculate landed costs dynamically
        const expensesUrl = `${DIRECTUS_URL}/items/purchase_order_expenses?filter[purchase_order_id][_eq]=${shipmentId}&limit=-1`;
        const expensesRes = await fetch(expensesUrl, { headers, cache: "no-store" });
        const legacyExpenses = expensesRes.ok ? (await expensesRes.json()).data || [] : [];
        const expenses = canonicalRule ? canonicalExpenses : legacyExpenses;
        const totalExpensesPhp = expenses.reduce((sum: number, exp: { amount_php?: number | string }) => sum + Number(exp.amount_php || 0), 0);
        const allocationMethod = normalizeAllocationMethod(canonicalRule || legacyExpenses[0]?.allocation_method || "Value");

        // Manufacturing dates are persisted on inventory movements. Resolve them through
        // the receiving-record IDs instead of substituting the inventory lot creation date.
        const receivingUrl = `${DIRECTUS_URL}/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${shipmentId}&filter[is_reverted][_eq]=0&fields=purchase_order_product_id,purchase_order_line_id,product_id,receipt_no,receiving_header_id,receiving_header_id.receiving_ticket_no,batch_no,lot_id,received_quantity,quantity_rejected,is_replacement,is_over_received,over_delivery_quantity,expiry_date,rejection_reason,qa_status,branch_id,received_date&limit=-1`;
        let receivingRes = await fetch(receivingUrl, { headers, cache: "no-store" });
        if (!receivingRes.ok) {
            receivingRes = await fetch(
                `${DIRECTUS_URL}/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${shipmentId}&filter[is_reverted][_eq]=0&fields=purchase_order_product_id,product_id,receipt_no,batch_no,lot_id,received_quantity,quantity_rejected,is_replacement,expiry_date,rejection_reason,qa_status,branch_id,received_date&limit=-1`,
                { headers, cache: "no-store" }
            );
        }
        const receivingData = (receivingRes.ok ? (await receivingRes.json()).data || [] : []) as DirectusReceivingRecord[];
        const originalReceivingData = receivingData.filter(row => row.is_replacement !== true && Number(row.is_replacement) !== 1);
        const receivingHistory = summarizeReceivingHistory(originalReceivingData, popData);
        const receivingIds = originalReceivingData
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
            const prodUrl = `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=*,unit_of_measurement.*,weight_unit_id.*,parent_id,parent_id.unit_of_measurement.unit_shortcut,weight,product_weight,net_weight,outer_carton_weight,pallet_weight,weight_unit_id,cbm_height,cbm_width,cbm_length,product_type&limit=-1`;
            const prodRes = await fetch(prodUrl, { headers, cache: "no-store" });
            if (prodRes.ok) {
                products = (await prodRes.json()).data as ProductMin[] || [];
            }
        }

        const categoryTypes = await resolveProductCategoryTypes(
            productIds.map(Number),
            fetch
        );

        const weightBreakdowns = new Map<number, ReturnType<typeof resolveProductWeightBreakdown>>();

        // Calculate allocations dynamically
        const inputs = popData.map(line => {
            const rawProdId = typeof line.product_id === "object" && line.product_id ? line.product_id.product_id : line.product_id;
            const product = products.find(p => Number(p.product_id) === Number(rawProdId));
            const lineId = Number(line.purchase_order_product_id);
            const history = receivingHistory.byLine.get(lineId) || { received: 0, rejected: 0, accepted: 0 };
            const qty = originalReceivingData.length > 0
                ? Math.max(0, history.accepted)
                : Math.max(0, Number(line.ordered_quantity || 0));
            const categoryType = categoryTypes.get(Number(rawProdId));
            if (!categoryType) {
                throw new ProductCategoryTypeValidationError(
                    400,
                    "PRODUCT_CATEGORY_TYPE_REQUIRED",
                    `Product ${rawProdId} must have a RAW_MATERIAL, PACKAGING, or FINISHED_GOODS Category_Type in the product master.`,
                    { productId: Number(rawProdId), lineId }
                );
            }
            const weightBreakdown = resolveProductWeightBreakdown(product, {
                requireComplete: categoryType === "PACKAGING" && options.requireCompletePackagingWeight !== false,
                allowIncomplete: categoryType === "PACKAGING" && options.requireCompletePackagingWeight === false
            });
            weightBreakdowns.set(Number(rawProdId), weightBreakdown);
            const cbmH = Number((product as Record<string, unknown> | undefined)?.cbm_height || 0);
            const cbmW = Number((product as Record<string, unknown> | undefined)?.cbm_width || 0);
            const cbmL = Number((product as Record<string, unknown> | undefined)?.cbm_length || 0);
            return {
                key: lineId,
                quantity: qty,
                baseUnitCost: Number(line.unit_price || 0),
                weight: weightBreakdown.grossWeightKg,
                lineGrossWeightKg: weightBreakdown.grossWeightKg * qty,
                volume: cbmH * cbmW * cbmL,
                category_type: categoryType,
                weightUnit: weightBreakdown.weightUnitCode
            };
        });

        const allocations = calculateLandedCostAllocations(inputs, totalExpensesPhp, normalizeAllocationMethod(allocationMethod));

        // Merge them
        return popData.map((pop) => {
            const rawProdId = typeof pop.product_id === "object" && pop.product_id ? pop.product_id.product_id : pop.product_id;
            const productObj = products.find((p) => Number(p.product_id) === Number(rawProdId)) || {
                product_id: Number(rawProdId) || 0,
                product_name: `Product ID: ${rawProdId}`,
                product_code: `ID-${rawProdId}`
            };
            const weightBreakdown = weightBreakdowns.get(Number(rawProdId));
            const receivingIdsForProduct = originalReceivingData
                .filter(row => relationId(row.product_id, "product_id") === Number(rawProdId))
                .map(row => receivingRecordId(row.purchase_order_product_id));
            const lineHistory = receivingHistory.byLine.get(Number(pop.purchase_order_product_id)) || { received: 0, rejected: 0, accepted: 0 };
            const previouslyReceivedQuantity = lineHistory.received;
            const previouslyRejectedQuantity = lineHistory.rejected;
            const previouslyAcceptedQuantity = lineHistory.accepted;
            const remainingQuantity = remainingReceivingQuantity(
                forceClosed,
                Math.max(0, Number(pop.ordered_quantity || 0) - previouslyReceivedQuantity)
            );
            const remainingAcceptedQuantity = remainingReceivingQuantity(
                forceClosed,
                Math.max(0, Number(pop.ordered_quantity || 0) - previouslyAcceptedQuantity)
            );
            const lineId = Number(pop.purchase_order_product_id);
            const latestReceipt = originalReceivingData
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
                    receipt_number: String(
                        typeof latestReceipt.receiving_header_id === "object" && latestReceipt.receiving_header_id?.receiving_ticket_no
                            ? latestReceipt.receiving_header_id.receiving_ticket_no
                            : latestReceipt.receipt_no || ""
                    ),
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
                     branch_id: Number.isSafeInteger(latestReceiptBranchId) ? latestReceiptBranchId : null,
                     is_over_received: latestReceipt.is_over_received === true || Number(latestReceipt.is_over_received) === 1,
                     over_delivery_quantity: Number(latestReceipt.over_delivery_quantity || 0)
                }
                : null;
            const movementForProduct = movementData.filter(row => receivingIdsForProduct.includes(relationId(row.source_document_id, "purchase_order_product_id") || 0));
            const matchingMovement = movementForProduct.find(row => Boolean(row.manufacturing_date));

            const allocation = allocations.get(lineId);
            const finalLandedUnitCost = allocation ? allocation.finalLandedUnitCost : Number(pop.unit_price || 0);

            return {
                line_id: pop.purchase_order_product_id, // map line_id to pop.purchase_order_product_id so QA receiving can update it
                shipment_id: shipmentId,
                product_id: productObj,
                unit_gross_weight_kg: weightBreakdown?.grossWeightKg || 0,
                unit_net_weight_kg: weightBreakdown?.netWeightKg ?? null,
                unit_outer_carton_weight_kg: weightBreakdown?.outerCartonWeightKg ?? null,
                unit_pallet_weight_kg: weightBreakdown?.palletWeightKg ?? null,
                category_type: categoryTypes.get(Number(rawProdId)),
                quantity_ordered: Number(pop.ordered_quantity || 0),
                quantity_received: previouslyReceivedQuantity,
                quantity_rejected: previouslyRejectedQuantity,
                previously_received_quantity: previouslyReceivedQuantity,
                 previously_rejected_quantity: previouslyRejectedQuantity,
                 previously_accepted_quantity: previouslyAcceptedQuantity,
                 remaining_quantity: remainingQuantity,
                 remaining_accepted_quantity: remainingAcceptedQuantity,
                 is_over_received: latestSnapshot?.is_over_received || false,
                 over_delivery_quantity: latestSnapshot?.over_delivery_quantity || 0,
                 latest_receipt: latestSnapshot,
                rejection_reason: latestSnapshot?.rejection_reason || "",
                qa_status: latestReceipt ? latestReceipt.qa_status || "Pending" : "Pending",
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
                 allocated_expense_php: normalizeLegacyDecimal(
                     allocation?.allocatedExpense || 0,
                     "0.0000",
                     UNIT_PRICE_DECIMAL_SCALE,
                     `purchase_order_products/${pop.purchase_order_product_id}.allocated_expense_php`
                 ),
                final_landed_unit_cost: normalizeLegacyDecimal(
                    finalLandedUnitCost,
                    "0.0000",
                    UNIT_PRICE_DECIMAL_SCALE,
                    `purchase_order_products/${pop.purchase_order_product_id}.final_landed_unit_cost`
                ),
                batch_no: latestReceipt ? latestReceipt.batch_no || "" : "",
                lot_number: latestReceipt ? latestReceipt.batch_no || "" : "",
                lot_id: latestReceipt ? resolveInventoryLotId(latestReceipt.lot_id) : null,
                manufacturing_date: latestSnapshot?.manufacturing_date || matchingMovement?.manufacturing_date || null,
                expiration_date: latestSnapshot?.expiration_date || (latestReceipt ? latestReceipt.expiry_date || "" : ""),
                purchase_intent: pop.purchase_intent || "Buffer_Stock",
                job_order_id: pop.job_order_id || null,
                discount_type: pop.discount_type || null,
                discount_mode: pop.discount_mode || "Percentage",
                discount_amount_foreign: pop.discount_amount_foreign ?? null,
                discount_percent: Number(pop.discount_percent || 0),
                vat_percent: Number(pop.vat_percent || 0),
                withholding_percent: Number(pop.withholding_percent || 0)
            };
        });
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch shipment line items:", e);
        if (e instanceof ProductCategoryTypeValidationError || e instanceof ProductWeightValidationError) throw e;
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
        try {
            await validatePurchaseOrderPaymentMode(Number((shipmentData as ExtendedShipment).payment_mode));
        } catch (error) {
            if (error instanceof PurchaseOrderPaymentModeError) throw error;
            throw new PurchaseOrderPaymentModeError("The selected Payment Type could not be validated.", 503);
        }
        await assertMrpProductJobOrderPairs(lineItems);
        await validatePurchaseOrderCategoryTypes(lineItems.map(item => ({
            productId: typeof item.product_id === "object" ? Number(item.product_id.product_id) : Number(item.product_id),
            categoryType: item.category_type
        })));
        const productIds = [...new Set(lineItems.map(item =>
            typeof item.product_id === "object" ? Number(item.product_id.product_id) : Number(item.product_id)
        ))].filter(id => Number.isSafeInteger(id) && id > 0);
        const categoryTypes = await resolveProductCategoryTypes(productIds);
        const productsResponse = await fetch(
            `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,weight,product_weight,net_weight,outer_carton_weight,pallet_weight,weight_unit_id.*&limit=-1`,
            { headers, cache: "no-store" }
        );
        if (!productsResponse.ok) throw new Error("Unable to validate product weight data.");
        const products = ((await productsResponse.json()).data || []) as ProductMin[];
        const productsById = new Map(products.map(product => [Number(product.product_id), product]));
        for (const item of lineItems) {
            const productId = typeof item.product_id === "object" ? Number(item.product_id.product_id) : Number(item.product_id);
            const categoryType = categoryTypes.get(productId);
            const product = productsById.get(productId);
            if (!product || !categoryType) continue;
            resolveProductWeightBreakdown(product, { requireComplete: categoryType === "PACKAGING" });
        }
        const extendedData = shipmentData as ExtendedShipment;
        const exchangeRate = DecimalValue.from(extendedData.exchange_rate ?? 58).toFixed(6);
        const calculatedTotals = calculatePurchaseOrderTotals(lineItems.map(item => ({
            quantity: Number(item.quantity_ordered || 0),
            unitPrice: item.base_unit_cost_php || 0,
            discountMode: item.discount_mode || "Percentage",
            discountPercent: Number(item.discount_percent || 0),
            discountAmount: item.discount_amount ?? item.discount_amount_foreign ?? 0,
            vatPercent: Number(item.vat_percent || 0),
            withholdingPercent: Number(item.withholding_percent || 0)
        })), 1);
        const totalPhp = calculatedTotals.netPhp;
        const totalForeignCurrency = DecimalValue.from(totalPhp).divideRounded(exchangeRate, 2).toFixed(2);

        const poPayload = {
            purchase_order_no: `PO-${extendedData.reference_number || Date.now()}`,
            reference: extendedData.reference_number,
            remark: extendedData.remark || extendedData.notes || null,
            supplier_name: typeof extendedData.supplier_id === "object" && extendedData.supplier_id ? (extendedData.supplier_id as Record<string, unknown>).id : extendedData.supplier_id,
            receiving_type: 1,
            payment_type: extendedData.payment_type || null,
            payment_mode: extendedData.payment_mode,
            delivery_terms: extendedData.delivery_terms || null,
            price_type: "Internal",
            date_encoded: new Date().toISOString(),
            date: await getTodayDateString(),
            time: new Date().toTimeString().split(" ")[0],
            datetime: new Date().toISOString().replace("Z", "").replace("T", " "),
            gross_amount: calculatedTotals.grossPhp,
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

        for (let index = 0; index < lineItems.length; index += 1) {
            const item = lineItems[index];
            const qty = Number(item.quantity_ordered || 0);
            const price = item.base_unit_cost_php || 0;
            const amounts = calculatedTotals.lines[index];

            const popRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_products`, {
                method: "POST",
                headers,
                body: JSON.stringify(buildPurchaseOrderProductPayload({
                    purchaseOrderId: poId,
                    productId: typeof item.product_id === "object" ? item.product_id.product_id : item.product_id,
                    categoryType: item.category_type!,
                    quantity: qty,
                    unitPrice: price,
                    discountMode: item.discount_mode || "Percentage",
                    discountPercent: Number(item.discount_percent || 0),
                    discountAmount: item.discount_amount ?? item.discount_amount_foreign ?? 0,
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
            updatePayload.date_received = await getTodayDateString();
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
            payment_status: PAYMENT_STATUS.AWAITING_PAYMENT,
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



