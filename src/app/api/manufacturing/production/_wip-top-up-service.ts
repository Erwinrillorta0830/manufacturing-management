/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers, getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";
import {
    isCancelledJobOrderStatus,
    JOB_ORDER_STATUS,
    normalizeJobOrderStatus
} from "@/modules/manufacturing-management/job-order-status";
import { isValidQaStatus, isExpired, normalizeBatchNo, normalizeDirectusStagingMovement } from "@/app/api/manufacturing/material-staging/_stock";
import { fetchMmInventoryMovements, type NormalizedMmInventoryMovement } from "@/app/api/manufacturing/services/mm-inventory-movements.service";
import { getAvailableInventoryLots } from "@/app/api/manufacturing/planning-engineering/helpers/inventory-helper";
import { committedGoodOutputOrAggregate, goodOutputAggregateFallback, hasReachedProductionTarget } from "@/modules/manufacturing-management/production-workflow/utils/production-output";

const EPSILON = 0.000001;
const SOURCE_BIN = "MAIN-STORE";
const TOP_UP_MARKER = "[MM-WIP-TOP-UP]";
const STAGING_MARKER = "[MM-MATERIAL-STAGING]";

export class WipTopUpError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 404 | 409 | 422 | 502 = 409,
        readonly code = "WIP_TOP_UP_FAILED",
        readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "WipTopUpError";
    }
}

class DirectusPersistenceError extends Error {
    constructor(message: string, readonly status = 502) {
        super(message);
        this.name = "DirectusPersistenceError";
    }
}

export type WipTopUpSourceType = "RAW_MATERIAL" | "MANUFACTURING";

interface WipTopUpAllocationInput {
    sourceType: WipTopUpSourceType;
    receiptId: number | null;
    mmLotId: number | null;
    inventoryLotId: number | null;
    batchNo: string;
    quantity: number;
}

interface WipTopUpInput {
    jobOrderId: number;
    joMaterialId: number;
    productId: number;
    allocations: WipTopUpAllocationInput[];
    uomId: number | null;
    idempotencyKey: string;
    remarks: string | null;
}

interface ResolvedTopUpLot {
    lotId: number;
    inventoryLotId: number;
    batchNo: string;
    expiryDate: string | null;
    uomId: number;
}

function relationId(value: unknown, key: string): number {
    const raw = value && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
            ?? (value as Record<string, unknown>).id
            ?? (value as Record<string, unknown>).value
        : value;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

type MovementReferenceRow = {
    mm_lot_id?: unknown;
    lot_id?: unknown;
    inventory_lot_id?: unknown;
};

function movementLotReference(row: MovementReferenceRow): number {
    return relationId(row.mm_lot_id, "lot_id") || relationId(row.lot_id, "lot_id") || 0;
}

function movementInventoryLotReference(row: MovementReferenceRow): number {
    return relationId(row.inventory_lot_id, "inventory_lot_id") || relationId(row.inventory_lot_id, "id") || 0;
}

function round6(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 1_000_000) / 1_000_000;
}

function text(value: unknown): string {
    return value === undefined || value === null ? "" : String(value).trim();
}

function isGoodQaStatus(value: unknown): boolean {
    return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") === "GOOD";
}

function isExpiredOrInvalid(value: unknown): boolean {
    const raw = text(value);
    if (!raw) return false;
    const expiry = new Date(raw);
    if (!Number.isFinite(expiry.getTime())) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiry.getTime() < today.getTime();
}

function requiredPositiveInteger(value: unknown, label: string): number {
    const id = relationId(value, "id");
    if (!id) throw new WipTopUpError(`${label} must be a positive integer.`, 400, "INVALID_FIELD", { field: label });
    return id;
}

