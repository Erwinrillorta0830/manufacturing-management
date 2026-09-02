/* eslint-disable @typescript-eslint/no-explicit-any */
import { formatPhtDateTime, getTodayDateString } from "@/app/api/manufacturing/directus-api";
import {
    calculateIncrementalMaterialConsumption,
    loadYieldMaterials,
    ResolvedYieldJobOrder,
    YieldMaterial,
    YieldMaterialsError,
    verifyZeroComponentBOM
} from "./_yield-materials";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    fetchMmInventoryMovements,
    MmInventoryMovementError
} from "@/app/api/manufacturing/services/mm-inventory-movements.service";

const EPSILON = 0.000001;
const inFlightYieldClosures = new Map<string, Promise<Record<string, unknown>>>();

export interface CompleteYieldClosingInput {
    joId: string | number;
    yieldLedgerId?: string | number | null;
    productId: string | number;
    productName?: string;
    quantityProduced: string | number;
    branchId: string | number;
    lotNumber?: string | null;
    expirationDate?: string | null;
    manufacturingDate?: string | null;
    unitCost?: string | number | null;
    componentsConsumed?: unknown;
}

interface ComponentPlan {
    material: YieldMaterial;
    quantity: number;
    lots: LotAllocation[];
}

interface LotAllocation {
    lotId: number;
    lotNumber: string;
    expiryDate: string | null;
    createdOn: string | null;
    quantity: number;
}

interface StockLot extends LotAllocation {
    availableQuantity: number;
}

interface CreatedMutation {
    collection: string;
    id: number;
}

interface UpdatedMutation {
    collection: string;
    id: number;
    previous: Record<string, unknown>;
}

export class YieldCompletionError extends Error {
    reconciliationRequired = false;
    operationKey?: string;

    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        readonly reconciliation?: Record<string, number[]>
    ) {
        super(message);
        this.name = "YieldCompletionError";
    }
}

function numericRelationId(value: unknown): number {
    if (value && typeof value === "object") {
        const relation = value as Record<string, unknown>;
        return Number(
            relation.product_id
            ?? relation.job_order_id
            ?? relation.branch_id
            ?? relation.version_id
            ?? relation.lot_id
            ?? relation.sales_order_detail_id
            ?? relation.order_id
            ?? relation.id
            ?? 0
        );
    }
    return Number(value ?? 0);
}

function finiteNumber(value: unknown, label: string, options: { positive?: boolean; nonNegative?: boolean } = {}): number {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
        throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", `${label} must be a finite number.`);
    }
    if (options.positive && numberValue <= 0) {
        throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", `${label} must be greater than zero.`);
    }
    if (options.nonNegative && numberValue < 0) {
        throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", `${label} cannot be negative.`);
    }
    return numberValue;
}

function recordId(value: unknown): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return Number(
            record.id
            ?? record.movement_id
            ?? record.ledger_id
            ?? record.genealogy_id
            ?? record.lot_id
            ?? record.history_id
            ?? record.jo_material_id
            ?? record.detail_id
            ?? record.order_id
            ?? record.job_order_id
            ?? 0
        );
    }
    return Number(value ?? 0);
}

function formatQuantity(value: number): string {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

async function directusJson<T = any>(url: string, label: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, {
            headers: {
                ...headers,
                ...(init.headers || {})
            },
            cache: "no-store",
            ...init
        });
    } catch {
        throw new YieldCompletionError(502, "DIRECTUS_REQUEST_FAILED", `${label} could not be reached.`);
    }

    const responseText = await response.text();
    let payload: any = null;
    try {
        payload = responseText ? JSON.parse(responseText) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        throw new YieldCompletionError(502, "DIRECTUS_WRITE_FAILED", `${label} failed with HTTP ${response.status}.`);
    }
    if (!payload || payload.data === undefined || payload.data === null) {
        throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", `${label} returned no data.`);
    }
    return payload.data as T;
}

async function directusRows<T = any>(url: string, label: string): Promise<T[]> {
    const data = await directusJson<unknown>(url, label);
    if (!Array.isArray(data)) {
        throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", `${label} returned an invalid collection.`);
    }
    return data as T[];
}

async function directusDelete(url: string, label: string): Promise<void> {
    let response: Response;
    try {
        response = await fetch(url, {
            method: "DELETE",
            headers,
            cache: "no-store"
        });
    } catch {
        throw new YieldCompletionError(502, "ROLLBACK_FAILED", `${label} could not be reached.`);
    }

    if (!response.ok) {
        throw new YieldCompletionError(502, "ROLLBACK_FAILED", `${label} failed with HTTP ${response.status}.`);
    }
}

class MutationJournal {
    private readonly created: CreatedMutation[] = [];
    private readonly updated: UpdatedMutation[] = [];

    get reconciliationIds(): Record<string, number[]> {
        const ids: Record<string, number[]> = {};
        for (const mutation of this.created) {
            ids[mutation.collection] = [...(ids[mutation.collection] || []), mutation.id];
        }
        for (const mutation of this.updated) {
            ids[mutation.collection] = [...(ids[mutation.collection] || []), mutation.id];
        }
        return ids;
    }

    async create<T = any>(collection: string, payload: Record<string, unknown>, label: string): Promise<T> {
        const data = await directusJson<T>(
            `${DIRECTUS_URL}/items/${collection}`,
            label,
            {
                method: "POST",
                body: JSON.stringify(payload)
            }
        );
        const id = recordId(data);
        if (!Number.isFinite(id) || id <= 0) {
            throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", `${label} returned no valid record identifier.`);
        }
        this.created.push({ collection, id });
        return data;
    }

    async patch(collection: string, id: number, payload: Record<string, unknown>, label: string): Promise<Record<string, unknown>> {
        const previous = await directusJson<Record<string, unknown>>(
            `${DIRECTUS_URL}/items/${collection}/${encodeURIComponent(String(id))}`,
            `${label} pre-update lookup`
        );
        const data = await directusJson<Record<string, unknown>>(
            `${DIRECTUS_URL}/items/${collection}/${encodeURIComponent(String(id))}`,
            label,
            {
                method: "PATCH",
                body: JSON.stringify(payload)
            }
        );
        if (!data || typeof data !== "object") {
            throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", `${label} returned an invalid record.`);
        }
        if (recordId(data) !== id) {
            throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", `${label} returned an unexpected record identifier.`);
        }
        const previousFields = Object.fromEntries(
            Object.keys(payload).map(field => [field, previous[field]])
        );
        this.updated.push({ collection, id, previous: previousFields });
        return data;
    }

