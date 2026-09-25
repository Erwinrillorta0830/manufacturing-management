import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    isCancellableJobOrderStatus,
    isCancelledJobOrderStatus,
    isJobOrderStatus,
    isTerminalJobOrderStatus,
    normalizeJobOrderStatus,
    JOB_ORDER_STATUS
} from "@/modules/manufacturing-management/job-order-status";
import { jobOrderCancellationImageUrl } from "./job-order-cancellation/_image";
import {
    buildMaterialReleaseBatch,
    buildReservationReleaseBatch,
    chunkBatch,
    DIRECTUS_BATCH_SIZE,
    matchesExistingReturnMovement
} from "./_cancellation-batch";

const QUANTITY_EPSILON = 0.000001;
const STAGING_MARKER = "[MM-MATERIAL-STAGING]";
const RETURN_MARKER = "[MM-MATERIAL-STAGING-RETURN]";
const MAIN_STORE_BIN = "MAIN-STORE";

type RawRecord = Record<string, unknown>;

export class JobOrderCancellationError extends Error {
    constructor(
        message: string,
        readonly status = 409,
        readonly code = "JOB_ORDER_CANCELLATION_BLOCKED",
        readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "JobOrderCancellationError";
    }
}

export interface MaterialReturnDestination {
    mmLotId: number;
    inventoryLotId: number;
    batchNo: string;
    action: "REUSE" | "CREATE";
}

export interface JobOrderMaterialReturnLine {
    joMaterialId: number;
    productId: number;
    productName: string;
    uomId: number;
    uomShortcut: string;
    branchId: number;
    mmLotId: number;
    inventoryLotId: number;
    batchNo: string;
    sourceBin: string;
    targetBin: string;
    stagedQuantity: number;
    consumedQuantity: number;
    returnableQuantity: number;
    reservationIds: number[];
    releaseOnly: boolean;
    /** Resolved return destination; null when QA must pick a lot manually. */
    destination?: MaterialReturnDestination | null;
    /** Destination actually written during execution (after batch creation). */
    resolvedDestination?: MaterialReturnDestination | null;
    /** True when the source lot is retired/missing and no destination was supplied. */
    requiresLotSelection?: boolean;
}

export interface JobOrderCancellationPreview {
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    productName: string;
    branchId: number;
    status: string;
    cancellationImageId: string | null;
    cancellationImageUrl: string | null;
    cancellable: boolean;
    canReturnMaterials: boolean;
    blockedReason: string | null;
    lines: JobOrderMaterialReturnLine[];
    totals: {
        stagedQuantity: number;
        consumedQuantity: number;
        returnableQuantity: number;
    };
}

export interface JobOrderCancellationResponse {
    jobOrderId: number;
    jobOrderNo: string;
    status: string;
    cancellationImageId: string | null;
    cancellationImageUrl: string | null;
    lines: JobOrderMaterialReturnLine[];
    returnedQuantity: number;
    releasedReservationCount: number;
    movementCount: number;
    alreadyCancelled: boolean;
}

export interface JobOrderCancellationExecution {
    response: JobOrderCancellationResponse;
    compensate: () => Promise<void>;
}

export interface ResolvedJobOrder {
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    branchId: number;
    status: string;
    primaryWorkCenterId: number;
    cancelledAt: string | null;
    cancelledBy: number | null;
    cancellationReason: string | null;
    cancellationImageId: string | null;
}

interface StagedEntry {
    key: string;
    joMaterialId: number;
    productId: number;
    branchId: number;
    mmLotId: number;
    inventoryLotId: number;
    batchNo: string;
    stagedQuantity: number;
    sourceBin: string;
    reservationIds: number[];
}

interface ReservationAggregate {
    ids: number[];
    reserved: number;
    used: number;
}

interface ReleaseTarget {
    id: number;
    reservedQuantity: number;
    stagedQuantity: number;
    actualUsedQuantity: number;
    reservationStatus: string | null;
}

interface ReservationSnapshot {
    id: number;
    payload: Record<string, unknown>;
}

export interface ComputedCancellation {
    lines: JobOrderMaterialReturnLine[];
    totals: {
        stagedQuantity: number;
        consumedQuantity: number;
        returnableQuantity: number;
    };
    reconciliationError: string | null;
    reservationReleaseTargets: ReleaseTarget[];
    materialReleaseTargets: ReleaseTarget[];
}

function num(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function roundQuantity(value: number): number {
    return Math.round(value * 10000) / 10000;
}

function normalizeBatch(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function directusGet<T>(path: string, label: string): Promise<T> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, { headers, cache: "no-store" });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new JobOrderCancellationError(
            `Failed to ${label}: ${response.status}${text ? ` - ${text}` : ""}`,
            502,
            "DIRECTUS_READ_FAILED"
        );
    }
    const payload = await response.json().catch(() => ({}));
    return (payload?.data ?? payload) as T;
}

async function directusWrite<T>(path: string, method: "POST" | "PATCH", payload: unknown, label: string): Promise<T> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
        method,
        headers,
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new JobOrderCancellationError(
            `Failed to ${label}: ${response.status}${text ? ` - ${text}` : ""}`,
            502,
            "DIRECTUS_WRITE_FAILED"
        );
    }
    const parsed = await response.json().catch(() => ({}));
    return (parsed?.data ?? parsed) as T;
}

async function directusBulkWrite<T>(path: string, method: "POST" | "PATCH", payload: unknown, label: string): Promise<T[]> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
        method,
        headers,
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new JobOrderCancellationError(
            `Failed to ${label}: ${response.status}${text ? ` - ${text}` : ""}`,
            502,
            "DIRECTUS_WRITE_FAILED"
        );
    }
    const parsed = await response.json().catch(() => ({}));
    const data = parsed?.data ?? parsed;
    if (!Array.isArray(data)) {
        throw new JobOrderCancellationError(
            `Failed to ${label}: Directus returned an invalid batch response.`,
            502,
            "DIRECTUS_WRITE_FAILED"
        );
    }
    return data as T[];
}

async function directusBulkDelete(path: string, ids: number[], label: string): Promise<void> {
    if (ids.length === 0) return;
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
        method: "DELETE",
        headers,
        body: JSON.stringify(ids)
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new JobOrderCancellationError(
            `Failed to ${label}: ${response.status}${text ? ` - ${text}` : ""}`,
            502,
            "DIRECTUS_WRITE_FAILED"
        );
    }
}

function canonicalTypeName(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

async function resolveTransactionTypeId(typeName: string, direction: "IN" | "OUT"): Promise<number> {
    const rows = await directusGet<RawRecord[]>(
        "/items/inventory_transaction_types?fields=transaction_type_id,type_name&limit=-1",
        "load inventory transaction types"
    );
    const wanted = canonicalTypeName(typeName);
    const found = rows.find((row) => canonicalTypeName(row.type_name ?? row.name ?? row.code) === wanted);
    const foundId = num(found?.transaction_type_id ?? found?.id);
    if (foundId > 0) return foundId;
    const created = await directusWrite<RawRecord>(
        "/items/inventory_transaction_types",
        "POST",
        { type_name: typeName, direction, origin_table: "inventory_movements" },
        `create ${typeName} transaction type`
    );
    const createdId = num(created.transaction_type_id ?? created.id);
    if (createdId <= 0) {
        throw new JobOrderCancellationError(
            `The ${typeName} transaction type did not return an ID.`,
            503,
            "TRANSACTION_TYPE_UNAVAILABLE"
        );
    }
    return createdId;
}

async function directusDelete(path: string, label: string): Promise<void> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, { method: "DELETE", headers });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new JobOrderCancellationError(
            `Failed to ${label}: ${response.status}${text ? ` - ${text}` : ""}`,
            502,
            "DIRECTUS_WRITE_FAILED"
        );
    }
}

/**
 * Mutation adapter so callers inside a larger transaction (for example yield
 * closing) can route return writes through their own journal/rollback.
 */