function normalizeInput(body: any): WipTopUpInput {
    const idempotencyKey = text(body?.idempotencyKey);
    if (!idempotencyKey || idempotencyKey.length > 128) {
        throw new WipTopUpError("An idempotency key of at most 128 characters is required.", 400, "IDEMPOTENCY_KEY_REQUIRED");
    }

    const rawAllocations = Array.isArray(body?.allocations)
        ? body.allocations
        : [body];
    if (rawAllocations.length === 0 || rawAllocations.length > 50) {
        throw new WipTopUpError("Provide between 1 and 50 lot allocations.", 400, "INVALID_ALLOCATIONS");
    }

    const allocations: WipTopUpAllocationInput[] = rawAllocations.map((raw: any, index: number): WipTopUpAllocationInput => {
        const quantity = Number(raw?.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new WipTopUpError(`Allocation ${index + 1} must have a quantity greater than zero.`, 400, "INVALID_QUANTITY", { allocationIndex: index });
        }
        const sourceType: WipTopUpSourceType = raw?.sourceType === "MANUFACTURING" ? "MANUFACTURING" : "RAW_MATERIAL";
        const receiptId = raw?.receiptId === undefined || raw?.receiptId === null || raw?.receiptId === ""
            ? null
            : requiredPositiveInteger(raw.receiptId, "Receiving lot");
        const mmLotId = raw?.mmLotId === undefined || raw?.mmLotId === null || raw?.mmLotId === ""
            ? null
            : requiredPositiveInteger(raw.mmLotId, "Manufacturing lot");
        const inventoryLotId = raw?.inventoryLotId === undefined || raw?.inventoryLotId === null || raw?.inventoryLotId === ""
            ? null
            : requiredPositiveInteger(raw.inventoryLotId, "Inventory lot");

        if (sourceType === "RAW_MATERIAL" && !receiptId && !inventoryLotId && !mmLotId) {
            throw new WipTopUpError("A receiving or canonical inventory lot is required to add purchased raw materials.", 400, "RECEIVING_LOT_REQUIRED", { allocationIndex: index });
        }
        if (sourceType === "MANUFACTURING" && !mmLotId) {
            throw new WipTopUpError("A manufacturing lot is required to add manufactured components.", 400, "MANUFACTURING_LOT_REQUIRED", { allocationIndex: index });
        }

        return {
            sourceType,
            receiptId,
            mmLotId,
            inventoryLotId,
            batchNo: text(raw?.batchNo),
            quantity: round6(quantity)
        };
    });
    const allocationKeys = allocations.map((allocation) => [
        allocation.sourceType,
        allocation.inventoryLotId || "",
        allocation.mmLotId || "",
        allocation.receiptId || "",
        normalizeBatchNo(allocation.batchNo)
    ].join(":"));
    if (new Set(allocationKeys).size !== allocationKeys.length) {
        throw new WipTopUpError("Each canonical lot may appear only once in a top-up request.", 400, "DUPLICATE_ALLOCATION");
    }

    const uomId = body?.uomId === undefined || body?.uomId === null || body?.uomId === ""
        ? null
        : requiredPositiveInteger(body.uomId, "UOM");

    return {
        jobOrderId: requiredPositiveInteger(body?.jobOrderId, "Job Order"),
        joMaterialId: requiredPositiveInteger(body?.joMaterialId, "Job Order material"),
        productId: requiredPositiveInteger(body?.productId, "Product"),
        allocations,
        uomId,
        idempotencyKey,
        remarks: text(body?.remarks) || null
    };
}

