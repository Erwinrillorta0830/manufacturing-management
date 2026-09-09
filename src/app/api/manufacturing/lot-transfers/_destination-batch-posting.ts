import { LotTransferError } from "./_errors";
import { MM_INVENTORY_LOT_COLLECTION } from "./_directus";
import {
    mutateDirectus,
    readInventoryLot
} from "./_directus";
import {
    resolveDestinationBatch,
    sameTraceabilityDate
} from "./_destination-batch";
import type {
    DestinationBatchResolution,
    DestinationBatchResolutionAction
} from "./_destination-batch";
import {
    check,
    loadTransferContext,
    recordForDetail,
    snapshot
} from "./_preview";
import { legacyDetailFromRecord } from "./_record-mappers";
import type {
    LotTransferLinePreview,
    LotTransferPreview,
    LotTransferRecord
} from "./_types";
import {
    dateValue,
    inventoryLotId,
    lotId,
    normalizeStatus,
    normalizedBatch,
    productId
} from "./_values";

export interface EnsuredDestinationBatch {
    inventoryLotId: number;
    action: DestinationBatchResolutionAction;
    batchNo: string;
    manufacturingDate: string | null;
    expiryDate: string | null;
    qaStatus: string;
    unitCost: number | null;
    created: boolean;
}

function canonicalBatchQaStatus(value: string): string {
    return ["GOOD", "PASSED", "PASS", "APPROVED"].includes(normalizeStatus(value)) ? "GOOD" : normalizeStatus(value);
}

export async function ensureDestinationBatch(
    record: LotTransferRecord,
    line: LotTransferLinePreview,
    actorUserId: number
): Promise<EnsuredDestinationBatch> {
    const lineRecord = recordForDetail(record, {
        ...legacyDetailFromRecord(record),
        lineNo: line.lineNo,
        detailId: line.detailId,
        productId: line.productId,
        quantity: line.quantity,
        sourceInventoryLotId: line.movementPreview.sourceInventoryLotId,
        sourceBatchNo: line.movementPreview.sourceBatchNo,
        targetInventoryLotId: line.destinationBatchResolution.inventoryLotId || null,
        targetBatchNo: line.destinationBatchResolution.batchNo
    });
    const context = await loadTransferContext(lineRecord, true);
    const resolution = resolveDestinationBatch(lineRecord, context);
    if (!resolution.valid) {
        throw new LotTransferError(409, `Destination batch resolution failed for line ${line.lineNo}: ${resolution.message}`, {
            code: "LOT_TRANSFER_DESTINATION_BATCH_CONFLICT",
            lineNo: line.lineNo,
            resolution
        });
    }

    if (resolution.action === "MERGE" && resolution.inventoryLotId) {
        return {
            inventoryLotId: resolution.inventoryLotId,
            action: "MERGE",
            batchNo: resolution.batchNo,
            manufacturingDate: resolution.manufacturingDate,
            expiryDate: resolution.expiryDate,
            qaStatus: resolution.qaStatus,
            unitCost: resolution.unitCost,
            created: false
        };
    }

    try {
        const created = await mutateDirectus(
            `/items/${MM_INVENTORY_LOT_COLLECTION}`,
            "POST",
            {
                lot_id: lineRecord.targetLotId,
                branch_id: lineRecord.branchId,
                product_id: lineRecord.productId,
                batch_no: resolution.batchNo,
                manufacturing_date: resolution.manufacturingDate,
                expiry_date: resolution.expiryDate,
                unit_cost: resolution.unitCost ?? 0,
                qa_status: canonicalBatchQaStatus(resolution.qaStatus),
                status: "ACTIVE",
                source_type: "LOT_TRANSFER",
                source_reference: lineRecord.requestNo,
                remarks: `Created by lot transfer ${record.requestNo} line ${line.lineNo}`.slice(0, 255),
                created_by: actorUserId
            },
            "Destination inventory-lot batch creation"
        );
        const createdId = created ? inventoryLotId(created) : 0;
        if (!createdId) throw new LotTransferError(503, "Directus did not return the created destination batch ID.");
        const verified = await readInventoryLot(createdId, "Destination inventory-lot batch verification");
        const verifiedRow = verified.row;
        if (lotId(verifiedRow) !== lineRecord.targetLotId
            || productId(verifiedRow) !== lineRecord.productId
            || normalizedBatch(verifiedRow.batch_no) !== normalizedBatch(resolution.batchNo)
            || !sameTraceabilityDate(dateValue(verifiedRow, ["manufacturing_date", "manufacturingDate"]), resolution.manufacturingDate)
            || !sameTraceabilityDate(dateValue(verifiedRow, ["expiry_date", "expiration_date", "expiryDate"]), resolution.expiryDate)) {
            throw new LotTransferError(503, "The created destination batch failed canonical identity verification.");
        }
        return {
            inventoryLotId: createdId,
            action: "CREATE",
            batchNo: resolution.batchNo,
            manufacturingDate: resolution.manufacturingDate,
            expiryDate: resolution.expiryDate,
            qaStatus: canonicalBatchQaStatus(resolution.qaStatus),
            unitCost: resolution.unitCost,
            created: true
        };
    } catch (error) {
        if (!(error instanceof LotTransferError) || ![400, 409].includes(error.statusCode)) throw error;
        const retryContext = await loadTransferContext(lineRecord, true);
        const retryResolution = resolveDestinationBatch(lineRecord, retryContext);
        if (retryResolution.valid && retryResolution.action === "MERGE" && retryResolution.inventoryLotId) {
            return {
                inventoryLotId: retryResolution.inventoryLotId,
                action: "MERGE",
                batchNo: retryResolution.batchNo,
                manufacturingDate: retryResolution.manufacturingDate,
                expiryDate: retryResolution.expiryDate,
                qaStatus: retryResolution.qaStatus,
                unitCost: retryResolution.unitCost,
                created: false
            };
        }
        throw new LotTransferError(409, `Destination batch ${resolution.batchNo} could not be created or matched safely.`, {
            code: "LOT_TRANSFER_DESTINATION_BATCH_CONFLICT",
            lineNo: line.lineNo,
            cause: error.message,
            resolution: retryResolution
        });
    }
}

