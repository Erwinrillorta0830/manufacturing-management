import { LotTransferError, MM_LOT_CANONICAL_REFERENCE_CODE } from "./_errors";
import { LOT_TRANSFER_DETAIL_COLLECTION, LOT_TRANSFER_SAME_LOT_CODE } from "./_config";
import {
    directusRows,
    mutateDirectus,
    readInventoryLot,
    readMmLot,
    readOptionalInventoryLot
} from "./_directus";
import type { RecordValue } from "./_directus";
import type {
    LotTransferDetail,
    LotTransferDetailInput,
    LotTransferInput,
    LotTransferRecord
} from "./_types";
import { deleteTransferDetail, mapTransferDetail } from "./_record-mappers";
import {
    lotId,
    manilaCalendarDate,
    numeric,
    rowId,
    unitId
} from "./_values";

interface CanonicalLotTransferReferences {
    sourceLotId: number;
    sourceInventoryLotId: number;
    targetLotId: number;
    targetInventoryLotId?: number;
}

interface CanonicalLotTransferResolution {
    sourceLot: RecordValue;
    targetLot: RecordValue;
}

export function assertDifferentLotIds(sourceLotId: number, targetLotId: number): void {
    if (sourceLotId === targetLotId) {
        throw new LotTransferError(
            400,
            "Source and destination lot IDs must be different.",
            { code: LOT_TRANSFER_SAME_LOT_CODE, sourceLotId, targetLotId }
        );
    }
}

export async function assertCanonicalLotReferences(input: CanonicalLotTransferReferences): Promise<CanonicalLotTransferResolution> {
    const [sourceLot, targetLot, sourceInventoryLot, targetInventoryLot] = await Promise.all([
        readMmLot(input.sourceLotId, "Source lot lookup"),
        readMmLot(input.targetLotId, "Target lot lookup"),
        readInventoryLot(input.sourceInventoryLotId, "Source inventory lot lookup"),
        readOptionalInventoryLot(input.targetInventoryLotId, "Target inventory lot lookup")
    ]);

    const sourceInventoryLotId = lotId(sourceInventoryLot.row);
    const targetInventoryLotId = targetInventoryLot ? lotId(targetInventoryLot.row) : input.targetLotId;
    if (sourceInventoryLotId !== input.sourceLotId || targetInventoryLotId !== input.targetLotId) {
        throw new LotTransferError(
            409,
            "Source and target inventory lots must reference their canonical Manufacturing Management lots.",
            {
                code: MM_LOT_CANONICAL_REFERENCE_CODE,
                sourceLotId: input.sourceLotId,
                sourceInventoryLotId: input.sourceInventoryLotId,
                resolvedSourceLotId: sourceInventoryLotId,
                targetLotId: input.targetLotId,
                targetInventoryLotId: input.targetInventoryLotId || null,
                resolvedTargetLotId: targetInventoryLotId,
                sourceLotExists: Boolean(sourceLot),
                targetLotExists: Boolean(targetLot),
                targetInventoryLotExists: Boolean(targetInventoryLot)
            }
        );
    }
    return { sourceLot, targetLot };
}

export function requireMatchingTransferUnitId(resolution: CanonicalLotTransferResolution): number {
    const sourceUnitId = unitId(resolution.sourceLot);
    const targetUnitId = unitId(resolution.targetLot);
    if (sourceUnitId === null || targetUnitId === null || sourceUnitId !== targetUnitId) {
        throw new LotTransferError(
            409,
            "Source and destination lots must have the same valid UOM before a transfer can be saved.",
            { sourceUnitId, targetUnitId }
        );
    }
    return sourceUnitId;
}