async function directusRequest<T = any>(pathname: string, label: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${pathname}`, {
            ...init,
            headers: { ...headers, ...(init.headers || {}) },
            cache: "no-store"
        });
    } catch (error) {
        throw new DirectusPersistenceError(`${label} could not reach Manufacturing Directus: ${(error as Error).message}`);
    }

    const responseText = await response.text();
    let payload: any = null;
    try { payload = responseText ? JSON.parse(responseText) : null; } catch { payload = null; }
    if (!response.ok) {
        throw new DirectusPersistenceError(
            `${label} failed with HTTP ${response.status}: ${responseText || "No response body"}`,
            response.status >= 400 && response.status < 500 ? response.status : 502
        );
    }
    return (payload?.data ?? payload) as T;
}

async function directusRows<T = any>(pathname: string, label: string): Promise<T[]> {
    const rows = await directusRequest<unknown>(pathname, label);
    if (!Array.isArray(rows)) throw new DirectusPersistenceError(`${label} returned an invalid collection response.`);
    return rows as T[];
}

async function optionalDirectusRequest<T = any>(pathname: string, label: string): Promise<T | null> {
    try {
        return await directusRequest<T>(pathname, label);
    } catch (error) {
        if (error instanceof DirectusPersistenceError && error.status === 404) return null;
        throw error;
    }
}

async function getActorId(): Promise<number> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (token) {
            const parts = token.split(".");
            if (parts.length >= 2) {
                let encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                while (encoded.length % 4) encoded += "=";
                const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
                const actorId = relationId(payload?.id ?? payload?.user_id ?? payload?.sub, "id");
                if (actorId) return actorId;
            }
        }
    } catch (error) {
        console.warn("Unable to resolve the authenticated production operator:", error);
    }
    return 24;
}

async function resolveTransactionTypeId(typeName: string): Promise<number> {
    const rows = await directusRows<any>(
        `/items/inventory_transaction_types?fields=transaction_type_id,type_name,origin_table&limit=-1`,
        "Load inventory transaction types"
    );
    const wanted = typeName.trim().toUpperCase();
    const found = rows.find(row => String(row.type_name ?? row.name ?? row.code ?? "").trim().toUpperCase() === wanted);
    const foundId = relationId(found?.transaction_type_id ?? found?.id, "transaction_type_id");
    if (foundId) return foundId;

    const created = await directusRequest<any>(
        `/items/inventory_transaction_types`,
        `Create ${typeName} transaction type`,
        { method: "POST", body: JSON.stringify({ type_name: typeName, direction: "OUT", origin_table: "inventory_movements" }) }
    );
    const createdId = relationId(created?.transaction_type_id ?? created?.id, "transaction_type_id");
    if (!createdId) throw new DirectusPersistenceError(`The ${typeName} transaction type could not be resolved.`);
    return createdId;
}

interface InventoryLotRow extends Record<string, unknown> {
    inventory_lot_id?: unknown;
    lot_id?: unknown;
    product_id?: unknown;
    branch_id?: unknown;
    qa_status?: unknown;
    expiry_date?: unknown;
    manufacturing_date?: unknown;
    batch_no?: unknown;
    status?: unknown;
}

async function findInventoryLot(
    branchId: number,
    productId: number,
    lotId: number | null,
    batchNo: string,
    inventoryLotId: number | null = null,
    requireActive = false
): Promise<InventoryLotRow | null> {
    const filters = [
        `filter[product_id][_eq]=${productId}`,
        `filter[branch_id][_eq]=${branchId}`
    ];
    if (inventoryLotId) filters.push(`filter[inventory_lot_id][_eq]=${inventoryLotId}`);
    if (requireActive) filters.push("filter[status][_eq]=ACTIVE");
    if (lotId) filters.push(`filter[lot_id][_eq]=${lotId}`);
    if (batchNo) filters.push(`filter[batch_no][_eq]=${encodeURIComponent(batchNo)}`);
    const rows = await directusRows<InventoryLotRow>(
        `/items/mm_inventory_lots?${filters.join("&")}&fields=inventory_lot_id,lot_id,product_id,branch_id,batch_no,qa_status,expiry_date,manufacturing_date,status&limit=1`,
        "Load inventory lot for WIP top-up"
    );
    const row = rows[0] || null;
    if (!row) return null;
    const status = String(row.status ?? "").trim().toUpperCase();
    if (requireActive && status !== "ACTIVE") return null;
    if (status && ["INACTIVE", "CANCELLED", "DELETED", "REVERTED"].includes(status)) return null;
    return row;
}

async function resolveProductUomId(productId: number): Promise<number> {
    const product = await optionalDirectusRequest<any>(
        `/items/products/${productId}?fields=unit_of_measurement.unit_id,unit_of_measurement.unit_shortcut`,
        `Load product ${productId} for WIP top-up`
    );
    return relationId(product?.unit_of_measurement, "unit_id");
}

async function resolveTopUpLot(input: WipTopUpAllocationInput, productId: number, branchId: number): Promise<ResolvedTopUpLot> {
    if (input.sourceType === "RAW_MATERIAL") {
        let receipt: any = null;
        if (input.receiptId) {
            receipt = await directusRequest<any>(
                `/items/purchase_order_receiving/${input.receiptId}?fields=purchase_order_product_id,product_id,branch_id,batch_no,lot_no,lot_id,mm_lot_id,qa_status,is_reverted,received_quantity,expiry_date`,
                `Load receiving lot ${input.receiptId}`
            );
            const receiptProductId = relationId(receipt?.product_id, "product_id");
            const receiptBranchId = relationId(receipt?.branch_id, "branch_id") || relationId(receipt?.branch_id, "id");
            if (receiptProductId && receiptProductId !== productId) {
                throw new WipTopUpError("The selected receiving lot does not match this Job Order material.", 409, "RECEIVING_LOT_PRODUCT_MISMATCH");
            }
            if (receiptBranchId && receiptBranchId !== branchId) {
                throw new WipTopUpError("The selected receiving lot belongs to a different branch.", 409, "RECEIVING_LOT_BRANCH_MISMATCH");
            }
            if (receipt?.is_reverted === true || Number(receipt?.is_reverted) === 1) {
                throw new WipTopUpError("The selected receiving lot has been reverted and cannot be issued.", 409, "RECEIVING_LOT_REVERTED");
            }
        }

        const receiptBatchNo = text(receipt?.batch_no) || text(receipt?.lot_no);
        const batchNo = receiptBatchNo || input.batchNo;
        if (!batchNo) {
            throw new WipTopUpError("The selected receiving lot has no batch number.", 409, "LOT_BATCH_REQUIRED");
        }
        if (isExpiredOrInvalid(receipt?.expiry_date)) {
            throw new WipTopUpError("The selected receiving lot is already expired.", 409, "LOT_EXPIRED");
        }
        const lotId = relationId(receipt?.mm_lot_id, "lot_id")
            || relationId(receipt?.lot_id, "lot_id")
            || input.mmLotId
            || null;
        const inventoryLot = await findInventoryLot(branchId, productId, lotId, batchNo, input.inventoryLotId, true);
        if (!inventoryLot) {
            throw new WipTopUpError("This lot has no canonical inventory lot on the receiving branch. Reconcile it in Material Staging before adding materials.", 409, "INVENTORY_LOT_REQUIRED");
        }
        const resolvedLotId = relationId(inventoryLot.lot_id, "lot_id") || lotId;
        if (!resolvedLotId) {
            throw new WipTopUpError("The selected inventory lot has no manufacturing lot reference.", 409, "LOT_REFERENCE_REQUIRED");
        }
        const storageLot = await optionalDirectusRequest<any>(
            `/items/mm_lots/${resolvedLotId}?fields=lot_id,branch_id,status`,
            `Load storage lot ${resolvedLotId} for WIP top-up`
        );
        const storageLotStatus = text(storageLot?.status).toUpperCase();
        const storageLotBranchId = relationId(storageLot?.branch_id, "branch_id") || relationId(storageLot?.branch_id, "id");
        if (!storageLot || !["ACTIVE", "EMPTY", "VACANT"].includes(storageLotStatus)
            || storageLotBranchId !== branchId) {
            throw new WipTopUpError("The selected storage lot is not active on this branch.", 409, "LOT_INACTIVE");
        }
        if (!isGoodQaStatus(inventoryLot.qa_status ?? receipt?.qa_status)) {
            throw new WipTopUpError("Raw-material lots must have GOOD QA status before they can be added to WIP.", 409, "LOT_QA_STATUS_BLOCKED");
        }
        if (isExpiredOrInvalid(inventoryLot.expiry_date ?? receipt?.expiry_date)) {
            throw new WipTopUpError("The inventory lot is already expired.", 409, "LOT_EXPIRED");
        }
        const inventoryLotId = relationId(inventoryLot.inventory_lot_id, "inventory_lot_id");
        if (!inventoryLotId) {
            throw new WipTopUpError("The selected lot has no canonical inventory lot identifier.", 409, "INVENTORY_LOT_REQUIRED");
        }
        return {
            lotId: resolvedLotId,
            inventoryLotId,
            batchNo: text(inventoryLot.batch_no) || batchNo,
            expiryDate: text(inventoryLot.expiry_date) || text(receipt?.expiry_date) || null,
            uomId: await resolveProductUomId(productId)
        };
    }

    // Manufactured component (sub-assembly) top-up from a manufacturing lot.
    const lotId = input.mmLotId as number;
    const mmLot = await optionalDirectusRequest<any>(
        `/items/mm_lots/${lotId}?fields=lot_id,lot_name,status,unit_id`,
        `Load manufacturing lot ${lotId}`
    );
    if (mmLot && !isValidQaStatus(mmLot.status)) {
        throw new WipTopUpError("The selected manufacturing lot is not available for issuance.", 409, "LOT_QA_STATUS_BLOCKED");
    }
    const batchNo = input.batchNo || text(mmLot?.lot_name);
    if (!batchNo) {
        throw new WipTopUpError("The selected manufacturing lot has no batch/lot number.", 409, "LOT_BATCH_REQUIRED");
    }
    const inventoryLot = await findInventoryLot(branchId, productId, lotId, batchNo, input.inventoryLotId);
    if (!inventoryLot) {
        throw new WipTopUpError("This manufacturing lot has no canonical inventory lot. Add it from Material Staging instead.", 409, "INVENTORY_LOT_REQUIRED");
    }
    if (!isValidQaStatus(inventoryLot.qa_status)) {
        throw new WipTopUpError("The inventory lot is not available for issuance in its QA status.", 409, "LOT_QA_STATUS_BLOCKED");
    }
    if (isExpired(inventoryLot.expiry_date)) {
        throw new WipTopUpError("The inventory lot is already expired.", 409, "LOT_EXPIRED");
    }
    const inventoryLotId = relationId(inventoryLot.inventory_lot_id, "inventory_lot_id");
    if (!inventoryLotId) {
        throw new WipTopUpError("The selected lot has no canonical inventory lot identifier.", 409, "INVENTORY_LOT_REQUIRED");
    }
    return {
        lotId,
        inventoryLotId,
        batchNo: text(inventoryLot.batch_no) || batchNo,
        expiryDate: text(inventoryLot.expiry_date) || null,
        uomId: await resolveProductUomId(productId)
    };
}

async function computeLotBalance(
    branchId: number,
    productId: number,
    lotId: number,
    batchNo: string,
    inventoryLotId: number
): Promise<number> {
    const [springMovements, directusMovementRows] = await Promise.all([
        fetchMmInventoryMovements({ branch: branchId, product: productId, batchNo }),
        directusRows<Record<string, unknown>>(
            `/items/inventory_movements?filter[product_id][_eq]=${productId}&filter[branch_id][_eq]=${branchId}&filter[batch_no][_eq]=${encodeURIComponent(batchNo)}&fields=*&limit=-1`,
            "Load inventory movements for WIP top-up"
        )
    ]);
    const normalizedDirectusMovements = directusMovementRows.map(normalizeDirectusStagingMovement);
    // Keep the Spring ledger authoritative when it has data, matching the
    // on-hand source used by Lot Management. Directus is only a fallback.
    const movements: Array<NormalizedMmInventoryMovement | ReturnType<typeof normalizeDirectusStagingMovement>> =
        springMovements.length > 0 ? springMovements : normalizedDirectusMovements;
    const balance = movements
        .filter(movement => {
            const movementInventoryLotId = movementInventoryLotReference(movement);
            return movementInventoryLotId > 0
                ? movementInventoryLotId === inventoryLotId
                : movementLotReference(movement) === lotId;
        })
        .reduce((total, movement) => total + Number(movement.quantity || 0), 0);
    return round6(balance);
}

async function findExistingReservation(input: Pick<WipTopUpInput, "joMaterialId">, lot: ResolvedTopUpLot): Promise<any | null> {
    const rows = await directusRows<any>(
        `/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_eq]=${input.joMaterialId}&fields=jo_materials_reservation_id,jo_material_id,product_id,branch_id,mm_lot_id,inventory_lot_id,batch_no,reserved_quantity,staged_quantity,issued_to_wip_quantity,actual_used_quantity,returned_quantity,remaining_wip_quantity,reservation_status,wip_started_at,wip_started_by,staging_bin,uom_id,expiry_date,source_event_key&limit=-1`,
        "Load JO material reservations for WIP top-up"
    );
    return rows.find(row =>
        movementLotReference(row) === lot.lotId
        && normalizeBatchNo(row.batch_no) === normalizeBatchNo(lot.batchNo)
        && (!lot.inventoryLotId
            || movementInventoryLotReference(row) === lot.inventoryLotId
            || movementInventoryLotReference(row) === 0)
    ) || null;
}

export async function recordWipTopUp(request: Request): Promise<NextResponse> {
    const body = await request.json().catch(() => ({}));
    const input = normalizeInput(body);
    const actorId = await getActorId();
    const now = await getISOStringInConfiguredTimezone();
    const baseEventKey = `wip-top-up:${input.jobOrderId}:${input.idempotencyKey}`;
    const sourceEventKeys = input.allocations.map((_, index) => input.allocations.length === 1
        ? baseEventKey
        : `${baseEventKey}:allocation:${index + 1}`);

    const existingMovements = await directusRows<any>(
        `/items/inventory_movements?filter[source_event_key][_in]=${encodeURIComponent(sourceEventKeys.join(","))}&fields=movement_id,quantity,source_event_key&limit=51`,
        "Check existing WIP top-up movements"
    );
    const existingEventKeys = new Set(existingMovements.map((movement) => text(movement.source_event_key)));
    if (sourceEventKeys.every((key) => existingEventKeys.has(key))) {
        return NextResponse.json({
            success: true,
            idempotent: true,
            message: "This WIP top-up was already recorded.",
            jobOrderId: input.jobOrderId,
            joMaterialId: input.joMaterialId,
            productId: input.productId,
            allocations: []
        });
    }
    if (existingEventKeys.size > 0) {
        throw new WipTopUpError(
            "This top-up request has only some of its lot movements recorded. Refresh the Job Order material list before retrying.",
            409,
            "INCOMPLETE_TOP_UP_REPLAY",
            { completedAllocations: existingEventKeys.size, requestedAllocations: sourceEventKeys.length }
        );
    }

    const jobOrder = await directusRequest<any>(
        `/items/manufacturing_job_orders/${input.jobOrderId}?fields=job_order_id,job_order_no,status,branch_id,product_id,primary_work_center_id,target_quantity,quantity,actual_quantity_produced,completed_quantity`,
        `Load Job Order ${input.jobOrderId}`
    );
    const status = normalizeJobOrderStatus(jobOrder?.status);
    if (!status || isCancelledJobOrderStatus(status)) {
        throw new WipTopUpError("The Job Order cannot accept additional raw materials in its current status.", 409, "JOB_ORDER_NOT_TOP_UP_ELIGIBLE");
    }
    if (status !== JOB_ORDER_STATUS.IN_PRODUCTION) {
        throw new WipTopUpError("Raw materials can only be added while the Job Order is In Production.", 409, "JOB_ORDER_NOT_IN_PRODUCTION");
    }
    const yieldRows = await directusRows<any>(
        `/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${input.jobOrderId}&fields=yield_quantity,commit_status&limit=-1`,
        `Check production target for Job Order ${input.jobOrderId}`
    );
    const targetQuantity = Number(jobOrder?.target_quantity ?? jobOrder?.quantity ?? 0);
    if (hasReachedProductionTarget(targetQuantity, committedGoodOutputOrAggregate(
        yieldRows,
        goodOutputAggregateFallback(jobOrder.actual_quantity_produced, jobOrder.completed_quantity)
    ))) {
        throw new WipTopUpError(
            "The Job Order good-output target has been reached. Additional materials cannot be added to production.",
            409,
            "PRODUCTION_TARGET_REACHED"
        );
    }

    const branchId = relationId(jobOrder?.branch_id, "branch_id") || relationId(jobOrder?.branch_id, "id");
    if (!branchId) throw new WipTopUpError("The Job Order has no receiving branch.", 409, "JOB_ORDER_BRANCH_MISSING");

    const material = await directusRequest<any>(
        `/items/manufacturing_job_order_materials/${input.joMaterialId}?fields=jo_material_id,job_order_id,product_id,uom_id,allocated_quantity,reserved_quantity`,
        `Load JO material ${input.joMaterialId}`
    );
    if (relationId(material?.job_order_id, "job_order_id") !== input.jobOrderId) {
        throw new WipTopUpError("The selected material does not belong to this Job Order.", 409, "MATERIAL_NOT_FOUND");
    }
    const materialProductId = relationId(material?.product_id, "product_id");
    if (materialProductId && materialProductId !== input.productId) {
        throw new WipTopUpError("The selected material does not match the requested product.", 409, "MATERIAL_PRODUCT_MISMATCH");
    }

    const materialUomId = relationId(material?.uom_id, "unit_id") || relationId(material?.uom_id, "id");
    const resolvedAllocations = await Promise.all(input.allocations.map(async (allocation, index) => {
        const lot = await resolveTopUpLot(allocation, input.productId, branchId);
        if (!lot.inventoryLotId) {
            throw new WipTopUpError("The selected lot has no canonical inventory lot identifier.", 409, "INVENTORY_LOT_REQUIRED", { allocationIndex: index });
        }
        if (materialUomId && lot.uomId && materialUomId !== lot.uomId) {
            throw new WipTopUpError("The selected lot UOM does not match the Job Order material UOM.", 409, "MATERIAL_UOM_MISMATCH", { allocationIndex: index });
        }
        if (input.uomId && lot.uomId && input.uomId !== lot.uomId) {
            throw new WipTopUpError("The submitted UOM does not match the selected lot.", 409, "LOT_UOM_MISMATCH", { allocationIndex: index });
        }
        return { allocation, lot, sourceEventKey: sourceEventKeys[index] };
    }));

    const rawMaterialLots = input.allocations.some((allocation) => allocation.sourceType === "RAW_MATERIAL")
        ? await getAvailableInventoryLots(input.productId, branchId, { requireGoodQa: true })
        : [];
    const plans = await Promise.all(resolvedAllocations.map(async ({ allocation, lot, sourceEventKey }, index) => {
        const availableLot = allocation.sourceType === "RAW_MATERIAL"
            ? rawMaterialLots.find((candidate) => candidate.inventoryLotId === lot.inventoryLotId
                && candidate.mmLotId === lot.lotId
                && normalizeBatchNo(candidate.batchNo) === normalizeBatchNo(lot.batchNo))
            : null;
        const balance = allocation.sourceType === "RAW_MATERIAL"
            ? Number(availableLot?.available || 0)
            : await computeLotBalance(branchId, input.productId, lot.lotId, lot.batchNo, lot.inventoryLotId);
        if (!availableLot && allocation.sourceType === "RAW_MATERIAL") {
            throw new WipTopUpError("The selected raw-material lot is no longer eligible or has no available stock.", 409, "LOT_NO_LONGER_AVAILABLE", { allocationIndex: index });
        }
        if (allocation.quantity > balance + EPSILON) {
            throw new WipTopUpError(
                `Only ${balance.toLocaleString()} units of lot ${lot.batchNo} are available; ${allocation.quantity.toLocaleString()} were requested.`,
                409,
                "INSUFFICIENT_STOCK",
                { allocationIndex: index, available: balance, requested: allocation.quantity }
            );
        }
        return {
            allocation,
            lot,
            sourceEventKey,
            existingReservation: await findExistingReservation(input, lot)
        };
    }));

    const materialReservedBefore = Number(material?.reserved_quantity || 0);
    const totalAdded = round6(input.allocations.reduce((total, allocation) => total + allocation.quantity, 0));
    const reservationChanges: Array<{ reservationId: number; created: boolean; snapshot?: Record<string, unknown> }> = [];
    const createdMovementIds: number[] = [];
    const responseAllocations: Array<Record<string, unknown>> = [];
    let materialReservedUpdateAttempted = false;
    const workCenterId = relationId(jobOrder?.primary_work_center_id, "work_center_id");
    const floorBin = workCenterId > 0 ? `FLOOR-STAGING-${workCenterId}` : "FLOOR-STAGING";

    try {
        const transactionTypeId = await resolveTransactionTypeId("MATERIAL_STAGING_ISSUE");

        for (const plan of plans) {
            const { allocation, lot, sourceEventKey, existingReservation } = plan;
            const currentStaged = Number(existingReservation?.staged_quantity || 0);
            const currentIssued = Number(existingReservation?.issued_to_wip_quantity || 0);
            const currentUsed = Number(existingReservation?.actual_used_quantity || 0);
            const currentReturned = Number(existingReservation?.returned_quantity || 0);
            const currentReserved = Number(existingReservation?.reserved_quantity || 0);
            const issuedBasis = currentIssued > EPSILON ? currentIssued : currentStaged;
            const currentRemaining = Number.isFinite(Number(existingReservation?.remaining_wip_quantity))
                ? Math.max(0, Number(existingReservation.remaining_wip_quantity))
                : Math.max(0, issuedBasis - currentUsed - currentReturned);
            const reservationSnapshot = existingReservation ? {
                reserved_quantity: existingReservation.reserved_quantity,
                staged_quantity: existingReservation.staged_quantity,
                issued_to_wip_quantity: existingReservation.issued_to_wip_quantity,
                remaining_wip_quantity: existingReservation.remaining_wip_quantity,
                reservation_status: existingReservation.reservation_status,
                wip_started_at: existingReservation.wip_started_at ?? null,
                wip_started_by: existingReservation.wip_started_by ?? null,
                source_event_key: existingReservation.source_event_key ?? null
            } : undefined;
            let reservationId = relationId(existingReservation?.jo_materials_reservation_id ?? existingReservation?.id, "jo_materials_reservation_id");
            const reservationBody: Record<string, unknown> = {
                product_id: input.productId,
                branch_id: branchId,
                mm_lot_id: lot.lotId,
                inventory_lot_id: lot.inventoryLotId,
                batch_no: lot.batchNo,
                jo_material_id: input.joMaterialId,
                reserved_quantity: round6(currentReserved + allocation.quantity),
                staged_quantity: round6(currentStaged + allocation.quantity),
                issued_to_wip_quantity: round6(issuedBasis + allocation.quantity),
                remaining_wip_quantity: round6(currentRemaining + allocation.quantity),
                reservation_status: "WIP",
                staging_bin: floorBin,
                uom_id: lot.uomId || input.uomId || null,
                expiry_date: lot.expiryDate,
                source_event_key: sourceEventKey,
                created_by: actorId
            };
            if (!existingReservation?.wip_started_at) {
                reservationBody.wip_started_at = now;
                reservationBody.wip_started_by = actorId;
            }

            if (existingReservation) {
                if (!reservationId) throw new DirectusPersistenceError("The existing WIP reservation has no identifier.");
                reservationChanges.push({ reservationId, created: false, snapshot: reservationSnapshot });
                await directusRequest(
                    `/items/manufacturing_job_order_materials_reservations/${reservationId}`,
                    `Update WIP reservation ${reservationId}`,
                    { method: "PATCH", body: JSON.stringify(reservationBody) }
                );
            } else {
                const created = await directusRequest<any>(
                    `/items/manufacturing_job_order_materials_reservations`,
                    "Create WIP reservation",
                    { method: "POST", body: JSON.stringify(reservationBody) }
                );
                reservationId = relationId(created?.jo_materials_reservation_id ?? created?.id, "jo_materials_reservation_id");
                if (!reservationId) throw new DirectusPersistenceError("The WIP reservation did not return an identifier.");
                reservationChanges.push({ reservationId, created: true });
            }

            const remarks = `${STAGING_MARKER} ${TOP_UP_MARKER} operation_id=${sourceEventKey};jo_material_id=${input.joMaterialId};target_bin=${floorBin};work_center_id=${workCenterId};source_bin=${SOURCE_BIN}; JO #${jobOrder?.job_order_no || input.jobOrderId}. ${input.remarks || "WIP top-up for production session."}`;
            const movement = await directusRequest<any>(
                "/items/inventory_movements",
                `Create WIP top-up movement for ${lot.batchNo}`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        product_id: input.productId,
                        mm_lot_id: lot.lotId,
                        inventory_lot_id: lot.inventoryLotId,
                        branch_id: branchId,
                        transaction_type_id: transactionTypeId,
                        source_document_id: input.jobOrderId,
                        source_document_no: jobOrder?.job_order_no || `JO-${input.jobOrderId}`,
                        batch_no: lot.batchNo,
                        quantity: -allocation.quantity,
                        created_by: actorId,
                        source_event_key: sourceEventKey,
                        remarks
                    })
                }
            );
            const movementId = relationId(movement?.movement_id ?? movement?.id, "movement_id");
            if (!movementId) throw new DirectusPersistenceError("The WIP top-up movement did not return an identifier.");
            createdMovementIds.push(movementId);
            responseAllocations.push({
                reservationId,
                mmLotId: lot.lotId,
                inventoryLotId: lot.inventoryLotId,
                batchNo: lot.batchNo,
                uomId: lot.uomId || input.uomId,
                addedQuantity: allocation.quantity,
                reservedQuantity: round6(currentReserved + allocation.quantity),
                stagedQuantity: round6(currentStaged + allocation.quantity),
                issuedToWipQuantity: round6(issuedBasis + allocation.quantity),
                remainingWipQuantity: round6(currentRemaining + allocation.quantity)
            });
        }

        materialReservedUpdateAttempted = true;
        await directusRequest(
            `/items/manufacturing_job_order_materials/${input.joMaterialId}`,
            "Update JO material reserved quantity",
            { method: "PATCH", body: JSON.stringify({ reserved_quantity: round6(materialReservedBefore + totalAdded) }) }
        );

        return NextResponse.json({
            success: true,
            idempotent: false,
            message: `Added ${totalAdded.toLocaleString()} unit(s) across ${plans.length} lot(s) to the WIP reservation for this Job Order.`,
            jobOrderId: input.jobOrderId,
            joMaterialId: input.joMaterialId,
            productId: input.productId,
            allocations: responseAllocations,
            ...(responseAllocations.length === 1 ? { reservation: responseAllocations[0] } : {})
        });
    } catch (error) {
        for (const movementId of createdMovementIds.reverse()) {
            await directusRequest(
                `/items/inventory_movements/${movementId}`,
                `Rollback WIP top-up movement ${movementId}`,
                { method: "DELETE" }
            ).catch(() => null);
        }
        for (const change of reservationChanges.reverse()) {
            if (change.created) {
                await directusRequest(
                    `/items/manufacturing_job_order_materials_reservations/${change.reservationId}`,
                    `Rollback WIP reservation ${change.reservationId}`,
                    { method: "DELETE" }
                ).catch(() => null);
            } else if (change.snapshot) {
                await directusRequest(
                    `/items/manufacturing_job_order_materials_reservations/${change.reservationId}`,
                    `Restore WIP reservation ${change.reservationId}`,
                    { method: "PATCH", body: JSON.stringify(change.snapshot) }
                ).catch(() => null);
            }
        }
        if (materialReservedUpdateAttempted) {
            await directusRequest(
                `/items/manufacturing_job_order_materials/${input.joMaterialId}`,
                "Restore JO material reserved quantity",
                { method: "PATCH", body: JSON.stringify({ reserved_quantity: materialReservedBefore }) }
            ).catch(() => null);
        }
        throw error;
    }
}