    async rollback(): Promise<void> {
        const rollbackErrors: string[] = [];

        for (const mutation of [...this.updated].reverse()) {
            try {
                await directusJson(
                    `${DIRECTUS_URL}/items/${mutation.collection}/${encodeURIComponent(String(mutation.id))}`,
                    `Restore ${mutation.collection} ${mutation.id}`,
                    {
                        method: "PATCH",
                        body: JSON.stringify(mutation.previous)
                    }
                );
            } catch (error) {
                rollbackErrors.push(error instanceof Error ? error.message : `Failed to restore ${mutation.collection} ${mutation.id}`);
            }
        }

        for (const mutation of [...this.created].reverse()) {
            try {
                await directusDelete(
                    `${DIRECTUS_URL}/items/${mutation.collection}/${encodeURIComponent(String(mutation.id))}`,
                    `Delete ${mutation.collection} ${mutation.id}`
                );
            } catch (error) {
                rollbackErrors.push(error instanceof Error ? error.message : `Failed to delete ${mutation.collection} ${mutation.id}`);
            }
        }

        if (rollbackErrors.length > 0) {
            throw new YieldCompletionError(
                502,
                "PARTIAL_WRITE_RECONCILIATION_REQUIRED",
                "Yield closing failed and automatic rollback was incomplete. Reconciliation is required.",
                this.reconciliationIds
            );
        }
    }
}

async function resolveMasterLotId(name: string, inventoryTypeId: number, journal: MutationJournal): Promise<number> {
    const filter = encodeURIComponent(JSON.stringify({ lot_name: { _eq: name } }));
    const rows = await directusRows<any>(
        `${DIRECTUS_URL}/items/lots?filter=${filter}&limit=1`,
        `Master lot lookup for ${name}`
    );
    const existingId = recordId(rows[0]);
    if (Number.isFinite(existingId) && existingId > 0) return existingId;

    const mappedTypeId = inventoryTypeId === 1 ? 390 : 389;
    const created = await journal.create<any>(
        "lots",
        {
            lot_name: name,
            inventory_type_id: mappedTypeId,
            max_batch_capacity: 100000,
            created_by: 24
        },
        `Create master lot ${name}`
    );
    const createdId = recordId(created);
    if (!Number.isFinite(createdId) || createdId <= 0) {
        throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", `Master lot ${name} returned no valid identifier.`);
    }
    return createdId;
}

function stockLotKey(lotId: number, lotNumber: string): string {
    return `${lotId}:${lotNumber}`;
}

async function loadStockLots(productId: number, branchId: number): Promise<StockLot[]> {
    const movements = await fetchMmInventoryMovements({
        product: productId,
        branch: branchId
    });
    const receipts = await directusRows<any>(
        `${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_eq]=${encodeURIComponent(String(productId))}&filter[branch_id][_eq]=${encodeURIComponent(String(branchId))}&limit=-1`,
        `Receiving lookup for component ${productId}`
    );

    const batchStatus = new Map<string, string>();
    const batchExpiry = new Map<string, string | null>();
    const batchCreated = new Map<string, string | null>();
    receipts.forEach(receipt => {
        const batchNumber = String(receipt.batch_no || receipt.lot_no || "LOT-N/A").trim() || "LOT-N/A";
        batchStatus.set(batchNumber, String(receipt.qa_status || "Passed"));
        batchExpiry.set(batchNumber, receipt.expiry_date || null);
        batchCreated.set(batchNumber, receipt.received_date || receipt.created_on || null);
    });

    const stock = new Map<string, StockLot>();
    movements.forEach(movement => {
        const batchNumber = String(movement.batch_no || "LOT-N/A").trim() || "LOT-N/A";
        const lotId = numericRelationId(movement.lot_id);
        const key = stockLotKey(lotId, batchNumber);
        const existing = stock.get(key);
        const quantity = finiteNumber(movement.quantity ?? 0, "Inventory movement quantity", { nonNegative: false });
        if (existing) {
            existing.availableQuantity += quantity;
        } else {
            stock.set(key, {
                lotId: Number.isFinite(lotId) && lotId > 0 ? lotId : 0,
                lotNumber: batchNumber,
                expiryDate: batchExpiry.get(batchNumber) || movement.expiry_date || null,
                createdOn: batchCreated.get(batchNumber) || movement.manufacturing_date || null,
                quantity: 0,
                availableQuantity: quantity
            });
        }
    });

    return [...stock.values()]
        .filter(lot => lot.availableQuantity > EPSILON)
        .filter(lot => {
            const status = batchStatus.get(lot.lotNumber) || "Passed";
            return status === "Passed" || status === "Partially Accepted";
        })
        .sort((left, right) => {
            if (left.expiryDate && right.expiryDate) {
                return new Date(left.expiryDate).getTime() - new Date(right.expiryDate).getTime();
            }
            if (left.expiryDate) return -1;
            if (right.expiryDate) return 1;
            return new Date(left.createdOn || 0).getTime() - new Date(right.createdOn || 0).getTime();
        });
}