export async function deleteInventoryLot(id: number): Promise<void> {
    await mutateDirectus(
        `/items/${MM_INVENTORY_LOT_COLLECTION}/${encodeURIComponent(String(id))}`,
        "DELETE",
        undefined,
        "Destination inventory-lot batch compensation"
    );
}

export function storedPostedPreview(record: LotTransferRecord): LotTransferPreview {
    const sourceBefore = record.sourceBalanceBefore ?? 0;
    const targetBefore = record.targetBalanceBefore ?? 0;
    const sourceAfter = record.sourceBalanceAfter ?? sourceBefore - record.quantity;
    const targetAfter = record.targetBalanceAfter ?? targetBefore + record.quantity;
    const firstDetail = record.details[0];
    const postedDestinationResolution: DestinationBatchResolution = {
        action: firstDetail?.destinationBatchAction || "MERGE",
        valid: true,
        inventoryLotId: record.targetInventoryLotId,
        lotId: record.targetLotId,
        productId: record.productId || firstDetail?.productId || 0,
        batchNo: record.targetBatchNo || firstDetail?.targetBatchNo || "",
        manufacturingDate: firstDetail?.targetManufacturingDate || null,
        expiryDate: firstDetail?.targetExpiryDate || record.effectiveExpiryDate,
        qaStatus: "GOOD",
        unitCost: record.targetUnitCost,
        message: firstDetail?.destinationBatchAction === "CREATE"
            ? "A destination batch was created when this transfer was posted."
            : "The posted quantity was merged into the destination batch."
    };
    return {
        transferId: record.id,
        requestNo: record.requestNo,
        canApprove: false,
        canPost: false,
        checks: [check("posted", "Posted movement pair", true, "The source OUT and target IN references are stored on the posted audit record.")],
        source: {
            ...snapshot({
                lotId: record.sourceLotId,
                inventoryLotId: record.sourceInventoryLotId,
                batchNo: record.sourceBatchNo,
                onHandBefore: sourceBefore,
                reservedQuantity: 0,
                legacyReservedQuantity: 0,
                protectedAllocationQuantity: 0,
                protectedAllocations: [],
                protectedAllocationResolutionComplete: true,
                unitCost: record.sourceUnitCost,
                expiryDate: record.effectiveExpiryDate,
                manufacturingDate: null,
                quantityDelta: 0
            }),
            onHandAfter: sourceAfter
        },
        target: {
            ...snapshot({
                lotId: record.targetLotId,
                inventoryLotId: record.targetInventoryLotId,
                batchNo: record.targetBatchNo,
                onHandBefore: targetBefore,
                reservedQuantity: 0,
                legacyReservedQuantity: 0,
                protectedAllocationQuantity: 0,
                protectedAllocations: [],
                protectedAllocationResolutionComplete: true,
                unitCost: record.targetUnitCost,
                expiryDate: record.effectiveExpiryDate,
                manufacturingDate: null,
                quantityDelta: 0
            }),
            onHandAfter: targetAfter
        },
        sourceLotCapacity: null,
        sourceLotOccupiedBefore: sourceBefore,
        targetLotCapacity: null,
        targetLotOccupiedBefore: targetBefore,
        targetLotCapacityRemaining: null,
        effectiveExpiryDate: record.effectiveExpiryDate,
        destinationBatchResolution: postedDestinationResolution,
        allergenProfiles: { source: null, target: null },
        movementPreview: {
            sourceQuantity: -record.quantity,
            targetQuantity: record.quantity,
            sourceLotId: record.sourceLotId,
            sourceInventoryLotId: record.sourceInventoryLotId,
            sourceBatchNo: record.sourceBatchNo,
            targetLotId: record.targetLotId,
            targetInventoryLotId: record.targetInventoryLotId,
            targetBatchNo: record.targetBatchNo
        },
        linePreviews: record.details.map((detail) => ({
            detailId: detail.detailId,
            lineNo: detail.lineNo,
            productId: detail.productId,
            quantity: detail.quantity,
            lineRemarks: detail.lineRemarks,
            checks: [check(`posted-${detail.lineNo}`, `Posted line ${detail.lineNo}`, true, "The line movement references are stored on the posted audit record.")],
            source: snapshot({
                lotId: record.sourceLotId,
                inventoryLotId: detail.sourceInventoryLotId,
                batchNo: detail.sourceBatchNo,
                onHandBefore: detail.sourceBalanceBefore ?? 0,
                reservedQuantity: 0,
                legacyReservedQuantity: 0,
                protectedAllocationQuantity: 0,
                protectedAllocations: [],
                protectedAllocationResolutionComplete: true,
                unitCost: detail.sourceUnitCost,
                expiryDate: detail.sourceExpiryDate,
                manufacturingDate: detail.sourceManufacturingDate,
                quantityDelta: 0
            }),
            target: snapshot({
                lotId: record.targetLotId,
                inventoryLotId: detail.targetInventoryLotId,
                batchNo: detail.targetBatchNo,
                onHandBefore: detail.targetBalanceBefore ?? 0,
                reservedQuantity: 0,
                legacyReservedQuantity: 0,
                protectedAllocationQuantity: 0,
                protectedAllocations: [],
                protectedAllocationResolutionComplete: true,
                unitCost: detail.targetUnitCost,
                expiryDate: detail.targetExpiryDate,
                manufacturingDate: detail.targetManufacturingDate,
                quantityDelta: 0
            }),
            sourceLotCapacity: null,
            sourceLotOccupiedBefore: detail.sourceBalanceBefore ?? 0,
            targetLotCapacity: null,
            targetLotOccupiedBefore: detail.targetBalanceBefore ?? 0,
            targetLotCapacityRemaining: null,
            effectiveExpiryDate: detail.targetExpiryDate || detail.sourceExpiryDate,
            destinationBatchResolution: {
                ...postedDestinationResolution,
                inventoryLotId: detail.targetInventoryLotId,
                productId: detail.productId,
                batchNo: detail.targetBatchNo,
                manufacturingDate: detail.targetManufacturingDate,
                expiryDate: detail.targetExpiryDate || detail.sourceExpiryDate,
                unitCost: detail.targetUnitCost,
                action: detail.destinationBatchAction || "MERGE",
                message: detail.destinationBatchAction === "CREATE"
                    ? "A destination batch was created when this transfer was posted."
                    : "The posted quantity was merged into the destination batch."
            },
            movementPreview: {
                sourceQuantity: -detail.quantity,
                targetQuantity: detail.quantity,
                sourceLotId: record.sourceLotId,
                sourceInventoryLotId: detail.sourceInventoryLotId,
                sourceBatchNo: detail.sourceBatchNo,
                targetLotId: record.targetLotId,
                targetInventoryLotId: detail.targetInventoryLotId,
                targetBatchNo: detail.targetBatchNo
            }
        })),
        totalQuantity: record.totalQuantity || record.quantity
    };
}

