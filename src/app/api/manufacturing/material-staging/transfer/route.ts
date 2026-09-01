import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    branchProductBatchKey,
    branchProductLotBatchKey,
    normalizeBatchNo
} from "../_stock";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUANTITY_EPSILON = 0.000001;

type DirectusRecord = Record<string, unknown>;

class TransferError extends Error {
    constructor(
        message: string,
        readonly status = 502,
        readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "TransferError";
    }
}

function isActiveWorkCenter(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();
    return normalized !== "0" && normalized !== "false";
}

interface TransferTransactionState {
    allocationCreated: boolean;
    allocationId: number | null;
    previousAllocation: Record<string, unknown> | null;
    movementWriteCount: number;
    movementIds: number[];
    materialPatched: boolean;
    previousMaterial: Record<string, unknown> | null;
    jobOrderPatched: boolean;
    previousJobOrderStatus: unknown;
}

const transferPayloadSchema = z.object({
    job_order_id: z.number().int().positive(),
    job_order_no: z.string().min(1),
    jo_material_id: z.number().int().positive(),
    product_id: z.number().int().positive(),
    lot_id: z.number().int().nonnegative().default(1),
    allocation_id: z.number().int().positive().optional(),
    batch_no: z.string().min(1),
    transfer_quantity: z.number().positive("Transfer quantity must be greater than 0"),
    source_bin: z.string().default("MAIN-STORE"),
    target_bin: z.string().min(1),
    work_center_id: z.number().int().positive(),
    override_negative: z.boolean().default(false),
    remarks: z.string().optional()
}).refine(
    (payload) => !payload.override_negative || Boolean(payload.remarks?.trim()),
    { path: ["remarks"], message: "Authorization remarks are required for a negative stock override." }
);

function relationId(value: unknown, preferredKeys: string[] = []): number {
    if (typeof value === "number" || typeof value === "string") {
        const numericValue = Number(value);
        return Number.isInteger(numericValue) ? numericValue : 0;
    }

    if (!value || typeof value !== "object") return 0;

    const record = value as DirectusRecord;
    for (const key of [...preferredKeys, "id"]) {
        const numericValue = Number(record[key]);
        if (Number.isInteger(numericValue) && numericValue > 0) return numericValue;
    }

    return 0;
}

function recordId(record: DirectusRecord): number {
    return relationId(record.allocation_id ?? record.jo_materials_reservation_id ?? record.movement_id ?? record.id);
}

function compareAllocationRows(left: DirectusRecord, right: DirectusRecord): number {
    const leftCreatedAt = Date.parse(String(left.created_at ?? ""));
    const rightCreatedAt = Date.parse(String(right.created_at ?? ""));
    const safeLeftCreatedAt = Number.isFinite(leftCreatedAt) ? leftCreatedAt : Number.MAX_SAFE_INTEGER;
    const safeRightCreatedAt = Number.isFinite(rightCreatedAt) ? rightCreatedAt : Number.MAX_SAFE_INTEGER;

    if (safeLeftCreatedAt !== safeRightCreatedAt) return safeLeftCreatedAt - safeRightCreatedAt;
    return recordId(left) - recordId(right);
}

function directusErrorMessage(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== "object") return fallback;

    const record = payload as DirectusRecord;
    const errors = record.errors;
    if (Array.isArray(errors) && errors.length > 0) {
        const firstError = errors[0];
        if (firstError && typeof firstError === "object") {
            const message = (firstError as DirectusRecord).message;
            if (typeof message === "string" && message.trim()) return message;
        }
    }

    const message = record.message;
    return typeof message === "string" && message.trim() ? message : fallback;
}

async function directusRequest<T>(
    path: string,
    init: RequestInit,
    action: string,
    requireData = false
): Promise<T> {
    let response: Response;

    try {
        response = await fetch(`${DIRECTUS_URL}${path}`, init);
    } catch (error) {
        throw new TransferError(
            `${action} could not reach Directus.`,
            503,
            { cause: error instanceof Error ? error.message : String(error) }
        );
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const status = response.status === 404
            ? 404
            : response.status === 409
                ? 409
                : 503;
        throw new TransferError(
            `${action} failed: ${directusErrorMessage(payload, `Directus returned ${response.status}`)}`,
            status,
            { upstream_status: response.status }
        );
    }

    if (requireData && (!payload || typeof payload !== "object" || !("data" in payload))) {
        throw new TransferError(`${action} returned no data from Directus.`, 503);
    }

    return (payload as DirectusRecord).data as T;
}