async function buildComponentPlans(
    materials: YieldMaterial[],
    jobOrder: ResolvedYieldJobOrder,
    quantityProduced: number,
    branchId: number
): Promise<ComponentPlan[]> {
    const plans = materials
        .map(material => ({
            material,
            quantity: calculateIncrementalMaterialConsumption(material, quantityProduced, jobOrder.targetQuantity),
            lots: [] as LotAllocation[]
        }))
        .filter(plan => plan.quantity > EPSILON);

    const byProduct = new Map<number, ComponentPlan[]>();
    plans.forEach(plan => {
        const existing = byProduct.get(plan.material.productId) || [];
        existing.push(plan);
        byProduct.set(plan.material.productId, existing);
    });

    for (const [productId, productPlans] of byProduct) {
        const stockLots = await loadStockLots(productId, branchId);
        const totalRequired = productPlans.reduce((sum, plan) => sum + plan.quantity, 0);
        const totalAvailable = stockLots.reduce((sum, lot) => sum + lot.availableQuantity, 0);

        if (totalAvailable + EPSILON < totalRequired) {
            const productName = productPlans[0]?.material.productName || `Product #${productId}`;
            throw new YieldCompletionError(
                422,
                "INSUFFICIENT_COMPONENT_STOCK",
                `Insufficient stock for ${productName}. Needed ${formatQuantity(totalRequired)} units, available ${formatQuantity(totalAvailable)} units.`
            );
        }

        let lotIndex = 0;
        for (const plan of productPlans) {
            let remaining = plan.quantity;
            while (remaining > EPSILON) {
                const lot = stockLots[lotIndex];
                if (!lot) {
                    throw new YieldCompletionError(422, "INSUFFICIENT_COMPONENT_STOCK", `Unable to allocate stock for ${plan.material.productName}.`);
                }
                const portion = Math.min(remaining, lot.availableQuantity);
                if (portion <= EPSILON) {
                    lotIndex++;
                    continue;
                }
                plan.lots.push({
                    lotId: lot.lotId,
                    lotNumber: lot.lotNumber,
                    expiryDate: lot.expiryDate,
                    createdOn: lot.createdOn,
                    quantity: portion
                });
                lot.availableQuantity -= portion;
                remaining -= portion;
                if (lot.availableQuantity <= EPSILON) lotIndex++;
            }
        }
    }

    return plans;
}

function normalizeDate(value: unknown, label: string): string {
    const raw = String(value ?? "").trim();
    const datePart = raw.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/)?.[1] || "";
    if (!datePart) {
        throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", `${label} must be a valid date.`);
    }

    const [year, month, day] = datePart.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", `${label} must be a valid date.`);
    }

    return datePart;
}

function sameDate(left: unknown, right: string): boolean {
    return String(left ?? "").trim().slice(0, 10) === right;
}

function isTerminalJobOrderStatus(status: unknown): boolean {
    return ["completed", "finished", "closed"].includes(String(status ?? "").trim().toLowerCase());
}

function isCancelledStatus(status: unknown): boolean {
    return String(status ?? "").trim().toLowerCase() === "cancelled";
}

async function findExistingFinishedMovements(
    productId: number,
    branchId: number,
    jobOrderId: number,
    joNo: string,
    lotNumber: string
): Promise<any[]> {
    // New records are linked by the numeric job-order ID. Only fall back to
    // the document number for legacy movements that have no source ID.
    const bySourceId = await fetchMmInventoryMovements({
        product: productId,
        branch: branchId,
        batchNo: lotNumber,
        transactionTypeId: 2,
        movementDirection: "IN",
        referenceId: jobOrderId
    });
    if (bySourceId.length > 0) return bySourceId;

    const legacyRows = await fetchMmInventoryMovements({
        product: productId,
        branch: branchId,
        batchNo: lotNumber,
        transactionTypeId: 2,
        movementDirection: "IN",
        referenceNo: joNo
    });
    return legacyRows.filter(row => numericRelationId(row.source_document_id) <= 0);
}

function matchingFinishedMovement(
    rows: any[],
    productId: number,
    branchId: number,
    jobOrderId: number,
    joNo: string,
    lotNumber: string,
    quantity: number,
    manufacturingDate: string,
    expirationDate: string
): any | null {
    return rows.find(row =>
        Number(row.product_id) === productId
        && Number(row.branch_id) === branchId
        && Number(row.transaction_type_id) === 2
        && Number(row.quantity) === quantity
        && String(row.batch_no || "").trim() === lotNumber
        && (
            numericRelationId(row.source_document_id) === jobOrderId
            || (numericRelationId(row.source_document_id) <= 0 && String(row.source_document_no || "").trim() === joNo)
        )
        && sameDate(row.manufacturing_date, manufacturingDate)
        && sameDate(row.expiry_date, expirationDate)
    ) || null;
}

async function resolveYieldLedger(
    jobOrder: ResolvedYieldJobOrder,
    lotNumber: string,
    requestedLedgerId?: string | number | null
): Promise<{ id: number; row: any }> {
    const normalizedLedgerId = Number(requestedLedgerId ?? 0);
    let rows: any[];

    if (Number.isFinite(normalizedLedgerId) && normalizedLedgerId > 0) {
        const row = await directusJson<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(normalizedLedgerId))}`,
            `Yield ledger lookup for ${jobOrder.jobOrderNo}`
        );
        rows = [row];
    } else {
        rows = await directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter=${encodeURIComponent(JSON.stringify({
                _and: [
                    { job_order_id: { _eq: jobOrder.jobOrderId } },
                    { lot_number: { _eq: lotNumber } }
                ]
            }))}&limit=-1`,
            `Yield ledger resolution for ${jobOrder.jobOrderNo}`
        );
    }

    const matchingRows = rows.filter(row =>
        numericRelationId(row.job_order_id) === jobOrder.jobOrderId
        && String(row.lot_number || "").trim() === lotNumber
    );
    if (matchingRows.length === 0) {
        throw new YieldCompletionError(
            404,
            "YIELD_LEDGER_NOT_FOUND",
            `No yield ledger run exists for ${jobOrder.jobOrderNo} and lot ${lotNumber}.`
        );
    }
    if (matchingRows.length > 1) {
        throw new YieldCompletionError(
            409,
            "YIELD_LEDGER_AMBIGUOUS",
            `More than one yield ledger run exists for ${jobOrder.jobOrderNo} and lot ${lotNumber}. Select the specific run before closing.`
        );
    }

    const id = recordId(matchingRows[0]);
    if (!Number.isFinite(id) || id <= 0) {
        throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", "The yield ledger run has no valid identifier.");
    }
    return { id, row: matchingRows[0] };
}