export function normalizedDetails(input: LotTransferInput): LotTransferDetailInput[] {
    const lineNumbers = new Set<number>();
    const seen = new Set<string>();
    return input.details.map((detail, index) => {
        const normalized = {
            ...detail,
            lineNo: detail.lineNo || index + 1,
            targetInventoryLotId: detail.targetInventoryLotId && detail.targetInventoryLotId > 0 ? detail.targetInventoryLotId : undefined,
            targetBatchNo: detail.targetBatchNo?.trim() || detail.sourceBatchNo.trim(),
            lineRemarks: detail.lineRemarks?.trim() || ""
        };
        if (lineNumbers.has(normalized.lineNo)) {
            throw new LotTransferError(400, `Transfer detail line ${normalized.lineNo} is duplicated. Each line must have a unique line number.`);
        }
        lineNumbers.add(normalized.lineNo);
        const identity = `${normalized.sourceInventoryLotId}:${normalized.sourceBatchNo.toLowerCase()}->${normalized.targetInventoryLotId || "AUTO"}:${normalized.targetBatchNo.toLowerCase()}`;
        if (seen.has(identity)) {
            throw new LotTransferError(400, `Transfer detail line ${normalized.lineNo} duplicates another source/target batch pair.`);
        }
        seen.add(identity);
        return normalized;
    });
}

function detailFromInput(detail: LotTransferDetailInput, index: number): LotTransferDetail {
    return {
        detailId: detail.detailId || null,
        lineNo: detail.lineNo || index + 1,
        productId: detail.productId,
        sourceInventoryLotId: detail.sourceInventoryLotId,
        sourceBatchNo: detail.sourceBatchNo,
        targetInventoryLotId: detail.targetInventoryLotId || null,
        targetBatchNo: detail.targetBatchNo || detail.sourceBatchNo,
        quantity: detail.quantity,
        lineRemarks: detail.lineRemarks || "",
        sourceManufacturingDate: null,
        sourceExpiryDate: null,
        targetManufacturingDate: null,
        targetExpiryDate: null,
        sourceUnitCost: null,
        targetUnitCost: null,
        sourceBalanceBefore: null,
        sourceBalanceAfter: null,
        targetBalanceBefore: null,
        targetBalanceAfter: null,
        sourceMovementId: null,
        targetMovementId: null,
        validationStatus: null,
        validationError: null,
        postingError: null,
        reconciliationRequired: false,
        destinationBatchAction: null
    };
}

export function transientRecordFromInput(input: LotTransferInput, transferUnitId: number | null = null): LotTransferRecord {
    const details = normalizedDetails(input).map(detailFromInput);
    const first = details[0];
    return {
        id: 0,
        requestNo: "DRAFT-PREFLIGHT",
        status: "Draft",
        branchId: input.branchId,
        productId: first.productId,
        unitId: transferUnitId,
        sourceLotId: input.sourceLotId,
        sourceInventoryLotId: first.sourceInventoryLotId,
        sourceBatchNo: first.sourceBatchNo,
        targetLotId: input.targetLotId,
        targetInventoryLotId: first.targetInventoryLotId,
        targetBatchNo: first.targetBatchNo,
        quantity: details.reduce((sum, detail) => sum + detail.quantity, 0),
        reason: input.reason,
        requestedBy: null,
        requestedByName: null,
        requestedAt: null,
        transferDate: null,
        submittedBy: null,
        submittedAt: null,
        approvedBy: null,
        approvedByName: null,
        approvedAt: null,
        postedBy: null,
        postedByName: null,
        postedAt: null,
        rejectedBy: null,
        rejectedByName: null,
        rejectedAt: null,
        rejectionReason: null,
        cancelledBy: null,
        cancelledByName: null,
        cancelledAt: null,
        cancellationReason: null,
        qaEvidence: null,
        effectiveExpiryDate: null,
        sourceUnitCost: null,
        targetUnitCost: null,
        sourceMovementId: null,
        targetMovementId: null,
        sourceBalanceBefore: null,
        sourceBalanceAfter: null,
        targetBalanceBefore: null,
        targetBalanceAfter: null,
        idempotencyKey: null,
        reversalOfId: null,
        reversalReason: null,
        reversedBy: null,
        reversedByName: null,
        reversedAt: null,
        linkedReversalId: null,
        linkedReversalRequestNo: null,
        linkedReversalStatus: null,
        linkedReversalReason: null,
        linkedReversalBy: null,
        linkedReversalByName: null,
        linkedReversalAt: null,
        postingStartedAt: null,
        reconciliationRequired: false,
        postingError: null,
        createdAt: null,
        updatedAt: null,
        details,
        lineCount: details.length,
        totalQuantity: details.reduce((sum, detail) => sum + detail.quantity, 0)
    };
}