function patchFields(record: DirectusRecord, fields: string[]): Record<string, unknown> {
    return fields.reduce<Record<string, unknown>>((result, field) => {
        result[field] = record[field] ?? null;
        return result;
    }, {});
}

function createTransactionState(): TransferTransactionState {
    return {
        allocationCreated: false,
        allocationId: null,
        previousAllocation: null,
        movementWriteCount: 0,
        movementIds: [],
        materialPatched: false,
        previousMaterial: null,
        jobOrderPatched: false,
        previousJobOrderStatus: null
    };
}

async function rollbackTransfer(
    state: TransferTransactionState,
    jobOrderId: number,
    materialId: number
): Promise<string[]> {
    const failures: string[] = [];

    if (state.jobOrderPatched) {
        try {
            await directusRequest(
                `/items/manufacturing_job_orders/${jobOrderId}`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ status: state.previousJobOrderStatus })
                },
                "Rollback Job Order status"
            );
        } catch (error) {
            failures.push(error instanceof Error ? error.message : "Rollback Job Order status failed.");
        }
    }

    if (state.materialPatched && state.previousMaterial) {
        try {
            await directusRequest(
                `/items/manufacturing_job_order_materials/${materialId}`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify(state.previousMaterial)
                },
                "Rollback material staging state"
            );
        } catch (error) {
            failures.push(error instanceof Error ? error.message : "Rollback material staging state failed.");
        }
    }

    if (state.movementWriteCount > state.movementIds.length) {
        failures.push("At least one inventory movement was created without a readable movement ID.");
    }

    for (const movementId of [...state.movementIds].reverse()) {
        try {
            await directusRequest(
                `/items/inventory_movements/${movementId}`,
                { method: "DELETE", headers },
                `Rollback inventory movement ${movementId}`
            );
        } catch (error) {
            failures.push(error instanceof Error ? error.message : `Rollback inventory movement ${movementId} failed.`);
        }
    }

    if (state.allocationCreated) {
        if (!state.allocationId) {
            failures.push("The created allocation did not return an allocation ID and cannot be rolled back automatically.");
        } else {
            try {
                await directusRequest(
                    `/items/manufacturing_job_order_materials_reservations/${state.allocationId}`,
                    { method: "DELETE", headers },
                    `Rollback staging reservation ${state.allocationId}`
                );
            } catch (error) {
                failures.push(error instanceof Error ? error.message : `Rollback staging reservation ${state.allocationId} failed.`);
            }
        }
    } else if (state.allocationId && state.previousAllocation) {
        try {
            await directusRequest(
                `/items/manufacturing_job_order_materials_reservations/${state.allocationId}`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify(state.previousAllocation)
                },
                `Rollback staging reservation ${state.allocationId}`
            );
        } catch (error) {
            failures.push(error instanceof Error ? error.message : `Rollback staging reservation ${state.allocationId} failed.`);
        }
    }

    return failures;
}

function readCookieValue(cookieHeader: string | null, name: string): string | null {
    if (!cookieHeader) return null;

    const prefix = `${name}=`;
    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(prefix));

    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

async function getUserIdFromSession(request: Request): Promise<number | null> {
    try {
        const cookieStore = await cookies();
        const token = readCookieValue(request.headers.get("cookie"), "vos_access_token") ||
            cookieStore.get("vos_access_token")?.value;
        if (token) {
            const parts = token.split(".");
            if (parts.length >= 2) {
                let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                while (base64.length % 4) base64 += "=";
                const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                const payload = JSON.parse(jsonPayload);
                const rawId = payload?.id || payload?.user_id || payload?.userId || payload?.sub;
                const parsedId = Number(rawId);
                if (Number.isInteger(parsedId) && parsedId > 0) return parsedId;
            }
        }
    } catch (e) {
        console.error("[Material Staging Transfer] Session resolution error:", e);
    }
    return null;
}

