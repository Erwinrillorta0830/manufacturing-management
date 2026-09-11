import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    isCancellableJobOrderStatus,
    isCancelledJobOrderStatus,
    isTerminalJobOrderStatus,
    normalizeJobOrderStatus,
    JOB_ORDER_STATUS
} from "@/modules/manufacturing-management/job-order-status";

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

export interface JobOrderMaterialReturnLine {
    joMaterialId: number;
    productId: number;
    productName: string;
    uomId: number;
    uomShortcut: string;
    branchId: number;
    mmLotId: number;
    batchNo: string;
    sourceBin: string;
    targetBin: string;
    stagedQuantity: number;
    consumedQuantity: number;
    returnableQuantity: number;
    reservationIds: number[];
    releaseOnly: boolean;
}

export interface JobOrderCancellationPreview {
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    productName: string;
    branchId: number;
    status: string;
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

interface ResolvedJobOrder {
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    branchId: number;
    status: string;
    primaryWorkCenterId: number;
}

interface StagedEntry {
    key: string;
    joMaterialId: number;
    productId: number;
    branchId: number;
    mmLotId: number;
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
}

interface ComputedCancellation {
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

function parseRemarkValue(remarks: string, key: string): string | null {
    const match = remarks.match(new RegExp(`${key}=([^;|]+)`, "i"));
    return match ? match[1].trim() : null;
}

async function fetchJobOrder(joId: string | number): Promise<ResolvedJobOrder> {
    const numericId = Number(joId);
    const filter = Number.isSafeInteger(numericId) && numericId > 0
        ? `filter[job_order_id][_eq]=${numericId}`
        : `filter[job_order_no][_eq]=${encodeURIComponent(String(joId))}`;
    const rows = await directusGet<RawRecord[]>(
        `/items/manufacturing_job_orders?${filter}&fields=job_order_id,job_order_no,product_id,branch_id,status,primary_work_center_id&limit=1`,
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
        primaryWorkCenterId: num(row.primary_work_center_id)
    };
}

function movementsPath(jobOrderId: number): string {
    return `/items/inventory_movements?filter[source_document_id][_eq]=${jobOrderId}&fields=movement_id,product_id,mm_lot_id,branch_id,transaction_type_id,source_document_id,source_document_no,batch_no,quantity,remarks&limit=-1`;
}

function netStagedByKey(movements: RawRecord[]): Map<string, number> {
    const net = new Map<string, number>();
    for (const movement of movements) {
        const remarks = String(movement.remarks || "");
        const typeId = num(movement.transaction_type_id);
        const quantity = num(movement.quantity);
        const isStaging = typeId === 4 && quantity > 0 && remarks.includes(STAGING_MARKER);
        const isReturn = typeId === 4 && quantity < 0 && remarks.includes(RETURN_MARKER);
        if (!isStaging && !isReturn) continue;
        const joMaterialId = Number(parseRemarkValue(remarks, "jo_material_id") || 0);
        if (!joMaterialId) continue;
        const key = `${joMaterialId}:${num(movement.branch_id)}:${num(movement.mm_lot_id)}:${String(movement.batch_no || "").trim()}`;
        net.set(key, (net.get(key) || 0) + quantity);
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
                `/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_in]=${materialIds.join(",")}&fields=jo_materials_reservation_id,product_id,branch_id,batch_no,jo_material_id,reserved_quantity,actual_used_quantity&limit=-1`,
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
    const stagedByMaterialBatch = new Map<string, StagedEntry>();
    for (const movement of movements) {
        const remarks = String(movement.remarks || "");
        const typeId = num(movement.transaction_type_id);
        const quantity = num(movement.quantity);
        const isStaging = typeId === 4 && quantity > 0 && remarks.includes(STAGING_MARKER);
        const isReturn = typeId === 4 && quantity < 0 && remarks.includes(RETURN_MARKER);
        if (!isStaging && !isReturn) continue;

        const productId = num(movement.product_id);
        const branchId = num(movement.branch_id) || jobOrder.branchId;
        const mmLotId = num(movement.mm_lot_id) || num(movement.lot_id);
        const batchNo = String(movement.batch_no || "").trim();
        const parsedMaterialId = Number(parseRemarkValue(remarks, "jo_material_id") || 0);
        const candidateMaterials = materialIdsByProduct.get(productId) || [];
        const joMaterialId = parsedMaterialId || (candidateMaterials.length === 1 ? candidateMaterials[0] : 0);
        if (!productId || !mmLotId || !batchNo || !joMaterialId) continue;

        const key = `${joMaterialId}:${branchId}:${mmLotId}:${batchNo}`;
        let entry = stagedByKey.get(key);
        if (!entry) {
            entry = {
                key,
                joMaterialId,
                productId,
                branchId,
                mmLotId,
                batchNo,
                stagedQuantity: 0,
                sourceBin: "",
                reservationIds: []
            };
            stagedByKey.set(key, entry);
            stagedByMaterialBatch.set(`${joMaterialId}:${normalizeBatch(batchNo)}`, entry);
        }
        entry.stagedQuantity += quantity;
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
        const batchNo = String(reservation.batch_no || "").trim();
        const reserved = Math.max(0, num(reservation.reserved_quantity));
        const used = Math.max(0, num(reservation.actual_used_quantity));
        const reservationId = num(reservation.jo_materials_reservation_id);
        if (reservationId && reserved > 0) {
            reservationReleaseTargets.push({ id: reservationId, reservedQuantity: reserved });
        }
        if (reserved <= 0 && used <= 0) continue;

        const stagedEntry = stagedByKey.get(`${joMaterialId}:${branchId}:${mmLotId}:${batchNo}`)
            || stagedByMaterialBatch.get(`${joMaterialId}:${normalizeBatch(batchNo)}`)
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

        lines.push({
            joMaterialId: entry.joMaterialId,
            productId: entry.productId,
            productName: productName(entry.productId),
            uomId: num(materialById.get(entry.joMaterialId)?.uom_id),
            uomShortcut: productUomShortcut(entry.productId),
            branchId: entry.branchId,
            mmLotId: entry.mmLotId,
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
            materialReleaseTargets.push({ id: materialId, reservedQuantity });
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

function buildReturnRemarks(
    line: JobOrderMaterialReturnLine,
    jobOrder: ResolvedJobOrder,
    reason: string
): string {
    const workCenterMatch = line.sourceBin.match(/FLOOR-STAGING-(\d+)/i);
    const workCenterId = workCenterMatch ? workCenterMatch[1] : "";
    const allocationId = line.reservationIds[0] || "";
    return `${RETURN_MARKER} source_bin=${line.sourceBin};target_bin=${MAIN_STORE_BIN};work_center_id=${workCenterId};jo_material_id=${line.joMaterialId};allocation_id=${allocationId}; JO #${jobOrder.jobOrderNo}. Reason: ${reason}`;
}

async function executeCancellation(
    jobOrder: ResolvedJobOrder,
    computed: ComputedCancellation,
    options: { reason: string; actorUserId: number | null; writeStatus: boolean }
): Promise<JobOrderCancellationExecution> {
    const createdMovementIds: number[] = [];
    const reservationSnapshots: ReleaseTarget[] = [];
    const materialSnapshots: ReleaseTarget[] = [];
    let joStatusSnapshot: string | null = null;
    let statusHistoryId: number | null = null;
    let succeeded = false;

    const returnLines = computed.lines.filter(
        (line) => !line.releaseOnly && line.returnableQuantity > QUANTITY_EPSILON
    );
    const returnedQuantity = roundQuantity(returnLines.reduce((sum, line) => sum + line.returnableQuantity, 0));

    const compensate = async () => {
        const failures: string[] = [];
        for (const movementId of [...createdMovementIds].reverse()) {
            try {
                await directusDelete(`/items/inventory_movements/${movementId}`, `remove return movement ${movementId}`);
            } catch (error) {
                failures.push(`movement ${movementId}: ${errorMessage(error)}`);
            }
        }
        for (const snapshot of [...reservationSnapshots].reverse()) {
            try {
                await directusWrite(
                    `/items/manufacturing_job_order_materials_reservations/${snapshot.id}`,
                    "PATCH",
                    { reserved_quantity: snapshot.reservedQuantity },
                    `restore reservation ${snapshot.id}`
                );
            } catch (error) {
                failures.push(`reservation ${snapshot.id}: ${errorMessage(error)}`);
            }
        }
        for (const snapshot of [...materialSnapshots].reverse()) {
            try {
                await directusWrite(
                    `/items/manufacturing_job_order_materials/${snapshot.id}`,
                    "PATCH",
                    { reserved_quantity: snapshot.reservedQuantity },
                    `restore material ${snapshot.id}`
                );
            } catch (error) {
                failures.push(`material ${snapshot.id}: ${errorMessage(error)}`);
            }
        }
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
        if (options.writeStatus && joStatusSnapshot) {
            try {
                await directusWrite(
                    `/items/manufacturing_job_orders/${jobOrder.jobOrderId}`,
                    "PATCH",
                    { status: joStatusSnapshot },
                    `restore Job Order ${jobOrder.jobOrderNo} status`
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
        for (const line of returnLines) {
            const remarks = buildReturnRemarks(line, jobOrder, options.reason);
            const base: Record<string, unknown> = {
                product_id: line.productId,
                mm_lot_id: line.mmLotId,
                lot_id: null,
                branch_id: line.branchId,
                source_document_id: jobOrder.jobOrderId,
                source_document_no: jobOrder.jobOrderNo,
                batch_no: line.batchNo,
                remarks
            };
            if (options.actorUserId && options.actorUserId > 0) base.created_by = options.actorUserId;
            const movementPayloads = [
                { ...base, transaction_type_id: 4, quantity: -line.returnableQuantity },
                { ...base, transaction_type_id: 3, quantity: line.returnableQuantity }
            ];
            for (const payload of movementPayloads) {
                const created = await directusWrite<RawRecord>(
                    "/items/inventory_movements",
                    "POST",
                    payload,
                    "create the raw material return movement"
                );
                const movementId = num(created.movement_id ?? created.id);
                if (!movementId) {
                    throw new JobOrderCancellationError(
                        "The raw material return movement did not return an ID.",
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
                const key = `${line.joMaterialId}:${line.branchId}:${line.mmLotId}:${line.batchNo}`;
                if ((freshNet.get(key) ?? 0) < -QUANTITY_EPSILON) {
                    throw new JobOrderCancellationError(
                        "Another cancellation or return was processed for the same material. Refresh the Job Order and try again.",
                        409,
                        "JOB_ORDER_RETURN_CONFLICT"
                    );
                }
            }
        }

        for (const target of computed.reservationReleaseTargets) {
            if (target.reservedQuantity <= 0) continue;
            reservationSnapshots.push(target);
            await directusWrite(
                `/items/manufacturing_job_order_materials_reservations/${target.id}`,
                "PATCH",
                { reserved_quantity: 0 },
                `release reservation ${target.id}`
            );
        }
        for (const target of computed.materialReleaseTargets) {
            if (target.reservedQuantity <= 0) continue;
            materialSnapshots.push(target);
            await directusWrite(
                `/items/manufacturing_job_order_materials/${target.id}`,
                "PATCH",
                { reserved_quantity: 0 },
                `release Job Order material ${target.id}`
            );
        }

        if (options.writeStatus) {
            joStatusSnapshot = jobOrder.status;
            await directusWrite(
                `/items/manufacturing_job_orders/${jobOrder.jobOrderId}`,
                "PATCH",
                { status: JOB_ORDER_STATUS.CANCELLED },
                `cancel Job Order ${jobOrder.jobOrderNo}`
            );
            const history = await directusWrite<RawRecord>(
                "/items/manufacturing_job_order_status_history",
                "POST",
                {
                    job_order_id: jobOrder.jobOrderId,
                    old_status: jobOrder.status,
                    new_status: JOB_ORDER_STATUS.CANCELLED,
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
            || joStatusSnapshot !== null;
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
            lines: computed.lines,
            returnedQuantity,
            releasedReservationCount: computed.reservationReleaseTargets.length,
            movementCount: createdMovementIds.length,
            alreadyCancelled: !options.writeStatus
        },
        compensate: succeeded ? compensate : async () => {}
    };
}

export async function previewJobOrderCancellation(joId: string | number): Promise<JobOrderCancellationPreview> {
    const jobOrder = await fetchJobOrder(joId);
    const computed = await computeCancellation(jobOrder);
    const status = jobOrder.status;
    const cancellable = isCancellableJobOrderStatus(status) && !computed.reconciliationError;
    const canReturnMaterials = isCancelledJobOrderStatus(status)
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
        productName: `Product #${jobOrder.productId}`,
        branchId: jobOrder.branchId,
        status,
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
    actorUserId?: number | null;
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

    const computed = await computeCancellation(jobOrder);
    if (computed.reconciliationError) {
        throw new JobOrderCancellationError(
            computed.reconciliationError,
            409,
            "JOB_ORDER_RECONCILIATION_FAILED"
        );
    }

    return executeCancellation(jobOrder, computed, {
        reason: input.reason,
        actorUserId: input.actorUserId ?? null,
        writeStatus: true
    });
}

export async function returnCancelledJobOrderMaterials(input: {
    joId: string | number;
    reason?: string;
    actorUserId?: number | null;
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
        actorUserId: input.actorUserId ?? null,
        writeStatus: false
    });
}