export function applyDestinationBatchResolutions(
    preview: LotTransferPreview,
    resolutions: Map<number, EnsuredDestinationBatch>
): LotTransferPreview {
    const linePreviews = preview.linePreviews.map((line) => {
        const resolved = resolutions.get(line.lineNo);
        if (!resolved) return line;
        const destinationBatchResolution: DestinationBatchResolution = {
            ...line.destinationBatchResolution,
            action: resolved.action,
            valid: true,
            inventoryLotId: resolved.inventoryLotId,
            batchNo: resolved.batchNo,
            manufacturingDate: resolved.manufacturingDate,
            expiryDate: resolved.expiryDate,
            qaStatus: resolved.qaStatus,
            unitCost: resolved.unitCost,
            message: resolved.action === "CREATE"
                ? "A new destination batch was created when the transfer was posted."
                : "The posted quantity was merged into the existing destination batch."
        };
        return {
            ...line,
            destinationBatchResolution,
            target: {
                ...line.target,
                inventoryLotId: resolved.inventoryLotId,
                batchNo: resolved.batchNo,
                manufacturingDate: resolved.manufacturingDate,
                expiryDate: resolved.expiryDate,
                unitCost: resolved.unitCost ?? line.target.unitCost
            },
            movementPreview: {
                ...line.movementPreview,
                targetInventoryLotId: resolved.inventoryLotId,
                targetBatchNo: resolved.batchNo
            }
        };
    });
    const first = linePreviews[0];
    if (!first) return preview;
    return {
        ...preview,
        destinationBatchResolution: first.destinationBatchResolution,
        target: first.target,
        movementPreview: first.movementPreview,
        linePreviews
    };
}