export function transferPayload(input: LotTransferInput, actorUserId: number | null, requestNo: string, transferUnitId: number | null): RecordValue {
    const details = normalizedDetails(input);
    const first = details[0];
    return {
        request_no: requestNo,
        status: "Draft",
        branch_id: input.branchId,
        product_id: details.every((detail) => detail.productId === first.productId) ? first.productId : null,
        unit_id: transferUnitId,
        source_lot_id: input.sourceLotId,
        source_inventory_lot_id: first.sourceInventoryLotId,
        source_batch_no: first.sourceBatchNo,
        target_lot_id: input.targetLotId,
        target_inventory_lot_id: first.targetInventoryLotId ?? null,
        target_batch_no: first.targetBatchNo,
        quantity: details.reduce((sum, detail) => sum + detail.quantity, 0),
        reason: input.reason,
        requested_by: actorUserId,
        requested_at: new Date().toISOString(),
        transfer_date: manilaCalendarDate(),
        reconciliation_required: false
    };
}

export function patchPayload(input: LotTransferInput, actorUserId: number | null, requestNo: string, transferUnitId: number | null): RecordValue {
    const payload = transferPayload(input, actorUserId, requestNo, transferUnitId);
    delete payload.requested_by;
    delete payload.requested_at;
    delete payload.status;
    delete payload.request_no;
    delete payload.transfer_date;
    return payload;
}

function detailPayload(transferIdValue: number, detail: LotTransferDetailInput | LotTransferDetail, index: number): RecordValue {
    return {
        lot_transfer_id: transferIdValue,
        line_no: detail.lineNo || index + 1,
        product_id: detail.productId,
        source_inventory_lot_id: detail.sourceInventoryLotId,
        source_batch_no: detail.sourceBatchNo,
        target_inventory_lot_id: detail.targetInventoryLotId ?? null,
        target_batch_no: detail.targetBatchNo || detail.sourceBatchNo,
        quantity: detail.quantity,
        line_remarks: detail.lineRemarks || null,
        validation_status: null,
        validation_error: null,
        posting_error: null,
        reconciliation_required: false,
        destination_batch_action: null
    };
}

export async function createTransferDetail(transferIdValue: number, detail: LotTransferDetailInput | LotTransferDetail, index: number): Promise<RecordValue> {
    const row = await mutateDirectus(
        `/items/${LOT_TRANSFER_DETAIL_COLLECTION}`,
        "POST",
        detailPayload(transferIdValue, detail, index),
        "Lot-transfer detail creation"
    );
    if (!row) throw new LotTransferError(502, "Directus did not return the created lot-transfer detail.");
    return row;
}

export async function replaceTransferDetails(transferIdValue: number, details: LotTransferDetailInput[] | LotTransferDetail[], previousRows: RecordValue[] = []): Promise<void> {
    const existing = previousRows.length > 0 ? previousRows : await directusRows(
        `/items/${LOT_TRANSFER_DETAIL_COLLECTION}?filter[lot_transfer_id][_eq]=${transferIdValue}&fields=*&limit=-1`,
        "Existing lot-transfer detail lookup"
    );
    const createdIds: number[] = [];
    const deletedRows: RecordValue[] = [];
    try {
        for (const row of existing) {
            const id = rowId(row, ["lot_transfer_detail_id", "id"]);
            if (id <= 0) continue;
            await deleteTransferDetail(id);
            deletedRows.push(row);
        }
        for (let index = 0; index < details.length; index += 1) {
            const row = await createTransferDetail(transferIdValue, details[index], index);
            const id = rowId(row, ["lot_transfer_detail_id", "id"]);
            if (id <= 0) throw new LotTransferError(502, "Directus did not return the created lot-transfer detail identity.");
            createdIds.push(id);
        }
    } catch (error) {
        for (const id of createdIds.reverse()) await deleteTransferDetail(id).catch(() => undefined);
        for (let index = 0; index < deletedRows.length; index += 1) {
            await createTransferDetail(transferIdValue, {
                ...mapTransferDetail(deletedRows[index], numeric(deletedRows[index].line_no) || index + 1),
                lineNo: numeric(deletedRows[index].line_no) || index + 1
            }, index).catch(() => undefined);
        }
        throw error;
    }
}

export function generateRequestNo(): string {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `LTR-${stamp}-${suffix}`;
}