export interface MaterialReturnWriter {
    create<T = RawRecord>(collection: string, payload: Record<string, unknown>, label: string): Promise<T>;
    patch<T = RawRecord>(collection: string, id: number, payload: Record<string, unknown>, label: string): Promise<T>;
    delete(collection: string, id: number, label: string): Promise<void>;
    createMany?<T = RawRecord>(collection: string, payloads: Record<string, unknown>[], label: string): Promise<T[]>;
    patchMany?<T = RawRecord>(collection: string, payloads: Record<string, unknown>[], label: string): Promise<T[]>;
    deleteMany?(collection: string, ids: number[], label: string): Promise<void>;
}

const defaultMaterialReturnWriter: MaterialReturnWriter = {
    create: (collection, payload, label) => directusWrite(`/items/${collection}`, "POST", payload, label),
    patch: (collection, id, payload, label) => directusWrite(`/items/${collection}/${id}`, "PATCH", payload, label),
    delete: (collection, id, label) => directusDelete(`/items/${collection}/${id}`, label),
    createMany: (collection, payloads, label) => directusBulkWrite(`/items/${collection}`, "POST", payloads, label),
    patchMany: (collection, payloads, label) => directusBulkWrite(`/items/${collection}`, "PATCH", payloads, label),
    deleteMany: (collection, ids, label) => directusBulkDelete(`/items/${collection}`, ids, label)
};

async function writerCreateMany<T = RawRecord>(
    writer: MaterialReturnWriter,
    collection: string,
    payloads: Record<string, unknown>[],
    label: string
): Promise<T[]> {
    if (payloads.length === 0) return [];
    if (writer.createMany) return writer.createMany<T>(collection, payloads, label);
    return Promise.all(payloads.map(payload => writer.create<T>(collection, payload, label)));
}

async function writerPatchMany<T = RawRecord>(
    writer: MaterialReturnWriter,
    collection: string,
    payloads: Record<string, unknown>[],
    label: string
): Promise<T[]> {
    if (payloads.length === 0) return [];
    if (writer.patchMany) return writer.patchMany<T>(collection, payloads, label);
    return Promise.all(payloads.map(payload => {
        const primaryKeyField = collection === "manufacturing_job_order_materials_reservations"
            ? "jo_materials_reservation_id"
            : collection === "manufacturing_job_order_materials"
                ? "jo_material_id"
                : "id";
        const id = num(payload[primaryKeyField]);
        const body = { ...payload };
        delete body[primaryKeyField];
        return writer.patch<T>(collection, id, body, label);
    }));
}

async function writerDeleteMany(
    writer: MaterialReturnWriter,
    collection: string,
    ids: number[],
    label: string
): Promise<void> {
    if (ids.length === 0) return;
    if (writer.deleteMany) return writer.deleteMany(collection, ids, label);
    await Promise.all(ids.map(id => writer.delete(collection, id, label)));
}

function parseRemarkValue(remarks: string, key: string): string | null {
    const match = remarks.match(new RegExp(`${key}=([^;|]+)`, "i"));
    return match ? match[1].trim() : null;
}

export async function fetchJobOrder(joId: string | number): Promise<ResolvedJobOrder> {
    const numericId = Number(joId);
    const filter = Number.isSafeInteger(numericId) && numericId > 0
        ? `filter[job_order_id][_eq]=${numericId}`
        : `filter[job_order_no][_eq]=${encodeURIComponent(String(joId))}`;
    const rows = await directusGet<RawRecord[]>(
        `/items/manufacturing_job_orders?${filter}&fields=job_order_id,job_order_no,product_id,branch_id,status,primary_work_center_id,cancelled_at,cancelled_by,cancellation_reason,cancellation_image_id&limit=1`,
        "load the Job Order"
    );
    const row = rows[0];
    if (!row) {
        throw new JobOrderCancellationError(`Job Order not found: ${String(joId)}`, 404, "JOB_ORDER_NOT_FOUND");
    }
    return {
        jobOrderId: num(row.job_order_id),
        jobOrderNo: String(row.job_order_no || `JO-${row.job_order_id}`),
        productId: num(row.product_id),
        branchId: num(row.branch_id),
        status: normalizeJobOrderStatus(row.status) || String(row.status || "").trim(),
        primaryWorkCenterId: num(row.primary_work_center_id),
        cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
        cancelledBy: Number.isSafeInteger(Number(row.cancelled_by)) && Number(row.cancelled_by) > 0
            ? Number(row.cancelled_by)
            : null,
        cancellationReason: typeof row.cancellation_reason === "string" ? row.cancellation_reason : null,
        cancellationImageId: typeof row.cancellation_image_id === "string" && row.cancellation_image_id.trim()
            ? row.cancellation_image_id.trim()
            : null
    };
}

function movementsPath(jobOrderId: number): string {
    return `/items/inventory_movements?filter[source_document_id][_eq]=${jobOrderId}&fields=movement_id,product_id,mm_lot_id,inventory_lot_id,branch_id,transaction_type_id,source_document_id,source_document_no,batch_no,quantity,remarks,staging_operation_id,staging_allocation_line_id&limit=-1`;
}

function netStagedByKey(movements: RawRecord[]): Map<string, number> {
    const net = new Map<string, number>();
    for (const movement of movements) {
        const remarks = String(movement.remarks || "");
        const quantity = num(movement.quantity);
        const isReturn = remarks.includes(RETURN_MARKER) && quantity !== 0;
        const isStaging = remarks.includes(STAGING_MARKER) && !isReturn && quantity !== 0;
        if (!isStaging && !isReturn) continue;
        const joMaterialId = Number(parseRemarkValue(remarks, "jo_material_id") || 0);
        if (!joMaterialId) continue;
        const stagingQuantity = isReturn
            ? -Math.abs(quantity)
            : quantity < 0
                ? Math.abs(quantity)
                : quantity;
        const key = `${joMaterialId}:${num(movement.branch_id)}:${num(movement.mm_lot_id)}:${num(movement.inventory_lot_id)}:${String(movement.batch_no || "").trim()}`;
        net.set(key, (net.get(key) || 0) + stagingQuantity);
    }
    return net;
}