async function hasFinishedGoodsLedger(
    productId: number,
    branchId: number,
    joNo: string,
    quantity: number,
    expectedLedgerId?: number
): Promise<boolean> {
    const filter = encodeURIComponent(JSON.stringify({
        _and: [
            { productId: { _eq: productId } },
            { branchId: { _eq: branchId } },
            { documentNo: { _eq: joNo } },
            { documentType: { _eq: "Job Order Receipt" } },
            { quantity: { _eq: quantity } }
        ]
    }));
    const rows = await directusRows<any>(
        `${DIRECTUS_URL}/items/product_ledger?filter=${filter}&limit=-1`,
        `Existing finished-goods ledger lookup for ${joNo}`
    );
    return rows.some(row => expectedLedgerId === undefined || recordId(row) === expectedLedgerId);
}

async function findCompletionHistory(jobOrderId: number): Promise<any | null> {
    const filter = encodeURIComponent(JSON.stringify({
        job_order_id: { _eq: jobOrderId }
    }));
    const rows = await directusRows<any>(
        `${DIRECTUS_URL}/items/manufacturing_job_order_status_history?filter=${filter}&limit=-1&sort=-changed_at`,
        `Completion history lookup for Job Order ${jobOrderId}`
    );
    return rows.find(row => isTerminalJobOrderStatus(row.new_status)) || null;
}

async function processSalesOrderAllocations(
    journal: MutationJournal,
    jobOrder: ResolvedYieldJobOrder,
    quantityProduced: number
): Promise<SalesAllocationExpectation[]> {
    const allocationLabel = `Job-order allocation lookup for ${jobOrder.jobOrderNo}`;
    let rawLinks: any[];
    try {
        rawLinks = await directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[job_order_id][_eq]=${encodeURIComponent(String(jobOrder.jobOrderId))}&fields=sales_order_detail_id,allocated_quantity,status&limit=-1`,
            allocationLabel
        );
    } catch (error) {
        // Older Dummy schemas do not expose allocation status. Preserve the
        // cancellation-aware path where available and fall back only for a
        // Directus field/permission response.
        if (!(error instanceof YieldCompletionError) || !/HTTP (400|403)/.test(error.message)) throw error;
        rawLinks = await directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[job_order_id][_eq]=${encodeURIComponent(String(jobOrder.jobOrderId))}&fields=sales_order_detail_id,allocated_quantity&limit=-1`,
            allocationLabel
        );
    }
    const linksByDetail = new Map<number, number>();
    for (const link of rawLinks) {
        if (isCancelledStatus(link.status)) continue;
        const detailId = numericRelationId(link.sales_order_detail_id);
        if (!Number.isFinite(detailId) || detailId <= 0) continue;
        const linkedQuantity = finiteNumber(link.allocated_quantity ?? 0, "Sales-order allocation quantity", { nonNegative: true });
        linksByDetail.set(detailId, (linksByDetail.get(detailId) || 0) + linkedQuantity);
    }

    const expectations: SalesAllocationExpectation[] = [];
    const parentOrderIds = new Set<number>();

    for (const [detailId, linkedQuantity] of linksByDetail) {
        const detail = await directusJson<any>(
            `${DIRECTUS_URL}/items/sales_order_details/${encodeURIComponent(String(detailId))}`,
            `Sales-order detail lookup for allocation ${detailId}`
        );
        const targetQuantity = jobOrder.targetQuantity;
        const proportionalQuantity = quantityProduced < targetQuantity
            ? (linkedQuantity * quantityProduced) / targetQuantity
            : linkedQuantity;
        const currentAllocated = finiteNumber(detail.allocated_quantity ?? 0, "Current sales-order allocated quantity", { nonNegative: true });
        const orderedQuantity = finiteNumber(detail.ordered_quantity ?? 0, "Sales-order ordered quantity", { positive: true });
        const unitPrice = finiteNumber(detail.unit_price ?? 0, "Sales-order unit price", { nonNegative: true });
        const allocatedQuantity = Math.min(orderedQuantity, currentAllocated + proportionalQuantity);
        const allocatedAmount = allocatedQuantity * unitPrice;

        await journal.patch(
            "sales_order_details",
            detailId,
            {
                allocated_quantity: allocatedQuantity,
                allocated_amount: allocatedAmount
            },
            `Update sales-order detail allocation ${detailId}`
        );

        const parentOrderId = numericRelationId(detail.order_id);
        if (!Number.isFinite(parentOrderId) || parentOrderId <= 0) {
            expectations.push({ detailId, allocatedQuantity, allocatedAmount, parentOrderId: null });
            continue;
        }
        expectations.push({
            detailId,
            allocatedQuantity,
            allocatedAmount,
            parentOrderId
        });
        parentOrderIds.add(parentOrderId);
    }

    // Reconcile each parent once, after all of its linked detail lines have
    // been updated. This prevents a multi-line or multi-JO order from being
    // promoted based on an incomplete intermediate read.
    const expectedStatusByParent = new Map<number, string>();
    for (const parentOrderId of parentOrderIds) {
        const parentOrder = await directusJson<any>(
            `${DIRECTUS_URL}/items/sales_order/${encodeURIComponent(String(parentOrderId))}?fields=order_id,order_status`,
            `Sales-order status lookup for ${parentOrderId}`
        );
        const currentStatus = String(parentOrder.order_status || "").trim();
        const allDetails = await directusRows<any>(
            `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${encodeURIComponent(String(parentOrderId))}&fields=detail_id,ordered_quantity,allocated_quantity,served_quantity&limit=-1`,
            `Sales-order detail allocation verification for ${parentOrderId}`
        );
        const allFullyFulfilled = allDetails.length > 0 && allDetails.every(orderDetail => {
            const ordered = finiteNumber(orderDetail.ordered_quantity ?? 0, "Sales-order ordered quantity", { positive: true });
            const allocated = finiteNumber(orderDetail.allocated_quantity ?? 0, "Sales-order allocated quantity", { nonNegative: true });
            const served = finiteNumber(orderDetail.served_quantity ?? 0, "Sales-order served quantity", { nonNegative: true });
            return Math.max(allocated, served) >= ordered;
        });

        if (currentStatus === "In Production" && allFullyFulfilled) {
            await journal.patch(
                "sales_order",
                parentOrderId,
                { order_status: "For Invoicing" },
                `Update sales-order status ${parentOrderId}`
            );
            expectedStatusByParent.set(parentOrderId, "For Invoicing");
        } else if (currentStatus === "In Production") {
            expectedStatusByParent.set(parentOrderId, "In Production");
        }
    }

    for (const expectation of expectations) {
        if (expectation.parentOrderId) {
            const expectedStatus = expectedStatusByParent.get(expectation.parentOrderId);
            if (expectedStatus) expectation.parentStatus = expectedStatus;
        }
    }

    return expectations;
}

