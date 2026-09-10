import { LotTransferError } from "./_errors";
import {
    LOT_TRANSFER_COLLECTION
} from "./_config";
import { mutateDirectus } from "./_directus";
import type {
    LotTransferDetailInput,
    LotTransferInput,
    LotTransferPatchInput,
    LotTransferRecord
} from "./_types";
import {
    deleteTransferDetail,
    legacyDetailFromRecord,
    readRawTransferDetails
} from "./_record-mappers";
import {
    assertCanonicalLotReferences,
    assertDifferentLotIds,
    generateRequestNo,
    normalizedDetails,
    patchPayload,
    replaceTransferDetails,
    requireMatchingTransferUnitId,
    transferPayload
} from "./_input";
import { getLotTransfer } from "./_queries";
import { appendStatusHistory, deleteLotTransferStatusHistory } from "./_status-history";
import { manilaTimestamp, rowId, transferId } from "./_values";

export async function createLotTransfer(input: LotTransferInput, actorUserId: number | null): Promise<LotTransferRecord> {
    assertDifferentLotIds(input.sourceLotId, input.targetLotId);
    const details = normalizedDetails(input);
    const canonicalReferences = await Promise.all(details.map(async (detail) => {
        if (detail.sourceInventoryLotId === detail.targetInventoryLotId) {
            throw new LotTransferError(400, `Detail line ${detail.lineNo} must use different source and target inventory lots.`);
        }
        const canonical = await assertCanonicalLotReferences({
            sourceLotId: input.sourceLotId,
            sourceInventoryLotId: detail.sourceInventoryLotId,
            targetLotId: input.targetLotId,
            targetInventoryLotId: detail.targetInventoryLotId
        });
        return requireMatchingTransferUnitId(canonical);
    }));
    const transferUnitId = canonicalReferences.every((unit) => unit === canonicalReferences[0]) ? canonicalReferences[0] : null;
    const requestNo = generateRequestNo();
    const row = await mutateDirectus(
        `/items/${LOT_TRANSFER_COLLECTION}`,
        "POST",
        transferPayload({ ...input, details }, actorUserId, requestNo, transferUnitId),
        "Lot-transfer Draft creation"
    );
    if (!row) throw new LotTransferError(502, "Directus did not return the created lot-transfer request.");
    const id = transferId(row);
    if (!id) throw new LotTransferError(502, "Directus did not return the created lot-transfer request ID.");
    try {
        await replaceTransferDetails(id, details);
        const created = await getLotTransfer(id);
        await appendStatusHistory({
            transferId: id,
            oldStatus: null,
            newStatus: "Draft",
            changedBy: actorUserId,
            changedAt: created.requestedAt || created.createdAt || undefined,
            remarks: "Draft created."
        });
        return created;
    } catch (error) {
        await deleteLotTransferStatusHistory(id).catch(() => undefined);
        await mutateDirectus(`/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`, "DELETE", undefined, "Lot-transfer orphaned Draft compensation").catch(() => undefined);
        throw error;
    }
}