async function computeCancellation(jobOrder: ResolvedJobOrder): Promise<ComputedCancellation> {
    const materials = await directusGet<RawRecord[]>(
        `/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${jobOrder.jobOrderId}&fields=jo_material_id,product_id,uom_id,allocated_quantity,reserved_quantity,actual_consumed_quantity,scrap_quantity&limit=-1`,
        "load the Job Order materials"
    );
    const materialById = new Map<number, RawRecord>();
    const materialIdsByProduct = new Map<number, number[]>();
    for (const material of materials) {
        const materialId = num(material.jo_material_id);
        if (!materialId) continue;
        materialById.set(materialId, material);
        const productId = num(material.product_id);
        const list = materialIdsByProduct.get(productId) || [];
        list.push(materialId);
        materialIdsByProduct.set(productId, list);
    }
    const materialIds = [...materialById.keys()];
    const productIds = [...new Set(materials.map((material) => num(material.product_id)).filter(Boolean))];

    const [reservations, movements, genealogy, products] = await Promise.all([
        materialIds.length > 0
            ? directusGet<RawRecord[]>(
                `/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_in]=${materialIds.join(",")}&fields=jo_materials_reservation_id,product_id,branch_id,mm_lot_id,inventory_lot_id,batch_no,jo_material_id,reserved_quantity,staged_quantity,actual_used_quantity,reservation_status,staging_operation_id,staging_allocation_line_id,staging_bin&limit=-1`,
                "load the Job Order material reservations"
            )
            : Promise.resolve([] as RawRecord[]),
        directusGet<RawRecord[]>(movementsPath(jobOrder.jobOrderId), "load the Job Order inventory movements"),
        directusGet<RawRecord[]>(
            `/items/jo_material_genealogy?filter[job_order_id][_eq]=${jobOrder.jobOrderId}&fields=component_product_id,component_mm_lot_id,component_batch_no,consumed_quantity&limit=-1`,
            "load the Job Order material genealogy"
        ).catch(() => [] as RawRecord[]),
        productIds.length > 0
            ? directusGet<RawRecord[]>(
                `/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,description,unit_of_measurement,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name&limit=-1`,
                "load the Job Order products"
            )
            : Promise.resolve([] as RawRecord[])
    ]);

    const productById = new Map<number, RawRecord>(products.map((product) => [num(product.product_id), product]));
    const productName = (productId: number): string => {
        const product = productById.get(productId);
        return String(product?.description || product?.product_name || `Product #${productId}`);
    };
    const productUomShortcut = (productId: number): string => {
        const product = productById.get(productId);
        const uom = product?.unit_of_measurement;
        if (uom && typeof uom === "object") {
            const record = uom as RawRecord;
            return String(record.unit_shortcut || record.unit_name || "PCS");
        }
        return "PCS";
    };

    const stagedByKey = new Map<string, StagedEntry>();
    const stagedByMaterialBatch = new Map<string, StagedEntry | null>();
    for (const movement of movements) {
        const remarks = String(movement.remarks || "");
        const quantity = num(movement.quantity);
        const isReturn = remarks.includes(RETURN_MARKER) && quantity !== 0;
        const isStaging = remarks.includes(STAGING_MARKER) && !isReturn && quantity !== 0;
        if (!isStaging && !isReturn) continue;

        const productId = num(movement.product_id);
        const branchId = num(movement.branch_id) || jobOrder.branchId;
        const mmLotId = num(movement.mm_lot_id) || num(movement.lot_id);
        const inventoryLotId = num(movement.inventory_lot_id);
        const batchNo = String(movement.batch_no || "").trim();
        const parsedMaterialId = Number(parseRemarkValue(remarks, "jo_material_id") || 0);
        const candidateMaterials = materialIdsByProduct.get(productId) || [];
        const joMaterialId = parsedMaterialId || (candidateMaterials.length === 1 ? candidateMaterials[0] : 0);
        if (!productId || !mmLotId || !batchNo || !joMaterialId) continue;

        const key = `${joMaterialId}:${branchId}:${mmLotId}:${inventoryLotId}:${batchNo}`;
        let entry = stagedByKey.get(key);
        if (!entry) {
            entry = {
                key,
                joMaterialId,
                productId,
                branchId,
                mmLotId,
                inventoryLotId,
                batchNo,
                stagedQuantity: 0,
                sourceBin: "",
                reservationIds: []
            };
            stagedByKey.set(key, entry);
            if (!stagedByMaterialBatch.has(`${joMaterialId}:${normalizeBatch(batchNo)}`)) {
                stagedByMaterialBatch.set(`${joMaterialId}:${normalizeBatch(batchNo)}`, entry);
            } else {
                stagedByMaterialBatch.set(`${joMaterialId}:${normalizeBatch(batchNo)}`, null);
            }
        }
        entry.stagedQuantity += isReturn
            ? -Math.abs(quantity)
            : quantity < 0
                ? Math.abs(quantity)
                : quantity;
        if (isStaging) {
            const targetBin = parseRemarkValue(remarks, "target_bin");
            if (targetBin) entry.sourceBin = targetBin;
        }
    }

    const consumedByKey = new Map<string, number>();
    for (const movement of movements) {
        if (num(movement.transaction_type_id) !== 1) continue;
        const quantity = num(movement.quantity);
        if (quantity >= 0) continue;
        const key = `${num(movement.product_id)}:${num(movement.branch_id)}:${num(movement.mm_lot_id)}:${String(movement.batch_no || "").trim()}`;
        consumedByKey.set(key, (consumedByKey.get(key) || 0) + Math.abs(quantity));
    }

    const genealogyByKey = new Map<string, number>();
    for (const row of genealogy) {
        const productId = num(row.component_product_id);
        const batchNo = String(row.component_batch_no || "").trim();
        if (!productId || !batchNo) continue;
        const key = `${productId}:${jobOrder.branchId}:${num(row.component_mm_lot_id)}:${batchNo}`;
        genealogyByKey.set(key, (genealogyByKey.get(key) || 0) + Math.abs(num(row.consumed_quantity)));
    }

    const reservationsByStagedKey = new Map<string, ReservationAggregate>();
    const reservationReleaseTargets: ReleaseTarget[] = [];
    const releaseOnlyLines: JobOrderMaterialReturnLine[] = [];
    for (const reservation of reservations) {
        const joMaterialId = num(reservation.jo_material_id);
        const material = materialById.get(joMaterialId);
        if (!material) continue;
        const branchId = num(reservation.branch_id) || jobOrder.branchId;
        const mmLotId = num(reservation.mm_lot_id) || num(reservation.lot_id);
        const inventoryLotId = num(reservation.inventory_lot_id);
        const batchNo = String(reservation.batch_no || "").trim();
        const reserved = Math.max(0, num(reservation.reserved_quantity));
        const staged = Math.max(0, num(reservation.staged_quantity));
        const used = Math.max(0, num(reservation.actual_used_quantity));
        const reservationId = num(reservation.jo_materials_reservation_id);
        if (reservationId && (reserved > 0 || staged > 0)) {
            reservationReleaseTargets.push({
                id: reservationId,
                reservedQuantity: reserved,
                stagedQuantity: staged,
                actualUsedQuantity: used,
                reservationStatus: reservation.reservation_status ? String(reservation.reservation_status) : null
            });
        }
        if (reserved <= 0 && staged <= 0 && used <= 0) continue;

        const stagedEntry = stagedByKey.get(`${joMaterialId}:${branchId}:${mmLotId}:${inventoryLotId}:${batchNo}`)
            || (inventoryLotId <= 0 ? stagedByMaterialBatch.get(`${joMaterialId}:${normalizeBatch(batchNo)}`) : null)
            || null;
        const productId = num(reservation.product_id) || num(material.product_id);
        if (!stagedEntry) {
            if (reserved > 0) {
                releaseOnlyLines.push({
                    joMaterialId,
                    productId,
                    productName: productName(productId),
                    uomId: num(material.uom_id),
                    uomShortcut: productUomShortcut(productId),
                    branchId,
                    mmLotId,
                    inventoryLotId,
                    batchNo,
                    sourceBin: MAIN_STORE_BIN,
                    targetBin: MAIN_STORE_BIN,
                    stagedQuantity: 0,
                    consumedQuantity: used,
                    returnableQuantity: 0,
                    reservationIds: reservationId ? [reservationId] : [],
                    releaseOnly: true
                });
            }
            continue;
        }

        const aggregate = reservationsByStagedKey.get(stagedEntry.key) || { ids: [], reserved: 0, used: 0 };
        if (reservationId) aggregate.ids.push(reservationId);
        aggregate.reserved += reserved;
        aggregate.used += used;
        reservationsByStagedKey.set(stagedEntry.key, aggregate);
    }

    const fallbackBin = jobOrder.primaryWorkCenterId > 0
        ? `FLOOR-STAGING-${jobOrder.primaryWorkCenterId}`
        : "FLOOR-STAGING";
    const lines: JobOrderMaterialReturnLine[] = [];
    let reconciliationError: string | null = null;
    const setReconciliationError = (message: string) => {
        if (!reconciliationError) reconciliationError = message;
    };

    for (const entry of stagedByKey.values()) {
        const aggregate = reservationsByStagedKey.get(entry.key) || { ids: [], reserved: 0, used: 0 };
        const consumptionKey = `${entry.productId}:${entry.branchId}:${entry.mmLotId}:${entry.batchNo}`;
        const consumedMovement = consumedByKey.get(consumptionKey) || 0;
        const genealogyConsumed = genealogyByKey.get(consumptionKey) || 0;
        const consumedQuantity = aggregate.used > 0 ? aggregate.used : consumedMovement;
        const returnableQuantity = Math.max(0, entry.stagedQuantity - consumedQuantity);

        if (entry.stagedQuantity < -QUANTITY_EPSILON) {
            setReconciliationError(`Lot ${entry.batchNo} has more returned stock than staged stock for this Job Order.`);
        }
        if (aggregate.used > 0 && consumedMovement > 0 && Math.abs(aggregate.used - consumedMovement) > QUANTITY_EPSILON) {
            setReconciliationError(`Consumption movements for lot ${entry.batchNo} (${roundQuantity(consumedMovement)}) do not match the reservation usage (${roundQuantity(aggregate.used)}).`);
        }
        if (aggregate.used > 0 && genealogyConsumed > 0 && Math.abs(aggregate.used - genealogyConsumed) > QUANTITY_EPSILON) {
            setReconciliationError(`Material genealogy for lot ${entry.batchNo} (${roundQuantity(genealogyConsumed)}) does not match the reservation usage (${roundQuantity(aggregate.used)}).`);
        }
        // A reservation may legitimately cover more than the staged floor
        // quantity (the unstaged remainder is a soft hold that is simply
        // released). Only a returnable quantity larger than the reservation
        // means the staged stock is not backed by any reservation.
        if (aggregate.ids.length > 0 && returnableQuantity - aggregate.reserved > QUANTITY_EPSILON) {
            setReconciliationError(`Lot ${entry.batchNo} returnable quantity (${roundQuantity(returnableQuantity)}) exceeds the reservation remaining (${roundQuantity(aggregate.reserved)}).`);
        }
        if (entry.inventoryLotId <= 0) {
            setReconciliationError(`Lot ${entry.batchNo} does not have a canonical inventory-lot identifier. Reconcile the legacy staging record before returning material.`);
        }

        lines.push({
            joMaterialId: entry.joMaterialId,
            productId: entry.productId,
            productName: productName(entry.productId),
            uomId: num(materialById.get(entry.joMaterialId)?.uom_id),
            uomShortcut: productUomShortcut(entry.productId),
            branchId: entry.branchId,
            mmLotId: entry.mmLotId,
            inventoryLotId: entry.inventoryLotId,
            batchNo: entry.batchNo,
            sourceBin: entry.sourceBin || fallbackBin,
            targetBin: MAIN_STORE_BIN,
            stagedQuantity: roundQuantity(entry.stagedQuantity),
            consumedQuantity: roundQuantity(consumedQuantity),
            returnableQuantity: roundQuantity(returnableQuantity),
            reservationIds: aggregate.ids,
            releaseOnly: false
        });
    }
    lines.push(...releaseOnlyLines);

    const materialReleaseTargets: ReleaseTarget[] = [];
    for (const material of materials) {
        const materialId = num(material.jo_material_id);
        const reservedQuantity = Math.max(0, num(material.reserved_quantity));
        if (materialId && reservedQuantity > 0) {
            materialReleaseTargets.push({
                id: materialId,
                reservedQuantity,
                stagedQuantity: 0,
                actualUsedQuantity: 0,
                reservationStatus: null
            });
        }
    }

    return {
        lines,
        totals: {
            stagedQuantity: roundQuantity(lines.reduce((sum, line) => sum + line.stagedQuantity, 0)),
            consumedQuantity: roundQuantity(lines.reduce((sum, line) => sum + line.consumedQuantity, 0)),
            returnableQuantity: roundQuantity(lines.reduce((sum, line) => sum + line.returnableQuantity, 0))
        },
        reconciliationError,
        reservationReleaseTargets,
        materialReleaseTargets
    };
}