interface SalesAllocationExpectation {
    detailId: number;
    allocatedQuantity: number;
    allocatedAmount: number;
    parentOrderId: number | null;
    parentStatus?: string;
}

async function verifySalesOrderAllocations(expectations: SalesAllocationExpectation[]): Promise<void> {
    for (const expectation of expectations) {
        const detail = await directusJson<any>(
            `${DIRECTUS_URL}/items/sales_order_details/${encodeURIComponent(String(expectation.detailId))}`,
            `Sales-order detail verification for ${expectation.detailId}`
        );
        if (
            Math.abs(Number(detail.allocated_quantity || 0) - expectation.allocatedQuantity) > EPSILON
            || Math.abs(Number(detail.allocated_amount || 0) - expectation.allocatedAmount) > EPSILON
        ) {
            throw new YieldCompletionError(
                502,
                "PERSISTENCE_VERIFICATION_FAILED",
                `Sales-order detail ${expectation.detailId} did not retain the completed allocation.`
            );
        }

        if (expectation.parentOrderId && expectation.parentStatus) {
            const parent = await directusJson<any>(
                `${DIRECTUS_URL}/items/sales_order/${encodeURIComponent(String(expectation.parentOrderId))}`,
                `Sales-order verification for ${expectation.parentOrderId}`
            );
            if (String(parent.order_status || "") !== expectation.parentStatus) {
                throw new YieldCompletionError(
                    502,
                    "PERSISTENCE_VERIFICATION_FAILED",
                    `Sales order ${expectation.parentOrderId} did not retain its completed allocation status.`
                );
            }
        }
    }
}