export async function POST(request: Request) {
    let transactionState: TransferTransactionState | null = null;
    let rollbackJobOrderId = 0;
    let rollbackMaterialId = 0;

    try {
        const body = await request.json();
        const parseResult = transferPayloadSchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json(
                { success: false, error: "Invalid transfer parameters", details: parseResult.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const data = parseResult.data;
        rollbackJobOrderId = data.job_order_id;
        rollbackMaterialId = data.jo_material_id;
        const userId = await getUserIdFromSession(request);
        if (!userId) {
            throw new TransferError("An authenticated user is required to stage material.", 401);
        }
        transactionState = createTransactionState();

        const jobOrder = await directusRequest<DirectusRecord>(
            `/items/manufacturing_job_orders/${data.job_order_id}?fields=job_order_id,job_order_no,branch_id,status`,
            { headers, cache: "no-store" },
            "Load Job Order",
            true
        );
        const branchId = relationId(jobOrder.branch_id, ["branch_id"]);
        const canonicalJobOrderNo = String(jobOrder.job_order_no || "").trim();
        if (!branchId) {
            throw new TransferError("The Job Order has no valid branch assigned.", 400);
        }
        if (!canonicalJobOrderNo || canonicalJobOrderNo !== data.job_order_no.trim()) {
            throw new TransferError("The supplied Job Order number does not match the selected Job Order.", 400);
        }

        const workCenterFilter = encodeURIComponent(JSON.stringify({
            work_center_id: { _eq: data.work_center_id }
        }));
        const workCenters = await directusRequest<DirectusRecord[]>(
            `/items/manufacturing_work_centers?filter=${workCenterFilter}&fields=work_center_id,work_center_name,is_active&limit=1`,
            { headers, cache: "no-store" },
            "Load target work center",
            true
        );
        const workCenter = workCenters[0];
        if (!workCenter) {
            throw new TransferError("The selected target work center does not exist.", 400);
        }
        if (!isActiveWorkCenter(workCenter.is_active)) {
            throw new TransferError("The selected target work center is inactive.", 400);
        }

        const targetBin = data.target_bin.trim();
        const expectedTargetBin = `FLOOR-STAGING-${data.work_center_id}`;
        if (targetBin !== expectedTargetBin) {
            throw new TransferError("The target staging bin must match the selected work center.", 400, {
                expected_target_bin: expectedTargetBin,
                work_center_id: data.work_center_id
            });
        }

        const material = await directusRequest<DirectusRecord>(
            `/items/manufacturing_job_order_materials/${data.jo_material_id}?fields=jo_material_id,job_order_id,product_id,reserved_quantity`,
            { headers, cache: "no-store" },
            "Load Job Order material",
            true
        );
        const materialJobOrderId = relationId(material.job_order_id, ["job_order_id"]);
        const materialProductId = relationId(material.product_id, ["product_id"]);
        if (materialJobOrderId !== data.job_order_id) {
            throw new TransferError("The material does not belong to the selected Job Order.", 400);
        }
        if (materialProductId !== data.product_id) {
            throw new TransferError("The material product does not match the selected product.", 400);
        }

        const movFilter = encodeURIComponent(JSON.stringify({
            product_id: { _eq: data.product_id }
        }));
        const movements = await directusRequest<DirectusRecord[]>(
            `/items/inventory_movements?filter=${movFilter}&fields=product_id,lot_id,branch_id,batch_no,quantity,source_document_id,transaction_type_id,remarks&limit=-1`,
            { headers, cache: "no-store" },
            "Load inventory movements",
            true
        );

        const requestedBatch = normalizeBatchNo(data.batch_no);
        const stockByBatch = new Map<string, number>();
        const stockByLotBatch = new Map<string, number>();
        const lotIdsByBatch = new Map<string, Set<number>>();
        movements.forEach((movement) => {
            if (Number(movement.branch_id) !== branchId) return;

            const quantity = Number(movement.quantity || 0);
            const lotId = Number(movement.lot_id || 0);
            if (lotId > 0) {
                const batchKey = branchProductBatchKey(branchId, data.product_id, movement.batch_no);
                stockByBatch.set(batchKey, (stockByBatch.get(batchKey) || 0) + quantity);
                const lotKey = branchProductLotBatchKey(branchId, data.product_id, lotId, movement.batch_no);
                stockByLotBatch.set(lotKey, (stockByLotBatch.get(lotKey) || 0) + quantity);
                const lotIds = lotIdsByBatch.get(batchKey) || new Set<number>();
                lotIds.add(lotId);
                lotIdsByBatch.set(batchKey, lotIds);
            }
        });

        const requestedBatchKey = branchProductBatchKey(branchId, data.product_id, requestedBatch);
        const requestedLotId = Number(data.lot_id || 0);
        const requestedLotIds = lotIdsByBatch.get(requestedBatchKey) || new Set<number>();
        const hasAmbiguousBatchLot = requestedLotId === 0 && requestedLotIds.size > 1;
        const availableStock = requestedLotId > 0
            ? stockByLotBatch.get(
                branchProductLotBatchKey(branchId, data.product_id, requestedLotId, requestedBatch)
            ) || 0
            : requestedLotIds.size === 1
                ? stockByBatch.get(requestedBatchKey) || 0
                : 0;
        const nonNegativeAvailableStock = Math.max(0, availableStock);

        if ((hasAmbiguousBatchLot || nonNegativeAvailableStock < data.transfer_quantity) && !data.override_negative) {
            const shortageQty = Math.max(0, data.transfer_quantity - nonNegativeAvailableStock);
            const failureCode = hasAmbiguousBatchLot
                ? "AMBIGUOUS_LOT"
                : "INSUFFICIENT_LOT_STOCK";
            return NextResponse.json(
                {
                    success: false,
                    shortage: true,
                    failure_code: failureCode,
                    allocation_id: data.allocation_id,
                    message: hasAmbiguousBatchLot
                        ? "The selected batch maps to multiple inventory lots; select a specific lot before staging."
                        : `Insufficient stock in the selected lot. Available: ${nonNegativeAvailableStock.toFixed(2)}, Required: ${data.transfer_quantity.toFixed(2)}, Shortage: ${shortageQty.toFixed(2)}`,
                    product_id: data.product_id,
                    lot_id: data.lot_id,
                    batch_no: data.batch_no,
                    available_quantity: nonNegativeAvailableStock,
                    required_quantity: data.transfer_quantity,
                    shortage_quantity: shortageQty,
                    source_bin: data.source_bin,
                    target_bin: targetBin
                },
                { status: 409 }
            );
        }

        const branchMovements = movements.filter((movement) =>
            Number(movement.branch_id) === branchId && Number(movement.lot_id) > 0
        );
        // A negative override may intentionally stage stock that is not currently
        // present in the Job Order branch. The movement still needs a valid lot
        // foreign key, so use an existing product lot only for that authorized path.
        const lotMovements = data.override_negative
            ? movements.filter((movement) => Number(movement.lot_id) > 0)
            : branchMovements;
        const exactBatchMovements = lotMovements
            .filter((movement) => normalizeBatchNo(movement.batch_no) === requestedBatch)
            .sort((left, right) => Number(right.quantity || 0) - Number(left.quantity || 0));
        const exactBatchMovement = exactBatchMovements[0];
        const requestedLotMovement = lotMovements.find((movement) => Number(movement.lot_id) === data.lot_id);
        const fallbackLotMovement = [...lotMovements]
            .sort((left, right) => Number(right.quantity || 0) - Number(left.quantity || 0))[0];
        const resolvedLotId = data.override_negative
            ? Number(exactBatchMovement?.lot_id || requestedLotMovement?.lot_id || fallbackLotMovement?.lot_id || 0)
            : Number(
                (data.lot_id > 0
                    ? exactBatchMovements.find((movement) => Number(movement.lot_id) === data.lot_id)
                    : exactBatchMovement
                )?.lot_id || 0
            );
        if (!resolvedLotId) {
            throw new TransferError(
                data.override_negative
                    ? "No valid inventory lot exists for this product to record the negative override."
                    : "No valid inventory lot exists for this product and Job Order branch.",
                data.override_negative ? 400 : 409,
                data.override_negative ? undefined : { failure_code: "INVALID_LOT" }
            );
        }

        const allocFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { jo_material_id: { _eq: data.jo_material_id } },
                { product_id: { _eq: data.product_id } },
                { branch_id: { _eq: branchId } }
            ]
        }));
        const allocationRows = await directusRequest<DirectusRecord[]>(
            `/items/manufacturing_job_order_materials_reservations?filter=${allocFilter}&fields=jo_materials_reservation_id,product_id,branch_id,batch_no,jo_material_id,reserved_quantity,actual_used_quantity,created_at&limit=-1`,
            { headers, cache: "no-store" },
            "Load staging reservation",
            true
        );
        const allocationGroup = allocationRows.filter((allocation) =>
            normalizeBatchNo(allocation.batch_no) === requestedBatch
        );
        const orderedAllocationGroup = [...allocationGroup].sort(compareAllocationRows);
        const existingAllocations = data.allocation_id
            ? orderedAllocationGroup.filter((allocation) => recordId(allocation) === data.allocation_id)
            : orderedAllocationGroup;
        if (data.allocation_id && existingAllocations.length !== 1) {
            throw new TransferError(
                "The selected staging allocation does not belong to this Job Order material and batch.",
                409,
                { failure_code: "INVALID_ALLOCATION", allocation_id: data.allocation_id }
            );
        }
        if (!data.allocation_id && existingAllocations.length > 1) {
            throw new TransferError(
                "Multiple staging reservations exist for the same Job Order material and batch; select a specific allocation before staging more stock.",
                409,
                { failure_code: "AMBIGUOUS_ALLOCATION", batch_no: data.batch_no }
            );
        }

        const existingAllocation = existingAllocations[0] || null;
        const existingAllocationQuantity = Number(existingAllocation?.reserved_quantity || 0);
        const currentReservedQuantity = Number(material.reserved_quantity || 0);
        if (!Number.isFinite(existingAllocationQuantity) || existingAllocationQuantity < 0 || !Number.isFinite(currentReservedQuantity) || currentReservedQuantity < 0) {
            throw new TransferError("The existing staging quantities are invalid.", 503);
        }

        const stagedQuantityForBatch = movements.reduce((total, movement) => {
            const isStagingMovement = Number(movement.source_document_id) === data.job_order_id &&
                Number(movement.transaction_type_id) === 4 &&
                normalizeBatchNo(movement.batch_no) === requestedBatch &&
                String(movement.remarks || "").includes("[MM-MATERIAL-STAGING]");
            return isStagingMovement ? total + Math.max(0, Number(movement.quantity || 0)) : total;
        }, 0);
        let stagedQuantityRemaining = stagedQuantityForBatch;
        const stagedQuantityByAllocation = new Map<number, number>();
        orderedAllocationGroup.forEach((allocation) => {
            const allocationId = recordId(allocation);
            const reservedQuantity = Math.max(0, Number(allocation.reserved_quantity || 0));
            const assignedQuantity = Math.min(stagedQuantityRemaining, reservedQuantity);
            if (allocationId) stagedQuantityByAllocation.set(allocationId, assignedQuantity);
            stagedQuantityRemaining = Math.max(0, stagedQuantityRemaining - assignedQuantity);
        });
        const selectedAllocationId = existingAllocation ? recordId(existingAllocation) : 0;
        const selectedStagedQuantity = selectedAllocationId
            ? stagedQuantityByAllocation.get(selectedAllocationId) || 0
            : 0;
        const allocationCapacity = data.allocation_id
            ? Math.max(0, existingAllocationQuantity - selectedStagedQuantity)
            : orderedAllocationGroup.reduce(
                (total, allocation) => total + Math.max(0, Number(allocation.reserved_quantity || 0)),
                0
            ) - stagedQuantityForBatch;
        if (orderedAllocationGroup.length > 0 && !data.override_negative && data.transfer_quantity > Math.max(0, allocationCapacity) + 0.000001) {
            const availableQuantity = Math.max(0, Math.min(nonNegativeAvailableStock, allocationCapacity));
            const shortageQuantity = Math.max(0, data.transfer_quantity - availableQuantity);
            return NextResponse.json(
                {
                    success: false,
                    shortage: true,
                    failure_code: "INSUFFICIENT_ALLOCATION_CAPACITY",
                    message: `${data.allocation_id ? "The selected allocation" : "The selected allocation group"} has ${Math.max(0, allocationCapacity).toFixed(2)} available to stage. Required: ${data.transfer_quantity.toFixed(2)}, Shortage: ${shortageQuantity.toFixed(2)}`,
                    product_id: data.product_id,
                    lot_id: data.lot_id,
                    allocation_id: data.allocation_id,
                    batch_no: data.batch_no,
                    available_quantity: availableQuantity,
                    required_quantity: data.transfer_quantity,
                    shortage_quantity: shortageQuantity,
                    source_bin: data.source_bin,
                    target_bin: targetBin
                },
                { status: 409 }
            );
        }

        if (existingAllocation) {
            transactionState.allocationId = recordId(existingAllocation);
            if (!transactionState.allocationId) {
                throw new TransferError("The existing staging allocation has no readable ID.", 503);
            }
            transactionState.previousAllocation = patchFields(existingAllocation, [
                "reserved_quantity"
            ]);
            await directusRequest<DirectusRecord>(
                `/items/manufacturing_job_order_materials_reservations/${transactionState.allocationId}`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        reserved_quantity: existingAllocationQuantity + data.transfer_quantity
                    })
                },
                "Update staging reservation",
                true
            );
        } else {
            const createdAllocation = await directusRequest<DirectusRecord>(
                "/items/manufacturing_job_order_materials_reservations",
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        product_id: data.product_id,
                        branch_id: branchId,
                        batch_no: data.batch_no,
                        jo_material_id: data.jo_material_id,
                        reserved_quantity: data.transfer_quantity,
                        actual_used_quantity: 0,
                        created_by: userId
                    })
                },
                "Create staging reservation",
                true
            );
            transactionState.allocationCreated = true;
            transactionState.allocationId = recordId(createdAllocation);
            if (!transactionState.allocationId) {
                throw new TransferError("The created staging allocation did not return an ID.", 503);
            }
        }

        const transferRemarks = `${data.override_negative ? "[NEGATIVE OVERRIDE] " : ""}[MM-MATERIAL-STAGING] source_bin=${data.source_bin};target_bin=${targetBin};work_center_id=${data.work_center_id};jo_material_id=${data.jo_material_id};allocation_id=${transactionState.allocationId}; JO #${canonicalJobOrderNo}. Note: ${data.remarks || (data.override_negative ? "Authorized floor hold override" : "Standard staging")}`;

        const movementPayloads = [
            {
                product_id: data.product_id,
                lot_id: resolvedLotId,
                branch_id: branchId,
                transaction_type_id: 3,
                source_document_id: data.job_order_id,
                source_document_no: canonicalJobOrderNo,
                batch_no: data.batch_no,
                quantity: -data.transfer_quantity,
                created_by: userId,
                remarks: transferRemarks
            },
            {
                product_id: data.product_id,
                lot_id: resolvedLotId,
                branch_id: branchId,
                transaction_type_id: 4,
                source_document_id: data.job_order_id,
                source_document_no: canonicalJobOrderNo,
                batch_no: data.batch_no,
                quantity: data.transfer_quantity,
                created_by: userId,
                remarks: transferRemarks
            }
        ];

        for (const movementPayload of movementPayloads) {
            const createdMovement = await directusRequest<DirectusRecord>(
                "/items/inventory_movements",
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify(movementPayload)
                },
                "Create inventory movement",
                true
            );
            transactionState.movementWriteCount += 1;
            const movementId = recordId(createdMovement);
            if (!movementId) {
                throw new TransferError("The created inventory movement did not return an ID.", 503);
            }
            transactionState.movementIds.push(movementId);
        }

        for (const [index, movementId] of transactionState.movementIds.entries()) {
            const verifiedMovement = await directusRequest<DirectusRecord>(
                `/items/inventory_movements/${movementId}?fields=product_id,lot_id,branch_id,transaction_type_id,source_document_id,source_document_no,batch_no,quantity,remarks`,
                { headers, cache: "no-store" },
                "Verify inventory movement",
                true
            );
            const expectedMovement = movementPayloads[index];
            if (
                relationId(verifiedMovement.product_id, ["product_id"]) !== data.product_id ||
                Number(verifiedMovement.lot_id) !== resolvedLotId ||
                Number(verifiedMovement.branch_id) !== branchId ||
                Number(verifiedMovement.transaction_type_id) !== expectedMovement.transaction_type_id ||
                Number(verifiedMovement.source_document_id) !== data.job_order_id ||
                String(verifiedMovement.batch_no || "") !== data.batch_no ||
                Math.abs(Number(verifiedMovement.quantity) - expectedMovement.quantity) > QUANTITY_EPSILON
            ) {
                throw new TransferError("The inventory movement could not be verified after saving.", 503);
            }
        }

        transactionState.previousMaterial = patchFields(material, ["reserved_quantity"]);
        await directusRequest<DirectusRecord>(
            `/items/manufacturing_job_order_materials/${data.jo_material_id}`,
            {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    reserved_quantity: currentReservedQuantity + data.transfer_quantity
                })
            },
            "Update material staging state",
            true
        );
        transactionState.materialPatched = true;

        const allMaterials = await directusRequest<DirectusRecord[]>(
            `/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${data.job_order_id}&fields=jo_material_id,product_id,allocated_quantity&limit=-1`,
            { headers, cache: "no-store" },
            "Validate Job Order staging state",
            true
        );
        const allJobOrderReservations = await directusRequest<DirectusRecord[]>(
            `/items/manufacturing_job_order_materials_reservations?filter[branch_id][_eq]=${branchId}&fields=product_id,batch_no,jo_material_id,reserved_quantity&limit=-1`,
            { headers, cache: "no-store" },
            "Validate Job Order staging reservations",
            true
        );
        const jobOrderMovementFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { source_document_id: { _eq: data.job_order_id } },
                { branch_id: { _eq: branchId } },
                { transaction_type_id: { _eq: 4 } }
            ]
        }));
        const allJobOrderMovements = await directusRequest<DirectusRecord[]>(
            `/items/inventory_movements?filter=${jobOrderMovementFilter}&fields=product_id,batch_no,quantity,remarks&limit=-1`,
            { headers, cache: "no-store" },
            "Validate Job Order staging movements",
            true
        );
        const stagedQuantityByProductBatch = new Map<string, number>();
        allJobOrderMovements.forEach((movement) => {
            if (!String(movement.remarks || "").includes("[MM-MATERIAL-STAGING]")) return;
            const productId = relationId(movement.product_id, ["product_id"]);
            const batchNo = String(movement.batch_no || "").trim().toLowerCase();
            const quantity = Number(movement.quantity || 0);
            if (productId && batchNo && quantity > 0) {
                const key = `${productId}:${batchNo}`;
                stagedQuantityByProductBatch.set(key, (stagedQuantityByProductBatch.get(key) || 0) + quantity);
            }
        });
        const allHard = allMaterials.length > 0 && allMaterials.every((materialRow) => {
            const materialId = relationId(materialRow.jo_material_id, ["jo_material_id"]);
            const productId = relationId(materialRow.product_id, ["product_id"]);
            const requiredQuantity = Number(materialRow.allocated_quantity || 0);
            const hardReservedQuantity = allJobOrderReservations
                .filter((reservation) => relationId(reservation.jo_material_id, ["jo_material_id"]) === materialId)
                .reduce((total, reservation) => {
                    const batchNo = normalizeBatchNo(reservation.batch_no);
                    const key = `${productId}:${batchNo}`;
                    return stagedQuantityByProductBatch.has(key)
                        ? total + Number(reservation.reserved_quantity || 0)
                        : total;
                }, 0);
            return requiredQuantity <= 0 || hardReservedQuantity >= requiredQuantity;
        });

        if (allHard && jobOrder.status !== "RESERVED") {
            transactionState.previousJobOrderStatus = jobOrder.status ?? null;
            await directusRequest<DirectusRecord>(
                `/items/manufacturing_job_orders/${data.job_order_id}`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ status: "RESERVED" })
                },
                "Update Job Order staging status",
                true
            );
            transactionState.jobOrderPatched = true;
        }

        const verifiedAllocations = data.allocation_id
            ? [await directusRequest<DirectusRecord>(
                `/items/manufacturing_job_order_materials_reservations/${data.allocation_id}?fields=jo_materials_reservation_id,product_id,branch_id,batch_no,jo_material_id,reserved_quantity`,
                { headers, cache: "no-store" },
                "Verify staging reservation",
                true
            )]
            : await directusRequest<DirectusRecord[]>(
                `/items/manufacturing_job_order_materials_reservations?filter=${encodeURIComponent(JSON.stringify({
                    _and: [
                        { jo_material_id: { _eq: data.jo_material_id } },
                        { product_id: { _eq: data.product_id } },
                        { branch_id: { _eq: branchId } },
                        { batch_no: { _eq: data.batch_no } }
                    ]
                }))}&fields=jo_materials_reservation_id,product_id,branch_id,batch_no,jo_material_id,reserved_quantity&limit=-1`,
                { headers, cache: "no-store" },
                "Verify staging reservation",
                true
            );
        const verifiedAllocation = verifiedAllocations[0];
        if (
            verifiedAllocations.length !== 1 ||
            Math.abs(
                Number(verifiedAllocation?.reserved_quantity || 0) -
                (existingAllocationQuantity + data.transfer_quantity)
            ) > QUANTITY_EPSILON
        ) {
            throw new TransferError("The staging reservation could not be verified after saving.", 503);
        }

        const verifiedMaterial = await directusRequest<DirectusRecord>(
            `/items/manufacturing_job_order_materials/${data.jo_material_id}?fields=reserved_quantity`,
            { headers, cache: "no-store" },
            "Verify material staging state",
            true
        );
        if (
            Math.abs(
                Number(verifiedMaterial.reserved_quantity || 0) -
                (currentReservedQuantity + data.transfer_quantity)
            ) > QUANTITY_EPSILON
        ) {
            throw new TransferError("The material staging state could not be verified after saving.", 503);
        }

        return NextResponse.json({
            success: true,
            message: `Material successfully staged to ${targetBin}. Allocation status updated to HARD (RESERVED / READY).`,
            data: {
                job_order_id: data.job_order_id,
                jo_material_id: data.jo_material_id,
                product_id: data.product_id,
                branch_id: branchId,
                lot_id: resolvedLotId,
                batch_no: data.batch_no,
                target_bin: targetBin,
                work_center_id: data.work_center_id,
                transfer_quantity: data.transfer_quantity,
                reservation_status: "HARD",
                allocation_id: transactionState.allocationId,
                movement_ids: transactionState.movementIds,
                override_negative: data.override_negative
            }
        });
    } catch (error) {
        const transferError = error instanceof TransferError
            ? error
            : new TransferError(error instanceof Error ? error.message : "Failed to execute bin transfer", 500);
        let rollbackFailures: string[] = [];

        if (transactionState) {
            rollbackFailures = await rollbackTransfer(transactionState, rollbackJobOrderId, rollbackMaterialId);
        }

        console.error("[Material Staging Transfer API] Failed:", transferError, { rollbackFailures });
        return NextResponse.json(
            {
                success: false,
                error: transferError.message,
                ...(transferError.details || {}),
                ...(rollbackFailures.length > 0
                    ? { reconciliation_required: true, rollback_failures: rollbackFailures }
                    : {})
            },
            { status: rollbackFailures.length > 0 ? 502 : transferError.status }
        );
    }
}