const ACTIVE_MASTER_LOT_STATUSES = new Set(["ACTIVE", "EMPTY", "VACANT"]);

function generateReturnBatchNo(jobOrderNo: string, line: JobOrderMaterialReturnLine): string {
    return `RTN-${jobOrderNo}-${line.joMaterialId}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 60);
}

/**
 * Resolve where each return line should land: reuse the source batch when it
 * is still active, create a dedicated RTN batch under the same master lot when
 * the batch is gone but the lot is usable, otherwise require a manual lot.
 */
async function resolveReturnLineDestinations(
    lines: JobOrderMaterialReturnLine[],
    jobOrder: ResolvedJobOrder
): Promise<void> {
    const returnableLines = lines.filter(line => !line.releaseOnly && line.returnableQuantity > QUANTITY_EPSILON);
    const inventoryLotIds = [...new Set(returnableLines.map(line => line.inventoryLotId).filter(id => id > 0))];
    const masterLotIds = [...new Set(returnableLines.map(line => line.mmLotId).filter(id => id > 0))];

    for (const line of lines) {
        line.destination = null;
        line.requiresLotSelection = false;
    }

    const [inventoryLotBatches, masterLotBatches] = await Promise.all([
        Promise.all(chunkBatch(inventoryLotIds).map(ids => directusGet<RawRecord[]>(
            `/items/mm_inventory_lots?filter[inventory_lot_id][_in]=${ids.join(",")}&fields=inventory_lot_id,status,lot_id,batch_no&limit=-1`,
            "load source inventory lots for material returns"
        ))),
        Promise.all(chunkBatch(masterLotIds).map(ids => directusGet<RawRecord[]>(
            `/items/mm_lots?filter[lot_id][_in]=${ids.join(",")}&fields=lot_id,status&limit=-1`,
            "load source master lots for material returns"
        ).catch(() => [] as RawRecord[])))
    ]);
    const inventoryLots = inventoryLotBatches.flat();
    const masterLots = masterLotBatches.flat();

    const activeInventoryLotIds = new Set(
        inventoryLots
            .filter(row => String(row.status || "").trim().toUpperCase() === "ACTIVE")
            .map(row => num(row.inventory_lot_id))
    );
    const masterStatusById = new Map(masterLots.map(row => [num(row.lot_id), String(row.status || "").trim().toUpperCase()]));

    for (const line of returnableLines) {
        if (line.inventoryLotId > 0 && activeInventoryLotIds.has(line.inventoryLotId)) {
            line.destination = {
                mmLotId: line.mmLotId,
                inventoryLotId: line.inventoryLotId,
                batchNo: line.batchNo,
                action: "REUSE"
            };
            continue;
        }

        const masterStatus = masterStatusById.get(line.mmLotId);
        if (masterStatus && ACTIVE_MASTER_LOT_STATUSES.has(masterStatus)) {
            line.destination = {
                mmLotId: line.mmLotId,
                inventoryLotId: 0,
                batchNo: generateReturnBatchNo(jobOrder.jobOrderNo, line),
                action: "CREATE"
            };
            continue;
        }

        line.requiresLotSelection = true;
    }
}

async function loadExistingReturnMovements(operationIds: string[]): Promise<RawRecord[]> {
    const rows = await Promise.all(chunkBatch(operationIds).map(async ids => {
        const filter = { staging_operation_id: { _in: ids } };
        return directusGet<RawRecord[]>(
            `/items/inventory_movements?filter=${encodeURIComponent(JSON.stringify(filter))}&fields=movement_id,product_id,branch_id,mm_lot_id,inventory_lot_id,batch_no,transaction_type_id,quantity,staging_operation_id&limit=-1`,
            "check existing material-staging reversals"
        );
    }));
    return rows.flat();
}

interface ReturnInventoryLotCandidate {
    line: JobOrderMaterialReturnLine;
    mmLotId: number;
    productId: number;
    branchId: number;
    batchNo: string;
}

interface ReturnInventoryLotResolution {
    inventoryLotId: number;
}

function returnInventoryLotKey(candidate: Pick<ReturnInventoryLotCandidate, "mmLotId" | "productId" | "batchNo">): string {
    return `${candidate.mmLotId}:${candidate.productId}:${normalizeBatch(candidate.batchNo)}`;
}

function inventoryLotKeyFromRecord(row: RawRecord): string {
    return `${num(row.lot_id)}:${num(row.product_id)}:${normalizeBatch(row.batch_no)}`;
}

async function loadReturnInventoryLots(candidates: ReturnInventoryLotCandidate[]): Promise<RawRecord[]> {
    const uniqueCandidates = [...new Map(candidates.map(candidate => [returnInventoryLotKey(candidate), candidate])).values()];
    const rows = await Promise.all(chunkBatch(uniqueCandidates, 40).map(async batch => {
        const filter = {
            _or: batch.map(candidate => ({
                lot_id: { _eq: candidate.mmLotId },
                product_id: { _eq: candidate.productId },
                batch_no: { _eq: candidate.batchNo }
            }))
        };
        return directusGet<RawRecord[]>(
            `/items/mm_inventory_lots?filter=${encodeURIComponent(JSON.stringify(filter))}&fields=inventory_lot_id,lot_id,branch_id,product_id,batch_no,status&limit=-1`,
            "load existing return inventory lots"
        );
    }));
    return rows.flat();
}

async function resolveReturnInventoryLots(
    lines: JobOrderMaterialReturnLine[],
    jobOrder: ResolvedJobOrder,
    actorUserId: number,
    writer: MaterialReturnWriter,
    createdInventoryLotIds: number[]
): Promise<Map<string, ReturnInventoryLotResolution>> {
    const candidates = lines.flatMap(line => {
        const destination = line.destination;
        if (!destination || destination.action !== "CREATE") return [];
        return [{
            line,
            mmLotId: destination.mmLotId,
            productId: line.productId,
            branchId: line.branchId,
            batchNo: destination.batchNo
        }];
    });
    const uniqueCandidates = [...new Map(candidates.map(candidate => [returnInventoryLotKey(candidate), candidate])).values()];
    const resolutions = new Map<string, ReturnInventoryLotResolution>();
    if (uniqueCandidates.length === 0) return resolutions;

    const existingRows = await loadReturnInventoryLots(uniqueCandidates);
    const existingByKey = new Map(existingRows.map(row => [inventoryLotKeyFromRecord(row), row]));
    for (const candidate of uniqueCandidates) {
        const existing = existingByKey.get(returnInventoryLotKey(candidate));
        const inventoryLotId = num(existing?.inventory_lot_id);
        if (inventoryLotId > 0) {
            resolutions.set(returnInventoryLotKey(candidate), { inventoryLotId });
        }
    }

    const missingCandidates = uniqueCandidates.filter(candidate => !resolutions.has(returnInventoryLotKey(candidate)));
    const payloads = missingCandidates.map(candidate => ({
        lot_id: candidate.mmLotId,
        branch_id: candidate.branchId,
        product_id: candidate.productId,
        batch_no: candidate.batchNo.trim(),
        manufacturing_date: null,
        expiry_date: null,
        unit_cost: 0,
        qa_status: "GOOD",
        status: "ACTIVE",
        source_type: "JOB_ORDER_RETURN",
        source_reference: jobOrder.jobOrderNo,
        remarks: `Returned material from Job Order ${jobOrder.jobOrderNo}`,
        created_by: actorUserId
    }));

    for (const [chunkIndex, payloadChunk] of chunkBatch(payloads).entries()) {
        const candidateChunk = missingCandidates.slice(
            chunkIndex * DIRECTUS_BATCH_SIZE,
            chunkIndex * DIRECTUS_BATCH_SIZE + payloadChunk.length
        );
        let createdRows: RawRecord[];
        try {
            createdRows = await writerCreateMany<RawRecord>(
                writer,
                "mm_inventory_lots",
                payloadChunk,
                "create return inventory batches"
            );
        } catch (error) {
            // A duplicate batch can be created concurrently. Match the existing
            // resolver's recovery behavior without issuing one lookup per line.
            const recoveredRows = await loadReturnInventoryLots(candidateChunk).catch(() => []);
            const recoveredByKey = new Map(recoveredRows.map(row => [inventoryLotKeyFromRecord(row), row]));
            const allRecovered = candidateChunk.every(candidate => {
                const recoveredId = num(recoveredByKey.get(returnInventoryLotKey(candidate))?.inventory_lot_id);
                if (recoveredId <= 0) return false;
                resolutions.set(returnInventoryLotKey(candidate), { inventoryLotId: recoveredId });
                return true;
            });
            if (!allRecovered) throw error;
            continue;
        }

        if (createdRows.length !== candidateChunk.length) {
            throw new JobOrderCancellationError(
                "Directus did not return every created return inventory batch.",
                502,
                "INVENTORY_LOT_WRITE_FAILED"
            );
        }
        const returnedByKey = new Map(createdRows.map(row => [inventoryLotKeyFromRecord(row), row]));
        const responseHasCandidateFields = createdRows.some(row => num(row.lot_id) > 0 && num(row.product_id) > 0 && Boolean(row.batch_no));
        for (let index = 0; index < candidateChunk.length; index += 1) {
            const candidate = candidateChunk[index];
            const row = candidate && responseHasCandidateFields
                ? returnedByKey.get(returnInventoryLotKey(candidate))
                : createdRows[index];
            const inventoryLotId = num(row?.inventory_lot_id ?? row?.id);
            if (!candidate || inventoryLotId <= 0) {
                throw new JobOrderCancellationError(
                    "A created return inventory batch did not return a valid ID.",
                    502,
                    "INVENTORY_LOT_WRITE_FAILED"
                );
            }
            resolutions.set(returnInventoryLotKey(candidate), { inventoryLotId });
            createdInventoryLotIds.push(inventoryLotId);
        }
    }

    return resolutions;
}

export async function computeJobOrderMaterialReturns(jobOrder: ResolvedJobOrder): Promise<ComputedCancellation> {
    const computed = await computeCancellation(jobOrder);
    await resolveReturnLineDestinations(computed.lines, jobOrder);
    return computed;
}

export function applyMaterialReturnDestinations(
    computed: ComputedCancellation,
    jobOrder: ResolvedJobOrder,
    overrides: Array<{ joMaterialId: number; mmLotId: number; inventoryLotId?: number; batchNo?: string }> | undefined
): void {
    if (!overrides || overrides.length === 0) return;
    for (const line of computed.lines) {
        if (!line.requiresLotSelection) continue;
        const override = overrides.find(item => Number(item.joMaterialId) === line.joMaterialId);
        const overrideMmLotId = Number(override?.mmLotId ?? 0);
        if (!Number.isSafeInteger(overrideMmLotId) || overrideMmLotId <= 0) continue;
        const overrideInventoryLotId = Number(override?.inventoryLotId ?? 0);
        line.destination = {
            mmLotId: overrideMmLotId,
            inventoryLotId: Number.isSafeInteger(overrideInventoryLotId) && overrideInventoryLotId > 0 ? overrideInventoryLotId : 0,
            batchNo: String(override?.batchNo || "").trim() || generateReturnBatchNo(jobOrder.jobOrderNo, line),
            action: "CREATE"
        };
        line.requiresLotSelection = false;
    }
}

function buildReturnRemarks(
    line: JobOrderMaterialReturnLine,
    jobOrder: ResolvedJobOrder,
    reason: string,
    reversalOperationId: string,
    reversalLineId: string
): string {
    const workCenterMatch = line.sourceBin.match(/FLOOR-STAGING-(\d+)/i);
    const workCenterId = workCenterMatch ? workCenterMatch[1] : "";
    const allocationId = line.reservationIds.join(",");
    return `${RETURN_MARKER} operation_id=${reversalOperationId};staging_allocation_line_id=${reversalLineId};source_bin=${line.sourceBin};target_bin=${MAIN_STORE_BIN};work_center_id=${workCenterId};jo_material_id=${line.joMaterialId};allocation_id=${allocationId}; JO #${jobOrder.jobOrderNo}. Reason: ${reason}`;
}