async function verifyPersistedCompletion(options: {
    jobOrder: ResolvedYieldJobOrder;
    yieldLedgerId: number;
    finishedMovementId: number;
    finishedLedgerId: number;
    statusHistoryId: number;
    quantityProduced: number;
    branchId: number;
    lotNumber: string;
    manufacturingDate: string;
    expirationDate: string;
    materials: YieldMaterial[];
    componentPlans: ComponentPlan[];
}): Promise<{ movement: any; yieldLedger: any; jobOrder: any }> {
    const {
        jobOrder,
        yieldLedgerId,
        finishedMovementId,
        finishedLedgerId,
        statusHistoryId,
        quantityProduced,
        branchId,
        lotNumber,
        manufacturingDate,
        expirationDate,
        materials,
        componentPlans
    } = options;

    const movementRows = await findExistingFinishedMovements(
        jobOrder.productId,
        branchId,
        jobOrder.jobOrderId,
        jobOrder.jobOrderNo,
        lotNumber
    );
    const movement = movementRows.find(row => recordId(row) === finishedMovementId) || null;
    if (!movement || !matchingFinishedMovement(
        [movement],
        jobOrder.productId,
        branchId,
        jobOrder.jobOrderId,
        jobOrder.jobOrderNo,
        lotNumber,
        quantityProduced,
        manufacturingDate,
        expirationDate
    )) {
        throw new YieldCompletionError(
            502,
            "PERSISTENCE_VERIFICATION_FAILED",
            `Finished-goods movement for ${jobOrder.jobOrderNo} did not retain the submitted lot, dates, or quantity.`
        );
    }

    const yieldLedger = await directusJson<any>(
        `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(yieldLedgerId))}`,
        `Yield ledger verification for ${jobOrder.jobOrderNo}`
    );
    if (
        recordId(yieldLedger) !== yieldLedgerId
        || numericRelationId(yieldLedger.job_order_id) !== jobOrder.jobOrderId
        || String(yieldLedger.lot_number || "").trim() !== lotNumber
    ) {
        throw new YieldCompletionError(
            502,
            "PERSISTENCE_VERIFICATION_FAILED",
            `Yield ledger ${yieldLedgerId} did not retain the submitted run metadata.`
        );
    }

    const persistedJobOrder = await directusJson<any>(
        `${DIRECTUS_URL}/items/manufacturing_job_orders/${encodeURIComponent(String(jobOrder.jobOrderId))}`,
        `Job-order completion verification for ${jobOrder.jobOrderNo}`
    );
    if (
        !isTerminalJobOrderStatus(persistedJobOrder.status)
        || Math.abs(Number(persistedJobOrder.actual_quantity_produced || 0) - quantityProduced) > EPSILON
    ) {
        throw new YieldCompletionError(
            502,
            "PERSISTENCE_VERIFICATION_FAILED",
            `Job Order ${jobOrder.jobOrderNo} did not retain Completed status and produced quantity.`
        );
    }

    const finishedLedgerExists = await hasFinishedGoodsLedger(
        jobOrder.productId,
        branchId,
        jobOrder.jobOrderNo,
        quantityProduced,
        finishedLedgerId
    );
    if (!finishedLedgerExists || finishedLedgerId <= 0) {
        throw new YieldCompletionError(
            502,
            "PERSISTENCE_VERIFICATION_FAILED",
            `Finished-goods product ledger for ${jobOrder.jobOrderNo} could not be verified.`
        );
    }

    const statusHistory = await findCompletionHistory(jobOrder.jobOrderId);
    if (!statusHistory || recordId(statusHistory) !== statusHistoryId) {
        throw new YieldCompletionError(
            502,
            "PERSISTENCE_VERIFICATION_FAILED",
            `Completion history for ${jobOrder.jobOrderNo} could not be verified.`
        );
    }

    for (const plan of componentPlans) {
        const expectedQuantity = -plan.quantity;
        const componentLedgerRows = await directusRows<any>(
            `${DIRECTUS_URL}/items/product_ledger?filter=${encodeURIComponent(JSON.stringify({
                _and: [
                    { branchId: { _eq: branchId } },
                    { productId: { _eq: plan.material.productId } },
                    { documentNo: { _eq: jobOrder.jobOrderNo } },
                    { documentType: { _eq: "Job Order Issue" } }
                ]
            }))}&limit=-1`,
            `Component product-ledger verification for ${plan.material.productName}`
        );
        if (!componentLedgerRows.some(row => Math.abs(Number(row.quantity || 0) - expectedQuantity) <= EPSILON)) {
            throw new YieldCompletionError(
                502,
                "PERSISTENCE_VERIFICATION_FAILED",
                `Component product ledger for ${plan.material.productName} could not be verified.`
            );
        }

        for (const lot of plan.lots) {
            const componentMovements = await fetchMmInventoryMovements({
                referenceId: jobOrder.jobOrderId,
                branch: branchId,
                product: plan.material.productId,
                batchNo: lot.lotNumber,
                transactionTypeId: 1,
                movementDirection: "OUT"
            });
            if (!componentMovements.some(movement =>
                Math.abs(Number(movement.quantity) + lot.quantity) <= EPSILON
            )) {
                throw new YieldCompletionError(
                    502,
                    "PERSISTENCE_VERIFICATION_FAILED",
                    `Component movement for ${lot.lotNumber} could not be verified.`
                );
            }

            const genealogyRows = await directusRows<any>(
                `${DIRECTUS_URL}/items/jo_material_genealogy?filter=${encodeURIComponent(JSON.stringify({
                    _and: [
                        { job_order_id: { _eq: jobOrder.jobOrderId } },
                        { batch_no: { _eq: lotNumber } },
                        { component_product_id: { _eq: plan.material.productId } },
                        { component_batch_no: { _eq: lot.lotNumber } },
                        { consumed_quantity: { _eq: lot.quantity } }
                    ]
                }))}&limit=-1`,
                `Material genealogy verification for ${lot.lotNumber}`
            );
            if (genealogyRows.length === 0) {
                throw new YieldCompletionError(
                    502,
                    "PERSISTENCE_VERIFICATION_FAILED",
                    `Material genealogy for ${lot.lotNumber} could not be verified.`
                );
            }
        }
    }

    for (const material of materials) {
        const expectedPlan = componentPlans.find(plan => plan.material.materialId === material.materialId);
        const expectedIncrement = expectedPlan?.quantity || 0;
        const persistedMaterial = await directusJson<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_materials/${encodeURIComponent(String(material.materialId))}`,
            `Material consumption verification for ${material.productName}`
        );
        const expectedConsumed = material.actualConsumedQuantity + expectedIncrement;
        const expectedReserved = Math.max(0, material.reservedQuantity - expectedIncrement);
        if (
            Math.abs(Number(persistedMaterial.actual_consumed_quantity || 0) - expectedConsumed) > EPSILON
            || Math.abs(Number(persistedMaterial.reserved_quantity || 0) - expectedReserved) > EPSILON
        ) {
            throw new YieldCompletionError(
                502,
                "PERSISTENCE_VERIFICATION_FAILED",
                `Material consumption for ${material.productName} could not be verified.`
            );
        }
    }

    return { movement, yieldLedger, jobOrder: persistedJobOrder };
}

function completionReceipt(
    jobOrder: ResolvedYieldJobOrder,
    input: CompleteYieldClosingInput,
    quantityProduced: number,
    branchId: number,
    lotNumber: string,
    manufacturingDate: string,
    expirationDate: string,
    movement: any,
    yieldLedgerId: number
) {
    const movementId = recordId(movement);
    return {
        id: movementId,
        movement_id: movementId,
        yield_ledger_id: yieldLedgerId,
        job_order_id: jobOrder.jobOrderId,
        job_order_status: "Completed",
        jo_id: jobOrder.jobOrderNo,
        product_id: jobOrder.productId,
        product_name: input.productName || "Manufactured Good",
        quantity_produced: quantityProduced,
        branch_id: branchId,
        lot_number: lotNumber,
        manufacturing_date: manufacturingDate,
        expiration_date: expirationDate,
        unit_cost: finiteNumber(input.unitCost ?? 0, "Unit cost", { nonNegative: true }),
        date_received: movement.created_at || movement.created_on || new Date().toISOString()
    };
}

async function completeYieldClosingInternal(
    input: CompleteYieldClosingInput,
    requestOperationKey: string
): Promise<Record<string, unknown>> {
    let operationKey = requestOperationKey;
    let journal: MutationJournal | null = null;

    try {
        const quantityProduced = finiteNumber(input.quantityProduced, "Produced quantity", { positive: true });
        const branchId = finiteNumber(input.branchId, "Branch ID", { positive: true });
        const requestedProductId = finiteNumber(input.productId, "Product ID", { positive: true });
        const requestedJoId = String(input.joId ?? "").trim();
        const lotNumber = String(input.lotNumber ?? "").trim();
        if (!requestedJoId) {
            throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", "Job order ID or number is required.");
        }
        if (!lotNumber) {
            throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", "A lot number is required for yield closing.");
        }

        const manufacturingDate = normalizeDate(input.manufacturingDate, "Manufacturing date");
        const expirationDate = normalizeDate(input.expirationDate, "Expiration date");
        if (manufacturingDate > expirationDate) {
            throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", "Expiration date cannot be earlier than manufacturing date.");
        }
        finiteNumber(input.unitCost ?? 0, "Unit cost", { nonNegative: true });

        const { jobOrder, materials } = await loadYieldMaterials(requestedJoId);
        if (requestedProductId !== jobOrder.productId) {
            throw new YieldCompletionError(422, "JOB_ORDER_PRODUCT_MISMATCH", "The selected product does not belong to this Job Order.");
        }
        if (jobOrder.branchId !== null && jobOrder.branchId !== branchId) {
            throw new YieldCompletionError(422, "JOB_ORDER_BRANCH_MISMATCH", "The selected branch does not belong to this Job Order.");
        }

        if (materials.length === 0) {
            await verifyZeroComponentBOM(jobOrder);
        } else if (!Array.isArray(input.componentsConsumed) || input.componentsConsumed.length === 0) {
            throw new YieldCompletionError(
                422,
                "MATERIAL_COMPONENTS_REQUIRED",
                "This Job Order has material requirements. Reload the material requirements before submitting yield closing."
            );
        }

        const yieldLedger = await resolveYieldLedger(jobOrder, lotNumber, input.yieldLedgerId);
        operationKey = `yield-close:${jobOrder.jobOrderId}:${yieldLedger.id}:${jobOrder.productId}:${branchId}:${lotNumber}:2`;

        const existingMovements = await findExistingFinishedMovements(
            jobOrder.productId,
            branchId,
            jobOrder.jobOrderId,
            jobOrder.jobOrderNo,
            lotNumber
        );
        if (existingMovements.length > 1) {
            throw new YieldCompletionError(
                409,
                "YIELD_DUPLICATE_MOVEMENTS",
                `More than one finished-goods movement exists for ${jobOrder.jobOrderNo} and lot ${lotNumber}. Reconciliation is required.`
            );
        }

        const existingMovement = existingMovements[0] || null;
        const expectedExistingMovement = existingMovement
            ? matchingFinishedMovement(
                [existingMovement],
                jobOrder.productId,
                branchId,
                jobOrder.jobOrderId,
                jobOrder.jobOrderNo,
                lotNumber,
                quantityProduced,
                manufacturingDate,
                expirationDate
            )
            : null;

        if (existingMovement) {
            const existingQuantity = finiteNumber(existingMovement.quantity, "Existing finished-goods quantity", { positive: true });
            const allMaterialConsumptionComplete = materials.every(material =>
                calculateIncrementalMaterialConsumption(material, quantityProduced, jobOrder.targetQuantity) <= EPSILON
            );
            const hasLedger = await hasFinishedGoodsLedger(jobOrder.productId, branchId, jobOrder.jobOrderNo, existingQuantity);
            const history = await findCompletionHistory(jobOrder.jobOrderId);
            // The yield ledger stores the run lot, while manufacturing and
            // expiry dates are authoritative on the finished-goods movement.
            const yieldMetadataMatches = String(yieldLedger.row.lot_number || "").trim() === lotNumber;

            if (
                expectedExistingMovement
                && Math.abs(existingQuantity - quantityProduced) <= EPSILON
                && hasLedger
                && allMaterialConsumptionComplete
                && isTerminalJobOrderStatus(jobOrder.status)
                && history
                && yieldMetadataMatches
            ) {
                return {
                    success: true,
                    idempotent: true,
                    data: completionReceipt(
                        jobOrder,
                        input,
                        existingQuantity,
                        branchId,
                        lotNumber,
                        manufacturingDate,
                        expirationDate,
                        existingMovement,
                        yieldLedger.id
                    ),
                    accounting: { finishedMovementId: recordId(existingMovement), yieldLedgerId: yieldLedger.id }
                };
            }

            throw new YieldCompletionError(
                409,
                "YIELD_ALREADY_POSTED_INCOMPLETE",
                `A finished-goods movement already exists for ${jobOrder.jobOrderNo} and lot ${lotNumber}, but its accounting trail or submitted metadata is incomplete. Reconciliation is required.`
            );
        }

        if (isTerminalJobOrderStatus(jobOrder.status)) {
            throw new YieldCompletionError(
                409,
                "JOB_ORDER_ALREADY_COMPLETED",
                `Job Order ${jobOrder.jobOrderNo} is already completed but has no matching finished-goods movement.`
            );
        }

        const componentPlans = await buildComponentPlans(materials, jobOrder, quantityProduced, branchId);
        const phtMovementTimestamp = formatPhtDateTime();
        journal = new MutationJournal();
        const finishedLotId = await resolveMasterLotId(lotNumber, 2, journal);
        const finishedMovement = await journal.create<any>(
            "inventory_movements",
            {
                product_id: jobOrder.productId,
                lot_id: finishedLotId,
                branch_id: branchId,
                transaction_type_id: 2,
                source_document_id: jobOrder.jobOrderId,
                source_document_no: jobOrder.jobOrderNo,
                batch_no: lotNumber,
                expiry_date: expirationDate,
                manufacturing_date: manufacturingDate,
                quantity: quantityProduced,
                created_by: 24,
                remarks: `Finished yield output from Job Order ${jobOrder.jobOrderNo}`
            },
            "Create finished-goods inventory movement"
        );
        const finishedMovementId = recordId(finishedMovement);

        const finishedLedger = await journal.create<any>(
            "product_ledger",
            {
                branchId,
                productId: jobOrder.productId,
                quantity: quantityProduced,
                documentType: "Job Order Receipt",
                documentNo: jobOrder.jobOrderNo,
                documentDescription: `MFG Run: ${lotNumber}`,
                documentDate: await getTodayDateString()
            },
            "Create finished-goods product ledger"
        );
        const finishedLedgerId = recordId(finishedLedger);

        const persistedComponentMovements: number[] = [];
        const persistedGenealogy: number[] = [];
        const persistedComponentLedgers: number[] = [];
        const persistedMaterialUpdates: number[] = [];

        for (const plan of componentPlans) {
            const componentLedger = await journal.create<any>(
                "product_ledger",
                {
                    branchId,
                    productId: plan.material.productId,
                    quantity: -plan.quantity,
                    documentType: "Job Order Issue",
                    documentNo: jobOrder.jobOrderNo,
                    documentDescription: `Consumed to produce: ${input.productName || "Finished Goods"}`,
                    documentDate: await getTodayDateString()
                },
                `Create component product ledger for ${plan.material.productName}`
            );
            persistedComponentLedgers.push(recordId(componentLedger));

            for (const lot of plan.lots) {
                const consumedLotId = lot.lotId > 0
                    ? lot.lotId
                    : await resolveMasterLotId(lot.lotNumber, 1, journal);
                const componentMovement = await journal.create<any>(
                    "inventory_movements",
                    {
                        product_id: plan.material.productId,
                        lot_id: consumedLotId,
                        branch_id: branchId,
                        transaction_type_id: 1,
                        source_document_id: jobOrder.jobOrderId,
                        source_document_no: jobOrder.jobOrderNo,
                        batch_no: lot.lotNumber,
                        expiry_date: lot.expiryDate,
                        manufacturing_date: lot.createdOn ? lot.createdOn.split("T")[0] : null,
                        quantity: -lot.quantity,
                        created_by: 24,
                        remarks: `Consumed from lot ${lot.lotNumber} for JO yield`
                    },
                    `Create component inventory movement for ${plan.material.productName}`
                );
                persistedComponentMovements.push(recordId(componentMovement));

                const genealogy = await journal.create<any>(
                    "jo_material_genealogy",
                    {
                        job_order_id: jobOrder.jobOrderId,
                        batch_no: lotNumber,
                        component_product_id: plan.material.productId,
                        component_lot_id: consumedLotId,
                        component_batch_no: lot.lotNumber,
                        consumed_quantity: lot.quantity,
                        created_at: phtMovementTimestamp
                    },
                    `Create material genealogy for ${plan.material.productName}`
                );
                persistedGenealogy.push(recordId(genealogy));
            }

            const newConsumed = plan.material.actualConsumedQuantity + plan.quantity;
            const newReserved = Math.max(0, plan.material.reservedQuantity - plan.quantity);
            await journal.patch(
                "manufacturing_job_order_materials",
                plan.material.materialId,
                {
                    actual_consumed_quantity: newConsumed,
                    reserved_quantity: newReserved
                },
                `Update material consumption for ${plan.material.productName}`
            );
            persistedMaterialUpdates.push(plan.material.materialId);
        }

        const updatedYieldLedger = await journal.patch(
            "manufacturing_job_order_yield_ledger",
            yieldLedger.id,
            {
                lot_number: lotNumber
            },
            `Update yield ledger ${yieldLedger.id}`
        );
        if (recordId(updatedYieldLedger) !== yieldLedger.id) {
            throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", "Yield ledger update returned an invalid record identifier.");
        }

        const oldStatus = jobOrder.status || "In Progress";
        await journal.patch(
            "manufacturing_job_orders",
            jobOrder.jobOrderId,
            {
                status: "Completed",
                actual_quantity_produced: quantityProduced,
                modified_at: new Date().toISOString()
            },
            `Complete Job Order ${jobOrder.jobOrderNo}`
        );

        const existingHistory = await findCompletionHistory(jobOrder.jobOrderId);
        const statusHistory = existingHistory || await journal.create<any>(
            "manufacturing_job_order_status_history",
            {
                job_order_id: jobOrder.jobOrderId,
                old_status: oldStatus,
                new_status: "Completed",
                changed_by: 24,
                changed_at: new Date().toISOString(),
                remarks: `Yield Closing completed: ${quantityProduced} units.`
            },
            `Create Job Order completion history for ${jobOrder.jobOrderNo}`
        );
        const statusHistoryId = recordId(statusHistory);
        if (!statusHistoryId) {
            throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", "Completion history returned no valid identifier.");
        }

        const verifiedCore = await verifyPersistedCompletion({
            jobOrder,
            yieldLedgerId: yieldLedger.id,
            finishedMovementId,
            finishedLedgerId,
            statusHistoryId,
            quantityProduced,
            branchId,
            lotNumber,
            manufacturingDate,
            expirationDate,
            materials,
            componentPlans
        });

        const allocationExpectations = await processSalesOrderAllocations(journal, jobOrder, quantityProduced);
        await verifySalesOrderAllocations(allocationExpectations);

        return {
            success: true,
            data: completionReceipt(
                jobOrder,
                input,
                quantityProduced,
                branchId,
                lotNumber,
                manufacturingDate,
                expirationDate,
                verifiedCore.movement,
                yieldLedger.id
            ),
            accounting: {
                finishedMovementId,
                finishedLedgerId,
                yieldLedgerId: yieldLedger.id,
                componentLedgerIds: persistedComponentLedgers,
                componentMovementIds: persistedComponentMovements,
                genealogyIds: persistedGenealogy,
                materialIds: persistedMaterialUpdates,
                statusHistoryId
            }
        };
    } catch (error) {
        if (journal) {
            try {
                await journal.rollback();
            } catch (rollbackError) {
                if (rollbackError instanceof YieldCompletionError) {
                    rollbackError.operationKey = operationKey;
                    rollbackError.reconciliationRequired = true;
                    throw rollbackError;
                }
                const reconciliationError = new YieldCompletionError(
                    502,
                    "PARTIAL_WRITE_RECONCILIATION_REQUIRED",
                    "Yield closing failed and automatic rollback was incomplete. Reconciliation is required.",
                    journal.reconciliationIds
                );
                reconciliationError.operationKey = operationKey;
                reconciliationError.reconciliationRequired = true;
                throw reconciliationError;
            }
        }

        if (error instanceof YieldCompletionError) {
            error.operationKey = operationKey;
            throw error;
        }
        if (error instanceof YieldMaterialsError) {
            const materialsError = new YieldCompletionError(error.status, error.code, error.message);
            materialsError.operationKey = operationKey;
            throw materialsError;
        }
        if (error instanceof MmInventoryMovementError) {
            const movementError = new YieldCompletionError(
                error.status,
                "INVENTORY_MOVEMENT_LOOKUP_FAILED",
                error.message
            );
            movementError.operationKey = operationKey;
            throw movementError;
        }
        const closingError = new YieldCompletionError(502, "YIELD_CLOSING_FAILED", "Yield closing could not be completed.");
        closingError.operationKey = operationKey;
        throw closingError;
    }
}

export async function completeYieldClosing(input: CompleteYieldClosingInput): Promise<Record<string, unknown>> {
    const requestKey = [
        String(input.joId ?? "").trim(),
        String(input.productId ?? "").trim(),
        String(input.branchId ?? "").trim(),
        String(input.lotNumber ?? "").trim()
    ].join(":");
    const inFlight = inFlightYieldClosures.get(requestKey);
    if (inFlight) return inFlight;

    const operation = completeYieldClosingInternal(input, `yield-close-request:${requestKey}`);
    inFlightYieldClosures.set(requestKey, operation);
    try {
        return await operation;
    } finally {
        if (inFlightYieldClosures.get(requestKey) === operation) {
            inFlightYieldClosures.delete(requestKey);
        }
    }
}
