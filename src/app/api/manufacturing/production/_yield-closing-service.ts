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
import {
    loadEligibleFinishedGoodsLot,
    loadMmInventoryLots,
    mmInventoryLotId,
    resolveOrCreateMmInventoryLot,
    MmLotError
} from "@/app/api/manufacturing/services/mm-lots.service";
import {
    isCancelledJobOrderStatus,
    isJobOrderStatus,
    isTerminalJobOrderStatus,
    JOB_ORDER_STATUS,
    normalizeJobOrderStatus
} from "@/modules/manufacturing-management/job-order-status";
import { isProductionSchedulingStatus } from "../sales-order/_status";
import { salesOrderStatusAfterFulfillment } from "../sales-order/_fulfillment";
import { hasJobOrderReceipt } from "./_finished-goods-ledger";
import {
    applyMaterialReturnDestinations,
    computeJobOrderMaterialReturns,
    executeJobOrderMaterialReturns,
    fetchJobOrder,
    JobOrderCancellationError,
    JobOrderCancellationExecution,
    resolveJobOrderProductName,
    returnJobOrderMaterialLeftovers
} from "./_material-return";

const EPSILON = 0.000001;
const inFlightYieldClosures = new Map<string, Promise<Record<string, unknown>>>();

function roundTo4(value: number): number {
    return Math.round(value * 10000) / 10000;
}

function parseMaterialReturnConfirmation(
    value: unknown
): { destinations?: Array<{ joMaterialId: number; mmLotId: number; inventoryLotId?: number; batchNo?: string }> } | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const hasToken = typeof record.previewToken === "string" && record.previewToken.trim().length > 0;
    if (record.acknowledge !== true && !hasToken) return null;
    const destinations = Array.isArray(record.destinations)
        ? record.destinations as Array<{ joMaterialId: number; mmLotId: number; inventoryLotId?: number; batchNo?: string }>
        : undefined;
    return { destinations };
}

export interface CompleteYieldClosingInput {
    joId: string | number;
    yieldLedgerId?: string | number | null;
    mmLotId?: string | number | null;
    productId: string | number;
    productName?: string;
    quantityProduced: string | number;
    branchId: string | number;
    lotNumber?: string | null;
    expirationDate?: string | null;
    manufacturingDate?: string | null;
    unitCost?: string | number | null;
    componentsConsumed?: unknown;
    materialReturnConfirmation?: unknown;
}

interface ComponentPlan {
    material: YieldMaterial;
    quantity: number;
    lots: LotAllocation[];
}