function reversalOperationId(jobOrderId: number, line: JobOrderMaterialReturnLine): string {
    const batch = normalizeBatch(line.batchNo).replace(/[^a-z0-9_-]/g, "-").slice(0, 40);
    return `staging-reversal-${jobOrderId}-${line.joMaterialId}-${line.mmLotId}-${line.inventoryLotId}-${batch}`;
}

function reversalLineId(line: JobOrderMaterialReturnLine): string {
    return `return-${line.joMaterialId}-${line.mmLotId}-${line.inventoryLotId}-${normalizeBatch(line.batchNo).replace(/[^a-z0-9_-]/g, "-").slice(0, 40)}`;
}

async function executeCancellation(
    jobOrder: ResolvedJobOrder,
    computed: ComputedCancellation,
    options: {
        reason: string;
        actorUserId: number;
        writeStatus: boolean;
        writer?: MaterialReturnWriter;
        eventKey?: string;
        workflowAction?: string;
        cancellationImageId?: string | null;
    }
): Promise<JobOrderCancellationExecution> {
    if (!Number.isSafeInteger(options.actorUserId) || options.actorUserId <= 0) {
        throw new JobOrderCancellationError(
            "An authenticated user is required to record material returns.",
            401,
            "AUTHENTICATION_REQUIRED"
        );
    }

    const createdMovementIds: number[] = [];
    const createdInventoryLotIds: number[] = [];
    const reservationSnapshots: ReservationSnapshot[] = [];
    const materialSnapshots: Array<{ id: number; reservedQuantity: number }> = [];
    let cancellationSnapshot: {
        status: string;
        cancelledAt: string | null;
        cancelledBy: number | null;
        cancellationReason: string | null;
        cancellationImageId: string | null;
    } | null = null;
    let statusHistoryId: number | null = null;
    let succeeded = false;
    const materialReturnWriter = options.writer || defaultMaterialReturnWriter;

    const returnLines = computed.lines.filter(
        (line) => !line.releaseOnly && line.returnableQuantity > QUANTITY_EPSILON
    );
    const returnedQuantity = roundQuantity(returnLines.reduce((sum, line) => sum + line.returnableQuantity, 0));
    const reversalTransactionTypeId = returnLines.length > 0
        ? await resolveTransactionTypeId("MATERIAL_STAGING_REVERSAL", "IN")
        : null;

    const compensate = async () => {
        const failures: string[] = [];
        const rollbackDeleteMany = async (collection: string, ids: number[], label: string) => {
            for (const batch of chunkBatch([...ids].reverse())) {
                try {
                    await writerDeleteMany(materialReturnWriter, collection, batch, label);
                } catch (error) {
                    failures.push(`${collection}: ${errorMessage(error)}`);
                }
            }
        };
        const rollbackPatchMany = async (collection: string, payloads: Record<string, unknown>[], label: string) => {
            for (const batch of chunkBatch([...payloads].reverse())) {
                try {
                    await writerPatchMany(materialReturnWriter, collection, batch, label);
                } catch (error) {
                    failures.push(`${collection}: ${errorMessage(error)}`);
                }
            }
        };

        await rollbackDeleteMany("inventory_movements", createdMovementIds, "remove material return movements");
        await rollbackDeleteMany("mm_inventory_lots", createdInventoryLotIds, "remove return inventory batches");

        const reservationRestores = reservationSnapshots.map(snapshot => ({
            jo_materials_reservation_id: snapshot.id,
            ...snapshot.payload
        }));
        await rollbackPatchMany(
            "manufacturing_job_order_materials_reservations",
            reservationRestores,
            "restore Job Order material reservations"
        );
        const materialRestores = materialSnapshots.map(snapshot => ({
            jo_material_id: snapshot.id,
            reserved_quantity: snapshot.reservedQuantity
        }));
        await rollbackPatchMany(
            "manufacturing_job_order_materials",
            materialRestores,
            "restore Job Order material reservations"
        );

        if (statusHistoryId) {
            try {
                await directusDelete(
                    `/items/manufacturing_job_order_status_history/${statusHistoryId}`,
                    `remove status history ${statusHistoryId}`
                );
            } catch (error) {
                failures.push(`status history ${statusHistoryId}: ${errorMessage(error)}`);
            }
        }
        if (options.writeStatus && cancellationSnapshot) {
            try {
                await directusWrite(
                    `/items/manufacturing_job_orders/${jobOrder.jobOrderId}`,
                    "PATCH",
                    {
                        status: cancellationSnapshot.status,
                        cancelled_at: cancellationSnapshot.cancelledAt,
                        cancelled_by: cancellationSnapshot.cancelledBy,
                        cancellation_reason: cancellationSnapshot.cancellationReason,
                        cancellation_image_id: cancellationSnapshot.cancellationImageId
                    },
                    `restore Job Order ${jobOrder.jobOrderNo} cancellation fields`
                );
            } catch (error) {
                failures.push(`Job Order ${jobOrder.jobOrderId}: ${errorMessage(error)}`);
            }
        }
        if (failures.length > 0) {
            throw new JobOrderCancellationError(
                `The Job Order cancellation could not be fully rolled back. Manual reconciliation is required for: ${failures.join("; ")}`,
                503,
                "RECONCILIATION_REQUIRED",
                { failures, createdMovementIds, statusHistoryId }
            );
        }
    };

    try {
        if (returnLines.length > 0 && !reversalTransactionTypeId) {
            throw new JobOrderCancellationError(
                "The material-staging reversal transaction type could not be resolved.",
                503,
                "TRANSACTION_TYPE_UNAVAILABLE"
            );
        }
        for (const line of returnLines) {
            if (line.requiresLotSelection || !line.destination) {
                throw new JobOrderCancellationError(
                    `Lot ${line.batchNo} needs an active destination lot before its stock can be returned.`,
                    409,
                    "JOB_ORDER_RETURN_DESTINATION_REQUIRED"
                );
            }
        }

        const lotResolutions = await resolveReturnInventoryLots(
            returnLines,
            jobOrder,
            options.actorUserId,
            materialReturnWriter,
            createdInventoryLotIds
        );
        const operationById = new Map<string, {
            line: JobOrderMaterialReturnLine;
            effectiveBatchNo: string;
        }>();
        for (const line of returnLines) {
            const destination = line.destination!;
            const lotResolution = destination.action === "CREATE"
                ? lotResolutions.get(returnInventoryLotKey({
                    mmLotId: destination.mmLotId,
                    productId: line.productId,
                    batchNo: destination.batchNo
                }))
                : null;
            const effectiveInventoryLotId = destination.action === "CREATE"
                ? num(lotResolution?.inventoryLotId)
                : destination.inventoryLotId;
            if (effectiveInventoryLotId <= 0) {
                throw new JobOrderCancellationError(
                    `Lot ${destination.batchNo} does not have a valid destination inventory lot.`,
                    503,
                    "JOB_ORDER_RETURN_DESTINATION_REQUIRED"
                );
            }
            const effectiveBatchNo = destination.action === "CREATE" ? destination.batchNo : line.batchNo;
            const effectiveLine: JobOrderMaterialReturnLine = {
                ...line,
                mmLotId: destination.mmLotId,
                inventoryLotId: effectiveInventoryLotId,
                batchNo: effectiveBatchNo
            };
            line.resolvedDestination = {
                mmLotId: effectiveLine.mmLotId,
                inventoryLotId: effectiveLine.inventoryLotId,
                batchNo: effectiveLine.batchNo,
                action: destination.action
            };
            const operationId = reversalOperationId(jobOrder.jobOrderId, effectiveLine);
            operationById.set(operationId, { line, effectiveBatchNo });
        }

        const operationIds = [...operationById.keys()];
        const existingRows = await loadExistingReturnMovements(operationIds);
        const existingByOperation = new Map<string, RawRecord[]>();
        for (const row of existingRows) {
            const operationId = String(row.staging_operation_id || "");
            const matches = existingByOperation.get(operationId) || [];
            matches.push(row);
            existingByOperation.set(operationId, matches);
        }

        const movementPayloads: Record<string, unknown>[] = [];
        for (const [operationId, operation] of operationById) {
            const { line, effectiveBatchNo } = operation;
            const resolved = line.resolvedDestination!;
            const existing = existingByOperation.get(operationId) || [];
            if (existing.length > 1) {
                throw new JobOrderCancellationError(
                    `Multiple material-staging reversals already exist for ${effectiveBatchNo}. Reconciliation is required.`,
                    503,
                    "RECONCILIATION_REQUIRED"
                );
            }
            if (existing.length === 1) {
                const persisted = existing[0];
                const matches = matchesExistingReturnMovement(persisted, {
                    productId: line.productId,
                    branchId: line.branchId,
                    mmLotId: resolved.mmLotId,
                    inventoryLotId: resolved.inventoryLotId,
                    batchNo: resolved.batchNo,
                    transactionTypeId: reversalTransactionTypeId || 0,
                    quantity: line.returnableQuantity
                }, QUANTITY_EPSILON);
                if (!matches) {
                    throw new JobOrderCancellationError(
                        `The existing material-staging reversal for ${effectiveBatchNo} does not match the requested quantity or lot identity.`,
                        409,
                        "JOB_ORDER_RETURN_CONFLICT"
                    );
                }
                continue;
            }

            const effectiveLine: JobOrderMaterialReturnLine = {
                ...line,
                mmLotId: resolved.mmLotId,
                inventoryLotId: resolved.inventoryLotId,
                batchNo: resolved.batchNo
            };
            const allocationId = reversalLineId(effectiveLine);
            const remarks = buildReturnRemarks(effectiveLine, jobOrder, options.reason, operationId, allocationId);
            const base: Record<string, unknown> = {
                product_id: line.productId,
                mm_lot_id: resolved.mmLotId,
                inventory_lot_id: resolved.inventoryLotId,
                lot_id: null,
                branch_id: line.branchId,
                source_document_id: jobOrder.jobOrderId,
                source_document_no: jobOrder.jobOrderNo,
                batch_no: resolved.batchNo,
                transaction_type_id: reversalTransactionTypeId,
                staging_operation_id: operationId,
                staging_allocation_line_id: allocationId,
                quantity: line.returnableQuantity,
                remarks
            };
            base.created_by = options.actorUserId;
            movementPayloads.push(base);
        }

        for (const batch of chunkBatch(movementPayloads)) {
            let createdRows: RawRecord[];
            try {
                createdRows = await writerCreateMany<RawRecord>(
                    materialReturnWriter,
                    "inventory_movements",
                    batch,
                    "create raw material staging reversal movements"
                );
            } catch (error) {
                // Resolve an ambiguous network result by the stable operation
                // keys before compensation can remove destination lots.
                const batchOperationIds = batch.map(payload => String(payload.staging_operation_id || ""));
                const recoveredRows = await loadExistingReturnMovements(batchOperationIds).catch(() => []);
                const recoveredByOperation = new Map<string, RawRecord[]>();
                for (const row of recoveredRows) {
                    const operationId = String(row.staging_operation_id || "");
                    const matches = recoveredByOperation.get(operationId) || [];
                    matches.push(row);
                    recoveredByOperation.set(operationId, matches);
                }
                const allRecovered = batch.every(payload => {
                    const operationId = String(payload.staging_operation_id || "");
                    const operation = operationById.get(operationId);
                    const recovered = recoveredByOperation.get(operationId) || [];
                    if (!operation || recovered.length !== 1) return false;
                    const resolved = operation.line.resolvedDestination;
                    if (!resolved || !matchesExistingReturnMovement(recovered[0], {
                        productId: operation.line.productId,
                        branchId: operation.line.branchId,
                        mmLotId: resolved.mmLotId,
                        inventoryLotId: resolved.inventoryLotId,
                        batchNo: resolved.batchNo,
                        transactionTypeId: reversalTransactionTypeId || 0,
                        quantity: operation.line.returnableQuantity
                    }, QUANTITY_EPSILON)) return false;
                    return num(recovered[0].movement_id ?? recovered[0].id) > 0;
                });
                if (!allRecovered) throw error;
                createdRows = batch.map(payload => {
                    const operationId = String(payload.staging_operation_id || "");
                    return recoveredByOperation.get(operationId)![0];
                });
            }
            if (createdRows.length !== batch.length) {
                throw new JobOrderCancellationError(
                    "Directus did not return every raw material staging reversal movement.",
                    503,
                    "MOVEMENT_WRITE_FAILED"
                );
            }
            const returnedByOperation = new Map(createdRows.map(row => [String(row.staging_operation_id || ""), row]));
            const responseHasOperationIds = createdRows.some(row => Boolean(row.staging_operation_id));
            for (let index = 0; index < batch.length; index += 1) {
                const operationId = String(batch[index]?.staging_operation_id || "");
                const created = responseHasOperationIds
                    ? returnedByOperation.get(operationId)
                    : createdRows[index];
                const movementId = num(created?.movement_id ?? created?.id);
                if (!movementId) {
                    throw new JobOrderCancellationError(
                        "A raw material staging reversal movement did not return an ID.",
                        503,
                        "MOVEMENT_WRITE_FAILED"
                    );
                }
                createdMovementIds.push(movementId);
            }
        }

        // Re-read the staging ledger after writing so a concurrent cancellation
        // cannot silently drive a lot below zero.
        if (returnLines.length > 0) {
            const freshMovements = await directusGet<RawRecord[]>(
                movementsPath(jobOrder.jobOrderId),
                "reload the Job Order inventory movements"
            );
            const freshNet = netStagedByKey(freshMovements);
            for (const line of returnLines) {
                const resolved = line.resolvedDestination;
                if (!resolved) continue;
                const key = `${line.joMaterialId}:${line.branchId}:${resolved.mmLotId}:${resolved.inventoryLotId}:${resolved.batchNo}`;
                if ((freshNet.get(key) ?? 0) < -QUANTITY_EPSILON) {
                    throw new JobOrderCancellationError(
                        "Another cancellation or return was processed for the same material. Refresh the Job Order and try again.",
                        409,
                        "JOB_ORDER_RETURN_CONFLICT"
                    );
                }
            }
        }

        const reservationBatch = buildReservationReleaseBatch(computed.reservationReleaseTargets, roundQuantity);
        reservationSnapshots.push(...reservationBatch.snapshots);
        for (const batch of chunkBatch(reservationBatch.updates)) {
            await writerPatchMany(
                materialReturnWriter,
                "manufacturing_job_order_materials_reservations",
                batch,
                "release Job Order material reservations"
            );
        }
        const materialBatch = buildMaterialReleaseBatch(computed.materialReleaseTargets);
        materialSnapshots.push(...materialBatch.snapshots);
        for (const batch of chunkBatch(materialBatch.updates)) {
            await writerPatchMany(
                materialReturnWriter,
                "manufacturing_job_order_materials",
                batch,
                "release Job Order material reservations"
            );
        }

        if (options.writeStatus) {
            cancellationSnapshot = {
                status: jobOrder.status,
                cancelledAt: jobOrder.cancelledAt,
                cancelledBy: jobOrder.cancelledBy,
                cancellationReason: jobOrder.cancellationReason,
                cancellationImageId: jobOrder.cancellationImageId
            };
            const cancelledAt = new Date().toISOString();
            await directusWrite(
                `/items/manufacturing_job_orders/${jobOrder.jobOrderId}`,
                "PATCH",
                {
                    status: JOB_ORDER_STATUS.CANCELLED,
                    cancelled_at: cancelledAt,
                    cancelled_by: options.actorUserId,
                    cancellation_reason: options.reason,
                    cancellation_image_id: options.cancellationImageId ?? null
                },
                `cancel Job Order ${jobOrder.jobOrderNo}`
            );
            const history = await directusWrite<RawRecord>(
                "/items/manufacturing_job_order_status_history",
                "POST",
                {
                    job_order_id: jobOrder.jobOrderId,
                    old_status: jobOrder.status,
                    new_status: JOB_ORDER_STATUS.CANCELLED,
                    event_key: options.eventKey || null,
                    workflow_action: options.workflowAction || "cancel",
                    changed_by: options.actorUserId,
                    changed_at: new Date().toISOString(),
                    remarks: `Job Order cancelled. Reason: ${options.reason} | Returned ${returnedQuantity} unit(s) to ${MAIN_STORE_BIN} across ${returnLines.length} lot/batch line(s); released ${computed.reservationReleaseTargets.length} reservation(s).`
                },
                "record the Job Order cancellation history"
            );
            statusHistoryId = num(history.history_id ?? history.id) || null;
        }

        succeeded = true;
    } catch (error) {
        const hasWrites = createdMovementIds.length > 0
            || reservationSnapshots.length > 0
            || materialSnapshots.length > 0
            || statusHistoryId !== null
            || cancellationSnapshot !== null;
        if (hasWrites) {
            await compensate();
        }
        throw error;
    }

    return {
        response: {
            jobOrderId: jobOrder.jobOrderId,
            jobOrderNo: jobOrder.jobOrderNo,
            status: options.writeStatus ? JOB_ORDER_STATUS.CANCELLED : jobOrder.status,
            cancellationImageId: options.writeStatus
                ? (options.cancellationImageId ?? null)
                : jobOrder.cancellationImageId,
            cancellationImageUrl: jobOrderCancellationImageUrl(
                options.writeStatus ? (options.cancellationImageId ?? null) : jobOrder.cancellationImageId
            ),
            lines: computed.lines,
            returnedQuantity,
            releasedReservationCount: computed.reservationReleaseTargets.length,
            movementCount: createdMovementIds.length,
            alreadyCancelled: !options.writeStatus
        },
        compensate: succeeded ? compensate : async () => {}
    };
}