export async function updateLotTransfer(id: number, input: LotTransferPatchInput): Promise<LotTransferRecord> {
    const current = await getLotTransfer(id);
    if (current.reversalOfId !== null) {
        throw new LotTransferError(409, "Linked reversal records can only be changed by the controlled reversal operation.");
    }
    if (current.status !== "Draft") {
        throw new LotTransferError(409, "Only Draft lot-transfer requests can be edited.");
    }
    const currentDetails = current.details.length > 0 ? current.details : [legacyDetailFromRecord(current)];
    const fallbackDetails: LotTransferDetailInput[] = currentDetails.map((detail) => ({
        detailId: detail.detailId || undefined,
        lineNo: detail.lineNo,
        productId: detail.productId,
        sourceInventoryLotId: detail.sourceInventoryLotId,
        sourceBatchNo: detail.sourceBatchNo,
        targetInventoryLotId: detail.targetInventoryLotId ?? undefined,
        targetBatchNo: detail.targetBatchNo,
        quantity: detail.quantity,
        lineRemarks: detail.lineRemarks
    }));
    const normalized: LotTransferInput = {
        branchId: input.branchId ?? current.branchId,
        sourceLotId: input.sourceLotId ?? current.sourceLotId,
        targetLotId: input.targetLotId ?? current.targetLotId,
        reason: input.reason ?? current.reason,
        details: input.details || (input.productId || input.sourceInventoryLotId || input.sourceBatchNo || input.targetInventoryLotId || input.targetBatchNo || input.quantity
            ? [{
                ...fallbackDetails[0],
                productId: input.productId ?? fallbackDetails[0].productId,
                sourceInventoryLotId: input.sourceInventoryLotId ?? fallbackDetails[0].sourceInventoryLotId,
                sourceBatchNo: input.sourceBatchNo ?? fallbackDetails[0].sourceBatchNo,
                targetInventoryLotId: input.targetInventoryLotId ?? fallbackDetails[0].targetInventoryLotId,
                targetBatchNo: input.targetBatchNo ?? fallbackDetails[0].targetBatchNo,
                quantity: input.quantity ?? fallbackDetails[0].quantity
            }] : fallbackDetails)
    };
    assertDifferentLotIds(normalized.sourceLotId, normalized.targetLotId);
    const unitIds = await Promise.all(normalizedDetails(normalized).map(async (detail) => {
        if (detail.sourceInventoryLotId === detail.targetInventoryLotId) throw new LotTransferError(400, `Detail line ${detail.lineNo} must use different source and target inventory lots.`);
        return requireMatchingTransferUnitId(await assertCanonicalLotReferences({
            sourceLotId: normalized.sourceLotId,
            sourceInventoryLotId: detail.sourceInventoryLotId,
            targetLotId: normalized.targetLotId,
            targetInventoryLotId: detail.targetInventoryLotId
        }));
    }));
    const transferUnitId = unitIds.every((unit) => unit === unitIds[0]) ? unitIds[0] : null;
    const existingDetailRows = await readRawTransferDetails(id);
    const row = await mutateDirectus(
        `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
        "PATCH",
        { ...patchPayload(normalized, null, current.requestNo, transferUnitId), updated_at: manilaTimestamp() },
        "Lot-transfer Draft update"
    );
    try {
        await replaceTransferDetails(id, normalizedDetails(normalized), existingDetailRows);
    } catch (error) {
        // replaceTransferDetails restores the previous rows when a line insert fails;
        // restore the legacy header aliases as well so the Draft remains coherent.
        await mutateDirectus(
            `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
            "PATCH",
            patchPayload({
                branchId: current.branchId,
                sourceLotId: current.sourceLotId,
                targetLotId: current.targetLotId,
                reason: current.reason,
                details: fallbackDetails
            }, null, current.requestNo, current.unitId),
            "Lot-transfer Draft header compensation"
        ).catch(() => undefined);
        throw error;
    }
    return row ? getLotTransfer(id) : getLotTransfer(id);
}

export async function deleteLotTransfer(id: number): Promise<void> {
    const current = await getLotTransfer(id);
    if (current.reversalOfId !== null) {
        throw new LotTransferError(409, "Linked reversal records cannot be deleted outside the controlled reversal operation.");
    }
    if (current.status !== "Draft") {
        throw new LotTransferError(409, "Only Draft lot-transfer requests can be deleted.");
    }
    const detailRows = await readRawTransferDetails(id);
    for (const row of detailRows) {
        const detailId = rowId(row, ["lot_transfer_detail_id", "id"]);
        if (detailId > 0) await deleteTransferDetail(detailId);
    }
    await deleteLotTransferStatusHistory(id);
    await mutateDirectus(`/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`, "DELETE", undefined, "Lot-transfer Draft deletion");
}