interface LotAllocation {
    lotId: number;
    inventoryLotId: number;
    reservationId: number;
    lotNumber: string;
    expiryDate: string | null;
    createdOn: string | null;
    quantity: number;
    expectedActualUsedQuantity?: number;
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
            ?? relation.mm_lot_id
            ?? relation.inventory_lot_id
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
            ?? record.jo_materials_reservation_id
            ?? record.lot_id
            ?? record.inventory_lot_id
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

function movementLotId(row: Record<string, unknown>): number {
    const value = row?.mm_lot_id;
    if (value && typeof value === "object") {
        const relation = value as Record<string, unknown>;
        return Number(relation.lot_id ?? relation.id ?? 0);
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
        // The PATCH has already been applied; register it for rollback before
        // validating the response so a malformed/sparse response can never
        // leave an unjournaled partial write behind.
        const previousFields = Object.fromEntries(
            Object.keys(payload).map(field => [field, previous[field]])
        );
        this.updated.push({ collection, id, previous: previousFields });
        if (!data || typeof data !== "object") {
            throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", `${label} returned an invalid record.`);
        }
        if (recordId(data) !== id) {
            throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", `${label} returned an unexpected record identifier.`);
        }
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

async function findInventoryLotId(mmLotId: number, branchId: number, productId: number, batchNo: string): Promise<number | null> {
    try {
        const rows = await loadMmInventoryLots({ mmLotIds: [mmLotId], branchId, productId, batchNo, onlyActive: false });
        const resolved = Number(rows[0]?.inventory_lot_id ?? 0);
        return Number.isSafeInteger(resolved) && resolved > 0 ? resolved : null;
    } catch {
        return null;
    }
}

async function buildComponentPlans(
    materials: YieldMaterial[],
    jobOrder: ResolvedYieldJobOrder,
    quantityProduced: number
): Promise<ComponentPlan[]> {
    const plans = materials
        .map(material => ({
            material,
            quantity: calculateIncrementalMaterialConsumption(material, quantityProduced, jobOrder.targetQuantity),
            lots: [] as LotAllocation[]
        }))
        .filter(plan => plan.quantity > EPSILON);

    for (const plan of plans) {
        const reservationRows = await directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_eq]=${encodeURIComponent(String(plan.material.materialId))}&fields=*&limit=-1`,
            `Staged reservation lookup for ${plan.material.productName}`
        );
        const stagedReservations = reservationRows
            .map(row => ({
                row,
                reservationId: recordId(row.jo_materials_reservation_id ?? row.id),
                productId: numericRelationId(row.product_id),
                branchId: numericRelationId(row.branch_id),
                mmLotId: numericRelationId(row.mm_lot_id),
                inventoryLotId: numericRelationId(row.inventory_lot_id),
                batchNumber: String(row.batch_no || "").trim(),
                stagedQuantity: Number(row.staged_quantity || 0),
                actualUsedQuantity: Number(row.actual_used_quantity || 0)
            }))
            .filter(reservation =>
                reservation.reservationId > 0
                && reservation.productId === plan.material.productId
                && reservation.branchId === jobOrder.branchId
                && reservation.mmLotId > 0
                && reservation.inventoryLotId > 0
                && reservation.batchNumber.length > 0
                && Number.isFinite(reservation.stagedQuantity)
                && reservation.stagedQuantity > EPSILON
            )
            .map(reservation => ({
                ...reservation,
                availableQuantity: Math.max(0, reservation.stagedQuantity - Math.max(0, reservation.actualUsedQuantity))
            }))
            .filter(reservation => reservation.availableQuantity > EPSILON)
            .sort((left, right) => {
                const leftCreated = new Date(left.row.created_at || 0).getTime();
                const rightCreated = new Date(right.row.created_at || 0).getTime();
                return leftCreated - rightCreated || left.reservationId - right.reservationId;
            });

        const totalAvailable = stagedReservations.reduce((sum, reservation) => sum + reservation.availableQuantity, 0);
        if (totalAvailable + EPSILON < plan.quantity) {
            throw new YieldCompletionError(
                422,
                "MATERIAL_STAGING_SHORTAGE",
                `Insufficient hard-staged material for ${plan.material.productName}. Needed ${formatQuantity(plan.quantity)} units, available ${formatQuantity(totalAvailable)} units.`
            );
        }

        let remaining = plan.quantity;
        for (const reservation of stagedReservations) {
            if (remaining <= EPSILON) break;
            const portion = Math.min(remaining, reservation.availableQuantity);
            plan.lots.push({
                lotId: reservation.mmLotId,
                inventoryLotId: reservation.inventoryLotId,
                reservationId: reservation.reservationId,
                lotNumber: reservation.batchNumber,
                expiryDate: reservation.row.expiry_date || null,
                createdOn: reservation.row.created_at || null,
                quantity: portion,
                expectedActualUsedQuantity: reservation.actualUsedQuantity + portion
            });
            remaining -= portion;
        }

        if (remaining > EPSILON) {
            throw new YieldCompletionError(
                422,
                "MATERIAL_STAGING_SHORTAGE",
                `Hard-staged material for ${plan.material.productName} could not satisfy the requested quantity.`
            );
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

    // The Spring view is the normal read source, but a newly written movement
    // can be briefly absent from a stale/read-replica view. Verify the write
    // against the authoritative Directus collection before treating it as
    // missing and rolling the completion back.
    const directusBySourceId = await directusRows<any>(
        `${DIRECTUS_URL}/items/inventory_movements?filter=${encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _eq: productId } },
                { branch_id: { _eq: branchId } },
                { transaction_type_id: { _eq: 2 } },
                { quantity: { _gt: 0 } },
                { batch_no: { _eq: lotNumber } },
                { source_document_id: { _eq: jobOrderId } }
            ]
        }))}&fields=movement_id,product_id,mm_lot_id,branch_id,transaction_type_id,quantity,batch_no,source_document_id,source_document_no,manufacturing_date,expiry_date&limit=-1`,
        `Directus finished-goods movement lookup for ${joNo}`
    );
    if (directusBySourceId.length > 0) return directusBySourceId;

    const legacyRows = await fetchMmInventoryMovements({
        product: productId,
        branch: branchId,
        batchNo: lotNumber,
        transactionTypeId: 2,
        movementDirection: "IN",
        referenceNo: joNo
    });
    const filteredLegacyRows = legacyRows.filter(row => numericRelationId(row.source_document_id) <= 0);
    if (filteredLegacyRows.length > 0) return filteredLegacyRows;

    return directusRows<any>(
        `${DIRECTUS_URL}/items/inventory_movements?filter=${encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _eq: productId } },
                { branch_id: { _eq: branchId } },
                { transaction_type_id: { _eq: 2 } },
                { quantity: { _gt: 0 } },
                { batch_no: { _eq: lotNumber } },
                { source_document_no: { _eq: joNo } },
                {
                    _or: [
                        { source_document_id: { _null: true } },
                        { source_document_id: { _eq: 0 } }
                    ]
                }
            ]
        }))}&fields=movement_id,product_id,mm_lot_id,branch_id,transaction_type_id,quantity,batch_no,source_document_id,source_document_no,manufacturing_date,expiry_date&limit=-1`,
        `Directus legacy finished-goods movement lookup for ${joNo}`
    );
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
    expirationDate: string,
    mmLotId: number
): any | null {
    return rows.find(row =>
        Number(row.product_id) === productId
        && Number(row.branch_id) === branchId
        && Number(row.transaction_type_id) === 2
        && Number(row.quantity) === quantity
        && String(row.batch_no || "").trim() === lotNumber
        && movementLotId(row) === mmLotId
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
        // The operator may post a different batch than the run that was
        // auto-selected. Prefer the run that matches the submitted batch.
        rows = String(row?.lot_number || "").trim() === lotNumber
            ? [row]
            : await directusRows<any>(
                `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter=${encodeURIComponent(JSON.stringify({
                    _and: [
                        { job_order_id: { _eq: jobOrder.jobOrderId } },
                        { lot_number: { _eq: lotNumber } }
                    ]
                }))}&limit=-1`,
                `Yield ledger resolution for ${jobOrder.jobOrderNo}`
            );
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
    try {
        return await hasJobOrderReceipt({ productId, branchId, jobOrderNo: joNo, quantity, expectedLedgerId });
    } catch (error) {
        throw error instanceof YieldCompletionError
            ? error
            : new YieldCompletionError(
                502,
                "DIRECTUS_RESPONSE_INVALID",
                error instanceof Error ? error.message : `Finished-goods ledger lookup for ${joNo} failed.`
            );
    }
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
        if (isCancelledJobOrderStatus(link.status)) continue;
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
        allDetails.forEach(orderDetail => {
            finiteNumber(orderDetail.ordered_quantity ?? 0, "Sales-order ordered quantity", { positive: true });
            finiteNumber(orderDetail.allocated_quantity ?? 0, "Sales-order allocated quantity", { nonNegative: true });
            finiteNumber(orderDetail.served_quantity ?? 0, "Sales-order served quantity", { nonNegative: true });
        });

        const nextStatus = salesOrderStatusAfterFulfillment(allDetails);
        if (isProductionSchedulingStatus(currentStatus) && nextStatus !== currentStatus) {
            await journal.patch(
                "sales_order",
                parentOrderId,
                { order_status: nextStatus },
                `Update sales-order status ${parentOrderId}`
            );
            expectedStatusByParent.set(parentOrderId, nextStatus);
        } else if (isProductionSchedulingStatus(currentStatus)) {
            expectedStatusByParent.set(parentOrderId, currentStatus);
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
    mmLotId: number;
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
        mmLotId,
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
        expirationDate,
        mmLotId
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
        for (const lot of plan.lots) {
            const genealogyRows = await directusRows<any>(
                `${DIRECTUS_URL}/items/jo_material_genealogy?filter=${encodeURIComponent(JSON.stringify({
                    _and: [
                        { job_order_id: { _eq: jobOrder.jobOrderId } },
                        { batch_no: { _eq: lotNumber } },
                        { component_product_id: { _eq: plan.material.productId } },
                        { component_mm_lot_id: { _eq: lot.lotId } },
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

            const reservation = await directusJson<any>(
                `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations/${encodeURIComponent(String(lot.reservationId))}`,
                `Staged reservation verification for ${lot.lotNumber}`
            );
            if (
                numericRelationId(reservation.mm_lot_id) !== lot.lotId
                || numericRelationId(reservation.inventory_lot_id) !== lot.inventoryLotId
                || String(reservation.batch_no || "").trim() !== lot.lotNumber
                || Number(reservation.actual_used_quantity || 0) + EPSILON < Number(lot.expectedActualUsedQuantity || 0)
            ) {
                throw new YieldCompletionError(
                    502,
                    "PERSISTENCE_VERIFICATION_FAILED",
                    `Staged reservation for ${lot.lotNumber} did not retain the exact lot, batch, and actual usage.`
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
    yieldLedgerId: number,
    mmLotId: number,
    inventoryLotId: number | null
) {
    const movementId = recordId(movement);
    return {
        id: movementId,
        movement_id: movementId,
        yield_ledger_id: yieldLedgerId,
        job_order_id: jobOrder.jobOrderId,
        job_order_status: JOB_ORDER_STATUS.COMPLETED,
        jo_id: jobOrder.jobOrderNo,
        product_id: jobOrder.productId,
        product_name: input.productName || "Manufactured Good",
        quantity_produced: quantityProduced,
        branch_id: branchId,
        lot_number: lotNumber,
        batch_no: lotNumber,
        mm_lot_id: mmLotId,
        inventory_lot_id: inventoryLotId,
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
    let leftoverReturnExecution: JobOrderCancellationExecution | null = null;

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
        if (jobOrder.branchId === null || jobOrder.branchId <= 0) {
            throw new YieldCompletionError(422, "JOB_ORDER_BRANCH_MISSING", "The Job Order must have a persisted branch before finished-goods posting.");
        }
        if (jobOrder.branchId !== branchId) {
            throw new YieldCompletionError(422, "JOB_ORDER_BRANCH_MISMATCH", "The selected branch does not belong to this Job Order.");
        }

        const requestedMmLotId = Number(input.mmLotId ?? 0);
        if (!Number.isSafeInteger(requestedMmLotId) || requestedMmLotId <= 0) {
            throw new YieldCompletionError(
                422,
                "YIELD_LOT_REQUIRED",
                "Select an existing storage lot for the finished-goods output."
            );
        }
        try {
            await loadEligibleFinishedGoodsLot({
                mmLotId: requestedMmLotId,
                branchId,
                productId: jobOrder.productId
            });
        } catch (error) {
            if (error instanceof MmLotError) {
                throw new YieldCompletionError(error.status, error.code, error.message);
            }
            throw error;
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
        operationKey = `yield-close:${jobOrder.jobOrderId}:${yieldLedger.id}:${jobOrder.productId}:${branchId}:${lotNumber}:${requestedMmLotId}:2`;

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
                expirationDate,
                requestedMmLotId
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
                const existingInventoryLotId = await findInventoryLotId(requestedMmLotId, branchId, jobOrder.productId, lotNumber);
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
                        yieldLedger.id,
                        requestedMmLotId,
                        existingInventoryLotId
                    ),
                    accounting: {
                        finishedMovementId: recordId(existingMovement),
                        yieldLedgerId: yieldLedger.id,
                        mmLotId: requestedMmLotId,
                        inventoryLotId: existingInventoryLotId
                    }
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

        if (isCancelledJobOrderStatus(jobOrder.status)) {
            throw new YieldCompletionError(
                409,
                "JOB_ORDER_CANCELLED",
                `Job Order ${jobOrder.jobOrderNo} is cancelled and cannot be closed.`
            );
        }

        const componentPlans = await buildComponentPlans(materials, jobOrder, quantityProduced);
        const phtMovementTimestamp = formatPhtDateTime();

        // Leftover staged material must be explicitly confirmed by QA before
        // the close consumes what it needs; returns post after verification so
        // the component-consumption checks still see the staged quantities.
        const leftoverOrder = await fetchJobOrder(jobOrder.jobOrderId);
        const leftoverComputed = await computeJobOrderMaterialReturns(leftoverOrder);
        for (const plan of componentPlans) {
            for (const lot of plan.lots) {
                const line = leftoverComputed.lines.find((entry) => entry.reservationIds.includes(lot.reservationId));
                if (!line) continue;
                line.consumedQuantity = roundTo4(line.consumedQuantity + lot.quantity);
                line.returnableQuantity = Math.max(0, roundTo4(line.stagedQuantity - line.consumedQuantity));
            }
        }
        if (leftoverComputed.reconciliationError) {
            throw new YieldCompletionError(409, "JOB_ORDER_RECONCILIATION_FAILED", leftoverComputed.reconciliationError);
        }
        const returnConfirmation = parseMaterialReturnConfirmation(input.materialReturnConfirmation);
        const hasLeftovers = leftoverComputed.lines.some(
            (line) => !line.releaseOnly && line.returnableQuantity > EPSILON
        );
        if (hasLeftovers && !returnConfirmation) {
            throw new YieldCompletionError(
                422,
                "MATERIAL_RETURN_CONFIRMATION_REQUIRED",
                "This Job Order has leftover staged material. Review and confirm the raw-material return before closing the yield."
            );
        }
        if (returnConfirmation) {
            applyMaterialReturnDestinations(leftoverComputed, leftoverOrder, returnConfirmation.destinations);
        }

        journal = new MutationJournal();
        const finishedLotId = requestedMmLotId;
        const inventoryLot = await resolveOrCreateMmInventoryLot({
            mmLotId: requestedMmLotId,
            branchId,
            productId: jobOrder.productId,
            batchNo: lotNumber,
            manufacturingDate,
            expiryDate: expirationDate,
            unitCost: Number(input.unitCost ?? 0),
            qaStatus: "GOOD",
            sourceType: "JOB_ORDER_YIELD",
            sourceReference: jobOrder.jobOrderNo,
            remarks: `Finished yield output from Job Order ${jobOrder.jobOrderNo}`,
            createdBy: 24,
            onCreate: (body) => journal!.create("mm_inventory_lots", { ...body }, `Create finished-goods batch ${lotNumber}`)
        });
        const inventoryLotId = mmInventoryLotId(inventoryLot.inventory_lot_id) ?? 0;
        const finishedMovement = await journal.create<any>(
            "inventory_movements",
            {
                product_id: jobOrder.productId,
                mm_lot_id: finishedLotId,
                lot_id: null,
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

        const persistedGenealogy: number[] = [];
        const persistedMaterialUpdates: number[] = [];

        for (const plan of componentPlans) {
            for (const lot of plan.lots) {
                const reservation = await directusJson<any>(
                    `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations/${encodeURIComponent(String(lot.reservationId))}`,
                    `Staged reservation preflight for ${lot.lotNumber}`
                );
                const currentStagedQuantity = Number(reservation.staged_quantity || 0);
                const currentActualUsedQuantity = Number(reservation.actual_used_quantity || 0);
                const availableStagedQuantity = currentStagedQuantity - currentActualUsedQuantity;
                if (
                    numericRelationId(reservation.mm_lot_id) !== lot.lotId
                    || numericRelationId(reservation.inventory_lot_id) !== lot.inventoryLotId
                    || String(reservation.batch_no || "").trim() !== lot.lotNumber
                    || availableStagedQuantity + EPSILON < lot.quantity
                ) {
                    throw new YieldCompletionError(
                        409,
                        "MATERIAL_STAGING_CHANGED",
                        `The hard-staged allocation for ${lot.lotNumber} changed or is no longer sufficient. Refresh staging before closing yield.`
                    );
                }

                const nextActualUsedQuantity = currentActualUsedQuantity + lot.quantity;
                await journal.patch(
                    "manufacturing_job_order_materials_reservations",
                    lot.reservationId,
                    { actual_used_quantity: nextActualUsedQuantity },
                    `Update staged reservation usage for ${lot.lotNumber}`
                );
                lot.expectedActualUsedQuantity = nextActualUsedQuantity;

                const genealogy = await journal.create<any>(
                    "jo_material_genealogy",
                    {
                        job_order_id: jobOrder.jobOrderId,
                        batch_no: lotNumber,
                        component_product_id: plan.material.productId,
                        component_mm_lot_id: lot.lotId,
                        component_lot_id: null,
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
                lot_number: lotNumber,
                mm_lot_id: requestedMmLotId
            },
            `Update yield ledger ${yieldLedger.id}`
        );
        if (recordId(updatedYieldLedger) !== yieldLedger.id) {
            throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", "Yield ledger update returned an invalid record identifier.");
        }

        const oldStatus = normalizeJobOrderStatus(jobOrder.status || JOB_ORDER_STATUS.IN_PROGRESS);
        if (!oldStatus) {
            throw new YieldCompletionError(
                409,
                "UNKNOWN_JOB_ORDER_STATUS",
                `Job Order ${jobOrder.jobOrderNo} has an unknown status and cannot be completed.`
            );
        }
        await journal.patch(
            "manufacturing_job_orders",
            jobOrder.jobOrderId,
            {
                status: JOB_ORDER_STATUS.COMPLETED,
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
                new_status: JOB_ORDER_STATUS.COMPLETED,
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
            mmLotId: requestedMmLotId,
            manufacturingDate,
            expirationDate,
            materials,
            componentPlans
        });

        const allocationExpectations = await processSalesOrderAllocations(journal, jobOrder, quantityProduced);
        await verifySalesOrderAllocations(allocationExpectations);

        // Post leftover returns after the closing writes and verification so
        // the staged-consumption checks above still see the hard-staged stock.
        if (hasLeftovers) {
            const needsDestination = leftoverComputed.lines.some(
                (line) => !line.releaseOnly && line.returnableQuantity > EPSILON && line.requiresLotSelection
            );
            if (needsDestination) {
                throw new YieldCompletionError(
                    422,
                    "JOB_ORDER_RETURN_DESTINATION_REQUIRED",
                    "One or more leftover return lines need an active destination lot before the yield can be closed."
                );
            }
            leftoverReturnExecution = await executeJobOrderMaterialReturns(leftoverOrder, leftoverComputed, {
                reason: `Return leftover raw materials during yield closing for ${leftoverOrder.jobOrderNo}`,
                actorUserId: 24,
                writeStatus: false
            });
        }

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
                yieldLedger.id,
                requestedMmLotId,
                inventoryLotId || null
            ),
            accounting: {
                finishedMovementId,
                finishedLedgerId,
                yieldLedgerId: yieldLedger.id,
                mmLotId: requestedMmLotId,
                inventoryLotId: inventoryLotId || null,
                componentLedgerIds: [],
                componentMovementIds: [],
                genealogyIds: persistedGenealogy,
                materialIds: persistedMaterialUpdates,
                statusHistoryId
            }
        };
    } catch (error) {
        if (leftoverReturnExecution) {
            try {
                await leftoverReturnExecution.compensate();
            } catch (compensateError) {
                console.error("Unable to compensate the leftover material return:", compensateError);
            }
        }
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
        if (error instanceof MmLotError) {
            const lotError = new YieldCompletionError(error.status, error.code, error.message);
            lotError.operationKey = operationKey;
            throw lotError;
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
        String(input.lotNumber ?? "").trim(),
        String(input.mmLotId ?? "").trim(),
        input.materialReturnConfirmation ? "ret" : "noret"
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

/* ------------------------------------------------------------------------- */
/* Halted Job Order finalization: partial FG receipt + leftover return       */
/* ------------------------------------------------------------------------- */

export interface HaltFinalizeMaterialInput {
    joMaterialId: number;
    consumedQty: number;
}

export interface FinalizeHaltedJobOrderInput {
    joId: string | number;
    productId: string | number;
    productName?: string;
    quantityProduced: string | number;
    branchId: string | number;
    lotNumber: string;
    mmLotId: string | number;
    manufacturingDate: string;
    expirationDate: string;
    unitCost?: string | number | null;
    materials?: HaltFinalizeMaterialInput[];
    remarks?: string;
    actorUserId?: number | null;
}

export interface HaltFinalizePreviewMaterial {
    joMaterialId: number;
    productId: number;
    productName: string;
    unitOfMeasure: string;
    allocatedQuantity: number;
    remainingQuantity: number;
    stagedQuantity: number;
    consumedQuantity: number;
    returnableQuantity: number;
    requiresLotSelection: boolean;
    destinationAction: "REUSE" | "CREATE" | "MIXED" | "NONE";
}

export interface HaltFinalizePreview {
    jobOrder: {
        jobOrderId: number;
        jobOrderNo: string;
        productId: number;
        productName: string;
        branchId: number;
        targetQuantity: number;
        producedQuantity: number;
        status: string;
    };
    materials: HaltFinalizePreviewMaterial[];
    defaultLotNumber: string;
    fingerprint: string;
}

interface FinalizeConsumptionPlan {
    material: YieldMaterial;
    quantity: number;
    lots: LotAllocation[];
}

function haltFinalizeFingerprint(
    lines: Array<{ joMaterialId: number; stagedQuantity: number; consumedQuantity: number; returnableQuantity: number }>
): string {
    return lines
        .map(line => [
            Number(line.joMaterialId),
            Number(line.stagedQuantity || 0).toFixed(4),
            Number(line.consumedQuantity || 0).toFixed(4),
            Number(line.returnableQuantity || 0).toFixed(4)
        ].join(":"))
        .sort()
        .join("|");
}

async function loadHaltFinalizeState(joId: string | number): Promise<{
    jobOrder: ResolvedYieldJobOrder;
    materials: YieldMaterial[];
    computed: Awaited<ReturnType<typeof computeJobOrderMaterialReturns>>;
}> {
    const { jobOrder, materials } = await loadYieldMaterials(joId);
    const returnOrder = await fetchJobOrder(jobOrder.jobOrderId);
    const computed = await computeJobOrderMaterialReturns(returnOrder);
    return { jobOrder, materials, computed };
}

export async function previewHaltFinalize(joId: string | number): Promise<HaltFinalizePreview> {
    const { jobOrder, materials, computed } = await loadHaltFinalizeState(joId);
    const productName = await resolveJobOrderProductName(jobOrder.productId);

    const previewMaterials = materials.map(material => {
        const lines = computed.lines.filter(line => Number(line.joMaterialId) === Number(material.materialId));
        const staged = roundTo4(lines.reduce((sum, line) => sum + Number(line.stagedQuantity || 0), 0));
        const consumed = roundTo4(lines.reduce((sum, line) => sum + Number(line.consumedQuantity || 0), 0));
        const returnable = roundTo4(lines.reduce((sum, line) => sum + Number(line.returnableQuantity || 0), 0));
        const actions = new Set(
            lines
                .filter(line => !line.releaseOnly && Number(line.returnableQuantity || 0) > EPSILON)
                .map(line => line.destination?.action || "NONE")
        );
        const destinationAction = actions.size === 0
            ? "NONE"
            : actions.size === 1
                ? (Array.from(actions)[0] as HaltFinalizePreviewMaterial["destinationAction"])
                : "MIXED";
        return {
            joMaterialId: Number(material.materialId),
            productId: Number(material.productId),
            productName: material.productName,
            unitOfMeasure: material.unitOfMeasure || "units",
            allocatedQuantity: roundTo4(Number(material.allocatedQuantity || 0)),
            remainingQuantity: roundTo4(Number(material.remainingQuantity || 0)),
            stagedQuantity: staged,
            consumedQuantity: consumed,
            returnableQuantity: returnable,
            requiresLotSelection: lines.some(line => Boolean(line.requiresLotSelection)),
            destinationAction
        };
    });

    const today = await getTodayDateString();
    return {
        jobOrder: {
            jobOrderId: jobOrder.jobOrderId,
            jobOrderNo: jobOrder.jobOrderNo,
            productId: jobOrder.productId,
            productName,
            branchId: jobOrder.branchId ?? 0,
            targetQuantity: roundTo4(Number(jobOrder.targetQuantity || 0)),
            producedQuantity: roundTo4(Number(jobOrder.actualQuantityProduced || 0)),
            status: String(jobOrder.status || "")
        },
        materials: previewMaterials,
        defaultLotNumber: `${jobOrder.jobOrderNo}-YLD-${today.replace(/-/g, "")}`,
        fingerprint: haltFinalizeFingerprint(computed.lines)
    };
}

async function buildFinalizeConsumptionPlans(
    materials: YieldMaterial[],
    jobOrder: ResolvedYieldJobOrder,
    consumptionByMaterial: Map<number, number>
): Promise<FinalizeConsumptionPlan[]> {
    const plans: FinalizeConsumptionPlan[] = [];
    for (const material of materials) {
        const requested = consumptionByMaterial.get(Number(material.materialId)) ?? 0;
        if (requested <= EPSILON) continue;

        const reservationRows = await directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_eq]=${encodeURIComponent(String(material.materialId))}&fields=*&limit=-1`,
            `Staged reservation lookup for ${material.productName}`
        );
        const stagedReservations = reservationRows
            .map(row => ({
                row,
                reservationId: recordId(row.jo_materials_reservation_id ?? row.id),
                productId: numericRelationId(row.product_id),
                branchId: numericRelationId(row.branch_id),
                mmLotId: numericRelationId(row.mm_lot_id),
                inventoryLotId: numericRelationId(row.inventory_lot_id),
                batchNumber: String(row.batch_no || "").trim(),
                stagedQuantity: Number(row.staged_quantity || 0),
                actualUsedQuantity: Number(row.actual_used_quantity || 0)
            }))
            .filter(reservation =>
                reservation.reservationId > 0
                && reservation.productId === material.productId
                && reservation.branchId === jobOrder.branchId
                && reservation.mmLotId > 0
                && reservation.inventoryLotId > 0
                && reservation.batchNumber.length > 0
                && Number.isFinite(reservation.stagedQuantity)
                && reservation.stagedQuantity > EPSILON
            )
            .map(reservation => ({
                ...reservation,
                availableQuantity: Math.max(0, reservation.stagedQuantity - Math.max(0, reservation.actualUsedQuantity))
            }))
            .filter(reservation => reservation.availableQuantity > EPSILON)
            .sort((left, right) => {
                const leftCreated = new Date(left.row.created_at || 0).getTime();
                const rightCreated = new Date(right.row.created_at || 0).getTime();
                return leftCreated - rightCreated || left.reservationId - right.reservationId;
            });

        const totalAvailable = stagedReservations.reduce((sum, reservation) => sum + reservation.availableQuantity, 0);
        if (totalAvailable + EPSILON < requested) {
            throw new YieldCompletionError(
                422,
                "CONSUMPTION_EXCEEDS_STAGED",
                `Consumed quantity for ${material.productName} (${formatQuantity(requested)}) exceeds the staged remainder (${formatQuantity(totalAvailable)}).`
            );
        }

        const plan: FinalizeConsumptionPlan = { material, quantity: requested, lots: [] };
        let remaining = requested;
        for (const reservation of stagedReservations) {
            if (remaining <= EPSILON) break;
            const portion = Math.min(remaining, reservation.availableQuantity);
            plan.lots.push({
                lotId: reservation.mmLotId,
                inventoryLotId: reservation.inventoryLotId,
                reservationId: reservation.reservationId,
                lotNumber: reservation.batchNumber,
                expiryDate: reservation.row.expiry_date || null,
                createdOn: reservation.row.created_at || null,
                quantity: portion,
                expectedActualUsedQuantity: reservation.actualUsedQuantity + portion
            });
            remaining -= portion;
        }
        plans.push(plan);
    }
    return plans;
}

async function resolvePendingDispositionsForJobOrder(
    jobOrderId: number,
    actorUserId: number,
    closeRemarks: string
): Promise<void> {
    try {
        const filter = encodeURIComponent(JSON.stringify({
            _and: [
                { job_order_id: { _eq: jobOrderId } },
                { disposition_status: { _eq: "Pending" } }
            ]
        }));
        const rows = await directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_qa_dispositions?filter=${filter}&limit=-1`,
            `Pending QA disposition lookup for Job Order ${jobOrderId}`
        );
        for (const row of rows) {
            const dispositionId = Number(row?.id ?? row?.disposition_id ?? 0);
            if (!Number.isSafeInteger(dispositionId) || dispositionId <= 0) continue;
            await directusJson(
                `${DIRECTUS_URL}/items/manufacturing_qa_dispositions/${dispositionId}`,
                `Resolve QA disposition ${dispositionId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        disposition_status: "Resolved",
                        decision: "Finalized (Partial Yield)",
                        supervisor_comments: closeRemarks,
                        resolved_at: new Date().toISOString(),
                        resolved_by: actorUserId
                    })
                }
            );
        }
    } catch (error) {
        console.error("Halted Job Order finalized but pending QA dispositions could not be resolved automatically:", error);
    }
}

export async function finalizeHaltedJobOrder(input: FinalizeHaltedJobOrderInput): Promise<Record<string, unknown>> {
    let operationKey = "halt-finalize";
    let journal: MutationJournal | null = null;
    let leftoverExecution: JobOrderCancellationExecution | null = null;

    try {
        const quantityProduced = finiteNumber(input.quantityProduced, "Produced quantity", { positive: true });
        const branchId = finiteNumber(input.branchId, "Branch ID", { positive: true });
        const requestedProductId = finiteNumber(input.productId, "Product ID", { positive: true });
        const requestedMmLotId = finiteNumber(input.mmLotId, "Storage lot", { positive: true });
        const requestedJoId = String(input.joId ?? "").trim();
        const lotNumber = String(input.lotNumber ?? "").trim();
        if (!requestedJoId) {
            throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", "Job order ID or number is required.");
        }
        if (!lotNumber) {
            throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", "A batch/lot number is required.");
        }

        const manufacturingDate = normalizeDate(input.manufacturingDate, "Manufacturing date");
        const expirationDate = normalizeDate(input.expirationDate, "Expiration date");
        if (manufacturingDate > expirationDate) {
            throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", "Expiration date cannot be earlier than manufacturing date.");
        }
        finiteNumber(input.unitCost ?? 0, "Unit cost", { nonNegative: true });
        const actorUserId = Number.isSafeInteger(Number(input.actorUserId)) && Number(input.actorUserId) > 0
            ? Number(input.actorUserId)
            : 24;

        const { jobOrder, materials, computed } = await loadHaltFinalizeState(requestedJoId);
        if (requestedProductId !== jobOrder.productId) {
            throw new YieldCompletionError(422, "JOB_ORDER_PRODUCT_MISMATCH", "The selected product does not belong to this Job Order.");
        }
        if (jobOrder.branchId === null || jobOrder.branchId <= 0) {
            throw new YieldCompletionError(422, "JOB_ORDER_BRANCH_MISSING", "The Job Order must have a persisted branch before finalizing.");
        }
        if (jobOrder.branchId !== branchId) {
            throw new YieldCompletionError(422, "JOB_ORDER_BRANCH_MISMATCH", "The selected branch does not belong to this Job Order.");
        }

        operationKey = `halt-finalize:${jobOrder.jobOrderId}:${lotNumber}:${requestedMmLotId}:${roundTo4(quantityProduced)}`;

        const existingMovements = await findExistingFinishedMovements(
            jobOrder.productId,
            branchId,
            jobOrder.jobOrderId,
            jobOrder.jobOrderNo,
            lotNumber
        );
        if (existingMovements.length > 1) {
            throw new YieldCompletionError(409, "YIELD_DUPLICATE_MOVEMENTS", `More than one finished-goods movement exists for ${jobOrder.jobOrderNo} and lot ${lotNumber}. Reconciliation is required.`);
        }
        if (existingMovements.length === 1) {
            const persisted = existingMovements[0];
            const sameQuantity = Math.abs(Number(persisted.quantity || 0) - quantityProduced) <= EPSILON;
            if (sameQuantity && isTerminalJobOrderStatus(jobOrder.status)) {
                const ledgerRows = await directusRows<any>(
                    `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter=${encodeURIComponent(JSON.stringify({
                        _and: [
                            { job_order_id: { _eq: jobOrder.jobOrderId } },
                            { lot_number: { _eq: lotNumber } }
                        ]
                    }))}&limit=-1`,
                    `Yield ledger lookup for ${jobOrder.jobOrderNo}`
                ).catch(() => [] as any[]);
                return {
                    success: true,
                    idempotent: true,
                    data: {
                        job_order_id: jobOrder.jobOrderId,
                        job_order_status: JOB_ORDER_STATUS.COMPLETED,
                        movement_id: recordId(persisted),
                        yield_ledger_id: ledgerRows.length === 1 ? recordId(ledgerRows[0]) : null,
                        quantity_produced: quantityProduced,
                        lot_number: lotNumber
                    }
                };
            }
            throw new YieldCompletionError(
                409,
                "YIELD_ALREADY_POSTED_INCOMPLETE",
                `A finished-goods movement already exists for ${jobOrder.jobOrderNo} and lot ${lotNumber}. Reconciliation is required.`
            );
        }

        if (!isJobOrderStatus(jobOrder.status, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD)) {
            throw new YieldCompletionError(
                409,
                "JOB_ORDER_NOT_HALTED",
                `Only On Hold or QA Hold Job Orders can be finalized with a partial yield. Current status: ${jobOrder.status || "Unknown"}.`
            );
        }

        const remainingTarget = Math.max(0, Number(jobOrder.targetQuantity || 0) - Number(jobOrder.actualQuantityProduced || 0));
        if (remainingTarget > EPSILON && quantityProduced > remainingTarget + EPSILON) {
            throw new YieldCompletionError(
                422,
                "YIELD_EXCEEDS_TARGET",
                `Produced quantity ${formatQuantity(quantityProduced)} exceeds the remaining target ${formatQuantity(remainingTarget)}.`
            );
        }

        try {
            await loadEligibleFinishedGoodsLot({ mmLotId: requestedMmLotId, branchId, productId: jobOrder.productId });
        } catch (error) {
            if (error instanceof MmLotError) {
                throw new YieldCompletionError(error.status, error.code, error.message);
            }
            throw error;
        }

        const consumptionByMaterial = new Map<number, number>();
        for (const entry of Array.isArray(input.materials) ? input.materials : []) {
            const materialId = Number(entry?.joMaterialId);
            const consumedQty = Number(entry?.consumedQty);
            if (!Number.isSafeInteger(materialId) || materialId <= 0 || !Number.isFinite(consumedQty) || consumedQty < -EPSILON) {
                throw new YieldCompletionError(400, "CONSUMPTION_INVALID", "Material consumption entries must reference a Job Order material and a non-negative quantity.");
            }
            consumptionByMaterial.set(materialId, roundTo4(Math.max(0, consumedQty)));
        }
        const unknownMaterialId = [...consumptionByMaterial.keys()].find(
            materialId => !materials.some(material => Number(material.materialId) === materialId)
        );
        if (unknownMaterialId) {
            throw new YieldCompletionError(400, "CONSUMPTION_INVALID", `Material #${unknownMaterialId} does not belong to ${jobOrder.jobOrderNo}.`);
        }

        const consumptionPlans = await buildFinalizeConsumptionPlans(materials, jobOrder, consumptionByMaterial);
        const totalConsumed = roundTo4(consumptionPlans.reduce((sum, plan) => sum + plan.quantity, 0));

        if (computed.reconciliationError) {
            throw new YieldCompletionError(409, "JOB_ORDER_RECONCILIATION_FAILED", computed.reconciliationError);
        }
        const expectedReturned = roundTo4(Math.max(0, Number(computed.totals.returnableQuantity || 0) - totalConsumed));
        if (expectedReturned > EPSILON) {
            const requiresDestination = computed.lines.some(
                line => !line.releaseOnly && line.requiresLotSelection && Number(line.returnableQuantity || 0) > EPSILON
            );
            if (requiresDestination) {
                throw new YieldCompletionError(422, "JOB_ORDER_RETURN_DESTINATION_REQUIRED", "One or more leftover return lines need an active destination lot before the halt can be finalized.");
            }
        }

        journal = new MutationJournal();
        const phtMovementTimestamp = formatPhtDateTime();
        const finishedLotId = requestedMmLotId;
        const inventoryLot = await resolveOrCreateMmInventoryLot({
            mmLotId: requestedMmLotId,
            branchId,
            productId: jobOrder.productId,
            batchNo: lotNumber,
            manufacturingDate,
            expiryDate: expirationDate,
            unitCost: Number(input.unitCost ?? 0),
            qaStatus: "GOOD",
            sourceType: "JOB_ORDER_YIELD",
            sourceReference: jobOrder.jobOrderNo,
            remarks: `Partially finished halted run from Job Order ${jobOrder.jobOrderNo}`,
            createdBy: actorUserId,
            onCreate: (body) => journal!.create("mm_inventory_lots", { ...body }, `Create partial-close batch ${lotNumber}`)
        });
        const inventoryLotId = mmInventoryLotId(inventoryLot.inventory_lot_id) ?? 0;

        const yieldLedgerRow = await journal.create<any>(
            "manufacturing_job_order_yield_ledger",
            {
                job_order_id: jobOrder.jobOrderId,
                shift_name: "Partial close (halt)",
                yield_quantity: quantityProduced,
                scrap_quantity: 0,
                lot_number: lotNumber,
                qa_status: "Pending",
                mm_lot_id: requestedMmLotId,
                logged_at: phtMovementTimestamp,
                logged_by: actorUserId
            },
            `Create partial-close yield ledger for ${jobOrder.jobOrderNo}`
        );
        const yieldLedgerId = recordId(yieldLedgerRow);

        const finishedMovement = await journal.create<any>(
            "inventory_movements",
            {
                product_id: jobOrder.productId,
                mm_lot_id: finishedLotId,
                lot_id: null,
                branch_id: branchId,
                transaction_type_id: 2,
                source_document_id: jobOrder.jobOrderId,
                source_document_no: jobOrder.jobOrderNo,
                batch_no: lotNumber,
                expiry_date: expirationDate,
                manufacturing_date: manufacturingDate,
                quantity: quantityProduced,
                created_by: actorUserId,
                remarks: `Partial yield output from halted Job Order ${jobOrder.jobOrderNo}`
            },
            "Create partial finished-goods movement"
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
                documentDescription: `Partial close: ${lotNumber}`,
                documentDate: await getTodayDateString()
            },
            "Create partial finished-goods product ledger"
        );
        const finishedLedgerId = recordId(finishedLedger);

        const persistedGenealogy: number[] = [];
        for (const plan of consumptionPlans) {
            for (const lot of plan.lots) {
                const genealogy = await journal.create<any>(
                    "jo_material_genealogy",
                    {
                        job_order_id: jobOrder.jobOrderId,
                        batch_no: lotNumber,
                        component_product_id: plan.material.productId,
                        component_mm_lot_id: lot.lotId,
                        component_lot_id: null,
                        component_batch_no: lot.lotNumber,
                        consumed_quantity: lot.quantity,
                        created_at: phtMovementTimestamp
                    },
                    `Create partial-close genealogy for ${plan.material.productName}`
                );
                persistedGenealogy.push(recordId(genealogy));
                await journal.patch(
                    "manufacturing_job_order_materials_reservations",
                    lot.reservationId,
                    { actual_used_quantity: lot.expectedActualUsedQuantity },
                    `Update staged reservation usage for ${lot.lotNumber}`
                );
            }
            await journal.patch(
                "manufacturing_job_order_materials",
                plan.material.materialId,
                {
                    actual_consumed_quantity: roundTo4(plan.material.actualConsumedQuantity + plan.quantity),
                    reserved_quantity: roundTo4(Math.max(0, plan.material.reservedQuantity - plan.quantity))
                },
                `Update consumed material ${plan.material.productName}`
            );
        }

        leftoverExecution = await returnJobOrderMaterialLeftovers({
            joId: jobOrder.jobOrderId,
            reason: `Finalize halted Job Order ${jobOrder.jobOrderNo} — return leftover raw materials`,
            actorUserId
        });
        const returnedQuantity = roundTo4(Number(leftoverExecution.response.returnedQuantity || 0));

        const previousProduced = Number(jobOrder.actualQuantityProduced || 0);
        await journal.patch(
            "manufacturing_job_orders",
            jobOrder.jobOrderId,
            {
                status: JOB_ORDER_STATUS.COMPLETED,
                actual_quantity_produced: roundTo4(previousProduced + quantityProduced),
                completed_quantity: roundTo4(previousProduced + quantityProduced),
                modified_at: new Date().toISOString()
            },
            `Complete halted Job Order ${jobOrder.jobOrderNo}`
        );

        const existingHistory = await findCompletionHistory(jobOrder.jobOrderId);
        if (!existingHistory) {
            await journal.create(
                "manufacturing_job_order_status_history",
                {
                    job_order_id: jobOrder.jobOrderId,
                    old_status: jobOrder.status || JOB_ORDER_STATUS.ON_HOLD,
                    new_status: JOB_ORDER_STATUS.COMPLETED,
                    changed_by: actorUserId,
                    changed_at: new Date().toISOString(),
                    remarks: `Halted run finalized: partial yield ${formatQuantity(quantityProduced)} unit(s); ${formatQuantity(returnedQuantity)} unit(s) returned to store.`
                },
                `Record finalization history for ${jobOrder.jobOrderNo}`
            );
        }

        const persistedJobOrder = await directusJson<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrder.jobOrderId}?fields=status,actual_quantity_produced,completed_quantity`,
            `Finalization verification for ${jobOrder.jobOrderNo}`
        );
        if (normalizeJobOrderStatus(persistedJobOrder?.status) !== JOB_ORDER_STATUS.COMPLETED) {
            throw new YieldCompletionError(502, "PERSISTENCE_VERIFICATION_FAILED", "The Job Order did not persist the Completed status after finalization.");
        }
        const finishedLedgerPersisted = await hasFinishedGoodsLedger(jobOrder.productId, branchId, jobOrder.jobOrderNo, quantityProduced);
        if (!finishedLedgerPersisted) {
            throw new YieldCompletionError(502, "PERSISTENCE_VERIFICATION_FAILED", "The partial finished-goods receipt ledger could not be verified.");
        }

        await resolvePendingDispositionsForJobOrder(
            jobOrder.jobOrderId,
            actorUserId,
            `Halted run finalized with partial yield (${formatQuantity(quantityProduced)} unit(s)); leftovers returned to store.`
        );

        return {
            success: true,
            data: {
                job_order_id: jobOrder.jobOrderId,
                job_order_no: jobOrder.jobOrderNo,
                job_order_status: JOB_ORDER_STATUS.COMPLETED,
                product_id: jobOrder.productId,
                quantity_produced: quantityProduced,
                consumed_quantity: totalConsumed,
                returned_quantity: returnedQuantity,
                lot_number: lotNumber,
                batch_no: lotNumber,
                mm_lot_id: requestedMmLotId,
                inventory_lot_id: inventoryLotId || null,
                yield_ledger_id: yieldLedgerId,
                movement_id: finishedMovementId,
                product_ledger_id: finishedLedgerId,
                genealogy_ids: persistedGenealogy,
                manufacturing_date: manufacturingDate,
                expiration_date: expirationDate,
                unit_cost: Number(input.unitCost ?? 0)
            }
        };
    } catch (error) {
        if (leftoverExecution) {
            try {
                await leftoverExecution.compensate();
            } catch (compensateError) {
                console.error("Unable to compensate the leftover material return:", compensateError);
            }
        }
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
                    "Halt finalization failed and automatic rollback was incomplete. Reconciliation is required.",
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
        if (error instanceof MmLotError) {
            const lotError = new YieldCompletionError(error.status, error.code, error.message);
            lotError.operationKey = operationKey;
            throw lotError;
        }
        if (error instanceof JobOrderCancellationError) {
            const returnError = new YieldCompletionError(error.status, error.code, error.message);
            returnError.operationKey = operationKey;
            throw returnError;
        }
        const finalizeError = new YieldCompletionError(502, "HALT_FINALIZE_FAILED", "Halted Job Order finalization could not be completed.");
        finalizeError.operationKey = operationKey;
        throw finalizeError;
    }
}