export async function resolveJobOrderProductName(productId: number): Promise<string> {
    if (!Number.isSafeInteger(productId) || productId <= 0) return `Product #${productId}`;
    const rows = await directusGet<RawRecord[]>(
        `/items/products?filter[product_id][_eq]=${productId}&fields=product_id,product_name,description&limit=1`,
        "load the Job Order product"
    ).catch(() => [] as RawRecord[]);
    const product = rows[0];
    return String(product?.description || product?.product_name || `Product #${productId}`);
}

export async function previewJobOrderCancellation(joId: string | number): Promise<JobOrderCancellationPreview> {
    const jobOrder = await fetchJobOrder(joId);
    const computed = await computeCancellation(jobOrder);
    const productName = await resolveJobOrderProductName(jobOrder.productId);
    const status = jobOrder.status;
    const cancellable = isCancellableJobOrderStatus(status) && !computed.reconciliationError;
    const canReturnMaterials = (
        isCancelledJobOrderStatus(status)
        || isJobOrderStatus(status, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD, JOB_ORDER_STATUS.PRODUCTION_COMPLETED, JOB_ORDER_STATUS.FOR_QA_RECONCILIATION)
    )
        && computed.totals.returnableQuantity > QUANTITY_EPSILON
        && !computed.reconciliationError;

    let blockedReason: string | null = computed.reconciliationError;
    if (!blockedReason) {
        if (isCancelledJobOrderStatus(status)) blockedReason = "The Job Order is already cancelled.";
        else if (isTerminalJobOrderStatus(status)) blockedReason = "Completed, finished, or closed Job Orders cannot be cancelled.";
        else if (!isCancellableJobOrderStatus(status)) blockedReason = `Job Orders in status "${status}" cannot be cancelled.`;
    }

    return {
        jobOrderId: jobOrder.jobOrderId,
        jobOrderNo: jobOrder.jobOrderNo,
        productId: jobOrder.productId,
        productName,
        branchId: jobOrder.branchId,
        status,
        cancellationImageId: jobOrder.cancellationImageId,
        cancellationImageUrl: jobOrderCancellationImageUrl(jobOrder.cancellationImageId),
        cancellable,
        canReturnMaterials,
        blockedReason,
        lines: computed.lines,
        totals: computed.totals
    };
}

export async function cancelJobOrderAndReturnMaterials(input: {
    joId: string | number;
    reason: string;
    actorUserId: number;
    eventKey?: string;
    cancellationImageId?: string | null;
}): Promise<JobOrderCancellationExecution> {
    const jobOrder = await fetchJobOrder(input.joId);
    if (isCancelledJobOrderStatus(jobOrder.status)) {
        throw new JobOrderCancellationError(
            `Job Order ${jobOrder.jobOrderNo} is already cancelled.`,
            409,
            "JOB_ORDER_ALREADY_CANCELLED"
        );
    }
    if (isTerminalJobOrderStatus(jobOrder.status)) {
        throw new JobOrderCancellationError(
            `Job Order ${jobOrder.jobOrderNo} is already finished and cannot be cancelled.`,
            409,
            "JOB_ORDER_TERMINAL"
        );
    }
    if (!isCancellableJobOrderStatus(jobOrder.status)) {
        throw new JobOrderCancellationError(
            `Job Orders in status "${jobOrder.status}" cannot be cancelled.`,
            409,
            "JOB_ORDER_STATUS_NOT_CANCELLABLE"
        );
    }

    const computed = await computeJobOrderMaterialReturns(jobOrder);
    if (computed.reconciliationError) {
        throw new JobOrderCancellationError(
            computed.reconciliationError,
            409,
            "JOB_ORDER_RECONCILIATION_FAILED"
        );
    }

    return executeCancellation(jobOrder, computed, {
        reason: input.reason,
        actorUserId: input.actorUserId,
        writeStatus: true,
        eventKey: input.eventKey,
        workflowAction: "cancel",
        cancellationImageId: input.cancellationImageId ?? null
    });
}

export async function returnCancelledJobOrderMaterials(input: {
    joId: string | number;
    reason?: string;
    actorUserId: number;
}): Promise<JobOrderCancellationExecution> {
    const jobOrder = await fetchJobOrder(input.joId);
    if (!isCancelledJobOrderStatus(jobOrder.status)) {
        throw new JobOrderCancellationError(
            `Job Order ${jobOrder.jobOrderNo} is not cancelled.`,
            409,
            "JOB_ORDER_NOT_CANCELLED"
        );
    }

    const computed = await computeCancellation(jobOrder);
    if (computed.reconciliationError) {
        throw new JobOrderCancellationError(
            computed.reconciliationError,
            409,
            "JOB_ORDER_RECONCILIATION_FAILED"
        );
    }

    return executeCancellation(jobOrder, computed, {
        reason: input.reason?.trim() || "Return raw materials from cancelled Job Order",
        actorUserId: input.actorUserId,
        writeStatus: false
    });
}

export async function executeJobOrderMaterialReturns(
    jobOrder: ResolvedJobOrder,
    computed: ComputedCancellation,
    options: { reason: string; actorUserId: number; writeStatus: boolean; writer?: MaterialReturnWriter }
): Promise<JobOrderCancellationExecution> {
    return executeCancellation(jobOrder, computed, options);
}

export interface ReturnLeftoverMaterialsInput {
    joId: string | number;
    reason?: string;
    actorUserId: number;
    destinations?: Array<{ joMaterialId: number; mmLotId: number; inventoryLotId?: number; batchNo?: string }>;
    writer?: MaterialReturnWriter;
}

/**
 * Return leftover floor-staged material without changing the Job Order status.
 * Used for halted JOs (On Hold / QA Hold), completed/finished leftovers
 * (Scenario C), and cancelled JOs whose remainder is returned from QA.
 */
export async function returnJobOrderMaterialLeftovers(input: ReturnLeftoverMaterialsInput): Promise<JobOrderCancellationExecution> {
    const jobOrder = await fetchJobOrder(input.joId);
    const returnableStatus = isCancelledJobOrderStatus(jobOrder.status)
        || isTerminalJobOrderStatus(jobOrder.status)
        || isJobOrderStatus(jobOrder.status, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD, JOB_ORDER_STATUS.PRODUCTION_COMPLETED, JOB_ORDER_STATUS.FOR_QA_RECONCILIATION);
    if (!returnableStatus) {
        throw new JobOrderCancellationError(
            `Job Order ${jobOrder.jobOrderNo} is in status "${jobOrder.status}" and cannot return leftover material through this flow.`,
            409,
            "JOB_ORDER_STATUS_NOT_RETURNABLE"
        );
    }

    const computed = await computeJobOrderMaterialReturns(jobOrder);
    if (computed.reconciliationError) {
        throw new JobOrderCancellationError(
            computed.reconciliationError,
            409,
            "JOB_ORDER_RECONCILIATION_FAILED"
        );
    }
    applyMaterialReturnDestinations(computed, jobOrder, input.destinations);

    const needsDestination = computed.lines.some(
        (line) => !line.releaseOnly
            && line.returnableQuantity > QUANTITY_EPSILON
            && line.requiresLotSelection
    );
    if (needsDestination) {
        throw new JobOrderCancellationError(
            "One or more return lines need an active destination lot before the stock can be returned.",
            422,
            "JOB_ORDER_RETURN_DESTINATION_REQUIRED"
        );
    }

    return executeJobOrderMaterialReturns(jobOrder, computed, {
        reason: input.reason?.trim() || "Return leftover raw materials",
        actorUserId: input.actorUserId,
        writeStatus: false,
        writer: input.writer
    });
}
