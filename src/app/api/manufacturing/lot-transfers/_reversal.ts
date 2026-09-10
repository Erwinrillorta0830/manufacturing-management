import { LotTransferError } from "./_errors";
import {
    LOT_TRANSFER_COLLECTION,
    LOT_TRANSFER_DETAIL_COLLECTION,
    LOT_TRANSFER_EPSILON,
    LOT_TRANSFER_REVERSAL_SOURCE_OUT_TYPE,
    LOT_TRANSFER_REVERSAL_TARGET_IN_TYPE,
    LOT_TRANSFER_SOURCE_OUT_TYPE,
    LOT_TRANSFER_TARGET_IN_TYPE
} from "./_config";
import { mutateDirectus } from "./_directus";
import type { RecordValue } from "./_directus";
import type {
    LotTransferDetail,
    LotTransferInput,
    LotTransferPreview,
    LotTransferRecord
} from "./_types";
import {
    deleteTransferDetail,
    legacyDetailFromRecord,
    readLinkedReversals,
    readRawTransferDetails
} from "./_record-mappers";
import {
    assertDifferentLotIds,
    createTransferDetail,
    generateRequestNo,
    normalizedDetails,
    transferPayload,
    transientRecordFromInput
} from "./_input";
import {
    createInventoryMovement,
    deleteInventoryMovement,
    findTransferMovements,
    isTransferMovement,
    resolveMovementType,
    verifyInventoryMovements
} from "./_movement-operations";
import { storedPostedPreview } from "./_destination-batch-posting";
import { buildLotTransferPreview, recordForDetail } from "./_preview";
import { requireSessionUserId } from "./_session";
import { getLotTransfer } from "./_queries";
import { appendStatusHistory, deleteLotTransferStatusHistory, transitionLotTransferStatus } from "./_status-history";
import {
    movementId,
    movementTransactionTypeId,
    manilaTimestamp,
    numeric,
    rowId,
    transferId
} from "./_values";
import { failedPreviewChecks } from "./_workflow";

interface PostedMovementPair {
    detail: LotTransferDetail;
    sourceMovementId: number;
    targetMovementId: number;
}

async function assertPostedMovementPairs(record: LotTransferRecord): Promise<PostedMovementPair[]> {
    const [sourceTypeId, targetTypeId] = await Promise.all([
        resolveMovementType(LOT_TRANSFER_SOURCE_OUT_TYPE, "OUT"),
        resolveMovementType(LOT_TRANSFER_TARGET_IN_TYPE, "IN")
    ]);
    const details = record.details.length > 0 ? record.details : [legacyDetailFromRecord(record)];
    const existingMovements = await findTransferMovements(record.id, record.requestNo);
    const matchedMovementIds = new Set<number>();
    const pairs: PostedMovementPair[] = [];

    for (const detail of details) {
        const lineRecord = recordForDetail(record, detail);
        const lineRows = detail.detailId
            ? existingMovements.filter((row) => numeric(row.source_document_detail_id) === detail.detailId)
            : existingMovements.filter((row) => isTransferMovement(row, lineRecord, "source") || isTransferMovement(row, lineRecord, "target"));
        const sourceMatches = lineRows.filter((row) => isTransferMovement(row, lineRecord, "source") && movementTransactionTypeId(row) === sourceTypeId);
        const targetMatches = lineRows.filter((row) => isTransferMovement(row, lineRecord, "target") && movementTransactionTypeId(row) === targetTypeId);
        if (sourceMatches.length !== 1 || targetMatches.length !== 1 || lineRows.length !== 2) {
            throw new LotTransferError(503, `Posted transfer detail line ${detail.lineNo} does not have exactly one canonical OUT/IN movement pair; reversal is blocked for reconciliation.`);
        }

        const sourceMovementId = movementId(sourceMatches[0]);
        const targetMovementId = movementId(targetMatches[0]);
        if (!sourceMovementId || !targetMovementId || matchedMovementIds.has(sourceMovementId) || matchedMovementIds.has(targetMovementId)) {
            throw new LotTransferError(503, `Posted transfer detail line ${detail.lineNo} has duplicate or missing movement IDs; reversal is blocked for reconciliation.`);
        }
        if (detail.sourceMovementId && detail.sourceMovementId !== sourceMovementId) {
            throw new LotTransferError(503, `Posted transfer detail line ${detail.lineNo} has a mismatched source movement reference.`);
        }
        if (detail.targetMovementId && detail.targetMovementId !== targetMovementId) {
            throw new LotTransferError(503, `Posted transfer detail line ${detail.lineNo} has a mismatched target movement reference.`);
        }
        matchedMovementIds.add(sourceMovementId);
        matchedMovementIds.add(targetMovementId);
        pairs.push({ detail, sourceMovementId, targetMovementId });
    }

    if (existingMovements.length !== matchedMovementIds.size) {
        throw new LotTransferError(503, "The posted transfer has extra or unpaired movement rows; reversal is blocked for reconciliation.");
    }
    if (details.length === 1) {
        const pair = pairs[0];
        if (record.sourceMovementId && record.sourceMovementId !== pair.sourceMovementId) {
            throw new LotTransferError(503, "The posted source movement reference does not match the verified pair.");
        }
        if (record.targetMovementId && record.targetMovementId !== pair.targetMovementId) {
            throw new LotTransferError(503, "The posted target movement reference does not match the verified pair.");
        }
    }
    return pairs;
}

function reversalInputFromRecord(record: LotTransferRecord, reversalReason: string): LotTransferInput {
    const details = record.details.length > 0 ? record.details : [legacyDetailFromRecord(record)];
    if (details.some((detail) => !detail.targetInventoryLotId)) {
        throw new LotTransferError(409, "Posted lot-transfer details must have a resolved destination batch before reversal.");
    }
    return {
        branchId: record.branchId,
        sourceLotId: record.targetLotId,
        targetLotId: record.sourceLotId,
        reason: `Reversal of ${record.requestNo}: ${reversalReason}`.slice(0, 2000),
        details: details.map((detail) => ({
            lineNo: detail.lineNo,
            productId: detail.productId,
            sourceInventoryLotId: detail.targetInventoryLotId as number,
            sourceBatchNo: detail.targetBatchNo,
            targetInventoryLotId: detail.sourceInventoryLotId,
            targetBatchNo: detail.sourceBatchNo,
            quantity: detail.quantity,
            lineRemarks: `Reversal of ${record.requestNo} line ${detail.lineNo}: ${reversalReason}`.slice(0, 2000)
        }))
    };
}

function reversalHeaderPayload(
    original: LotTransferRecord,
    input: LotTransferInput,
    preview: LotTransferPreview,
    reversalReason: string,
    requestNo: string,
    idempotencyKey: string,
    actorUserId: number
): RecordValue {
    const details = normalizedDetails(input);
    const first = details[0];
    const singleLine = details.length === 1 ? preview.linePreviews[0] : null;
    return {
        ...transferPayload(input, actorUserId, requestNo, original.unitId),
        status: "Draft",
        reversal_of_id: original.id,
        reversal_reason: reversalReason,
        approved_by: null,
        approved_at: null,
        posted_by: null,
        posted_at: null,
        source_unit_cost: singleLine?.source.unitCost ?? null,
        target_unit_cost: singleLine?.target.unitCost ?? null,
        effective_expiry_date: preview.effectiveExpiryDate,
        source_movement_id: null,
        target_movement_id: null,
        source_balance_before: singleLine?.source.onHandBefore ?? null,
        source_balance_after: singleLine?.source.onHandAfter ?? null,
        target_balance_before: singleLine?.target.onHandBefore ?? null,
        target_balance_after: singleLine?.target.onHandAfter ?? null,
        idempotency_key: idempotencyKey,
        posting_started_at: null,
        reconciliation_required: false,
        posting_error: null,
        reversed_by: null,
        reversed_at: null,
        product_id: details.every((detail) => detail.productId === first.productId) ? first.productId : null
    };
}

async function deleteTransferHeaderAndDetails(id: number): Promise<void> {
    const rows = await readRawTransferDetails(id);
    for (const row of rows) {
        const detailId = rowId(row, ["lot_transfer_detail_id", "id"]);
        if (detailId > 0) await deleteTransferDetail(detailId);
    }
    await deleteLotTransferStatusHistory(id);
    await mutateDirectus(`/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`, "DELETE", undefined, "Lot-transfer reversal header compensation");
}

function verifyReversalMovement(
    row: RecordValue,
    record: LotTransferRecord,
    detail: LotTransferDetail,
    side: "source" | "target",
    transactionTypeId: number
): boolean {
    const lineRecord = recordForDetail(record, detail);
    return movementTransactionTypeId(row) === transactionTypeId
        && numeric(row.source_document_detail_id) === detail.detailId
        && isTransferMovement(row, lineRecord, side);
}

async function verifyReversalMovementPairs(record: LotTransferRecord, expectedIds: number[]): Promise<void> {
    const [sourceTypeId, targetTypeId] = await Promise.all([
        resolveMovementType(LOT_TRANSFER_REVERSAL_SOURCE_OUT_TYPE, "OUT"),
        resolveMovementType(LOT_TRANSFER_REVERSAL_TARGET_IN_TYPE, "IN")
    ]);
    const verified = await verifyInventoryMovements(expectedIds);
    const verifiedIds = new Set(verified.map((row) => movementId(row)));
    if (verified.length !== expectedIds.length || expectedIds.some((id) => !verifiedIds.has(id))) {
        throw new LotTransferError(503, "One or more reversal movement rows could not be verified after insertion.");
    }

    const details = record.details.length > 0 ? record.details : [legacyDetailFromRecord(record)];
    const used = new Set<number>();
    for (const detail of details) {
        if (!detail.detailId) throw new LotTransferError(503, `Reversal detail line ${detail.lineNo} has no durable detail ID.`);
        const rows = verified.filter((row) => numeric(row.source_document_detail_id) === detail.detailId);
        const sourceRows = rows.filter((row) => verifyReversalMovement(row, record, detail, "source", sourceTypeId));
        const targetRows = rows.filter((row) => verifyReversalMovement(row, record, detail, "target", targetTypeId));
        if (rows.length !== 2 || sourceRows.length !== 1 || targetRows.length !== 1) {
            throw new LotTransferError(503, `Reversal detail line ${detail.lineNo} does not have exactly one verified compensating OUT/IN pair.`);
        }
        for (const row of rows) {
            const rowMovementId = movementId(row);
            if (!rowMovementId || used.has(rowMovementId)) throw new LotTransferError(503, "Reversal movement verification found a duplicate movement ID.");
            used.add(rowMovementId);
        }
    }
}

function reversalDetailsMatch(record: LotTransferRecord, input: LotTransferInput): boolean {
    const expectedDetails = normalizedDetails(input);
    if (record.details.length !== expectedDetails.length) return false;
    return expectedDetails.every((expected, index) => {
        const lineNo = expected.lineNo || index + 1;
        const actual = record.details.find((detail) => detail.lineNo === lineNo);
        return Boolean(actual)
            && actual?.productId === expected.productId
            && actual.sourceInventoryLotId === expected.sourceInventoryLotId
            && actual.sourceBatchNo === expected.sourceBatchNo
            && actual.targetInventoryLotId === expected.targetInventoryLotId
            && actual.targetBatchNo === expected.targetBatchNo
            && Math.abs(actual.quantity - expected.quantity) <= LOT_TRANSFER_EPSILON;
    });
}

export async function reverseLotTransfer(
    id: number,
    reversalReason: string,
    idempotencyKey: string,
    actorUserId: number | null
): Promise<{ original: LotTransferRecord; reversal: LotTransferRecord; preview: LotTransferPreview; idempotent: boolean }> {
    const actor = requireSessionUserId(actorUserId, "reverse a lot-transfer request");
    const original = await getLotTransfer(id);
    if (original.status !== "Posted") {
        throw new LotTransferError(409, `Only Posted lot-transfer requests can be reversed. Current status: ${original.status}.`);
    }
    if (original.reconciliationRequired) {
        throw new LotTransferError(409, "This posted transfer requires reconciliation before it can be reversed.");
    }

    const reason = reversalReason.trim();
    if (!reason) throw new LotTransferError(400, "A reversal reason is required.");
    if (reason.length > 5000) throw new LotTransferError(400, "The reversal reason must be 5000 characters or fewer.");
    const input = reversalInputFromRecord(original, reason);
    assertDifferentLotIds(input.sourceLotId, input.targetLotId);
    await assertPostedMovementPairs(original);
    const links = await readLinkedReversals([original.id], false);
    const linked = links.get(original.id);
    let reversal: LotTransferRecord | null = linked ? await getLotTransfer(linked.id) : null;
    let createdHeader = false;
    let reversalFinalized = false;
    let reversalId: number | null = reversal?.id || null;
    const createdMovementIds: number[] = [];
    const detailAuditIds: number[] = [];

    if (reversal?.status === "Reversed") {
        if (reversal.idempotencyKey !== idempotencyKey) {
            throw new LotTransferError(409, `This transfer has already been reversed as ${reversal.requestNo}.`);
        }
        return {
            original,
            reversal,
            preview: storedPostedPreview(reversal),
            idempotent: true
        };
    }
    if (reversal) {
        if (reversal.idempotencyKey !== idempotencyKey) {
            throw new LotTransferError(409, `A reversal operation is already associated with ${reversal.requestNo}.`);
        }
        if (reversal.reconciliationRequired) {
            throw new LotTransferError(503, "The existing reversal requires reconciliation before it can be retried.");
        }
        const existingReversalMovements = await findTransferMovements(reversal.id, reversal.requestNo);
        const existingReferences = [
            reversal.sourceMovementId,
            reversal.targetMovementId,
            ...reversal.details.flatMap((detail) => [detail.sourceMovementId, detail.targetMovementId])
        ].filter((movementIdValue): movementIdValue is number => Boolean(movementIdValue && movementIdValue > 0));
        if (existingReversalMovements.length > 0 || existingReferences.length > 0) {
            throw new LotTransferError(503, "The existing reversal contains partial movement effects and requires reconciliation.");
        }
        if (reversal.details.length > 0 && !reversalDetailsMatch(reversal, input)) {
            throw new LotTransferError(503, "The existing reversal detail lines do not match the original transfer and require reconciliation.");
        }
    }

    const preflight = await buildLotTransferPreview(transientRecordFromInput(input, original.unitId));
    if (!preflight.canPost) {
        throw new LotTransferError(409, "The posted transfer failed the required reversal checks.", {
            failedChecks: failedPreviewChecks(preflight)
        });
    }

    let preview: LotTransferPreview = preflight;
    try {
        if (!reversal) {
            const requestNo = generateRequestNo();
            const row = await mutateDirectus(
                `/items/${LOT_TRANSFER_COLLECTION}`,
                "POST",
                reversalHeaderPayload(original, input, preflight, reason, requestNo, idempotencyKey, actor),
                "Lot-transfer reversal creation"
            );
            reversalId = row ? transferId(row) : 0;
            if (!reversalId) throw new LotTransferError(503, "Directus did not return the created reversal transfer ID.");
            createdHeader = true;
            reversal = await getLotTransfer(reversalId);
            await appendStatusHistory({
                transferId: reversal.id,
                oldStatus: null,
                newStatus: "Draft",
                changedBy: actor,
                changedAt: reversal.createdAt || reversal.requestedAt || undefined,
                remarks: `Reversal draft created for ${original.requestNo}.`
            });
        }

        if (!reversal || reversal.status !== "Draft" || reversal.reversalOfId !== original.id) {
            throw new LotTransferError(503, "The reversal record is not a valid linked Draft reversal.");
        }
        const startedAt = manilaTimestamp();
        await mutateDirectus(
            `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(reversal.id))}`,
            "PATCH",
            {
                idempotency_key: idempotencyKey,
                posting_started_at: startedAt,
                reversal_reason: reason,
                posting_error: null,
                reconciliation_required: false,
                updated_at: startedAt
            },
            "Lot-transfer reversal claim"
        );

        const existingReversalDetails = await readRawTransferDetails(reversal.id);
        if (existingReversalDetails.length === 0) {
            const details = normalizedDetails(input);
            for (let index = 0; index < details.length; index += 1) {
                const row = await createTransferDetail(reversal.id, details[index], index);
                const detailId = rowId(row, ["lot_transfer_detail_id", "id"]);
                if (!detailId) throw new LotTransferError(503, "Directus did not return a created reversal detail ID.");
            }
        }

        reversal = await getLotTransfer(reversal.id);
        preview = await buildLotTransferPreview(reversal, { excludeTransferMovements: true });
        if (!preview.canPost) {
            throw new LotTransferError(409, "The reversal failed the final server-side validation checks.", {
                failedChecks: failedPreviewChecks(preview)
            });
        }
        const details = reversal.details.length > 0 ? reversal.details : [legacyDetailFromRecord(reversal)];
        if (details.some((detail) => !detail.detailId)) {
            throw new LotTransferError(503, "Every reversal detail must have a durable ID before movements are created.");
        }
        const sourceTypeId = await resolveMovementType(LOT_TRANSFER_REVERSAL_SOURCE_OUT_TYPE, "OUT");
        const targetTypeId = await resolveMovementType(LOT_TRANSFER_REVERSAL_TARGET_IN_TYPE, "IN");
        const pairs: PostedMovementPair[] = [];

        for (const detail of details) {
            const line = preview.linePreviews.find((item) => item.detailId === detail.detailId || item.lineNo === detail.lineNo);
            if (!line || !detail.detailId) throw new LotTransferError(503, `Reversal validation result for line ${detail.lineNo} is missing.`);
            const common = {
                product_id: detail.productId,
                branch_id: reversal.branchId,
                source_document_id: reversal.id,
                source_document_detail_id: detail.detailId,
                source_document_no: reversal.requestNo,
                version_id: null,
                created_by: actor,
                remarks: `Lot-transfer reversal ${reversal.requestNo} of ${original.requestNo} line ${detail.lineNo}`.slice(0, 255)
            };
            const sourceMovementId = await createInventoryMovement({
                ...common,
                mm_lot_id: reversal.sourceLotId,
                lot_id: null,
                transaction_type_id: sourceTypeId,
                batch_no: detail.sourceBatchNo,
                expiry_date: line.source.expiryDate,
                manufacturing_date: line.source.manufacturingDate,
                quantity: -detail.quantity
            });
            createdMovementIds.push(sourceMovementId);
            const targetMovementId = await createInventoryMovement({
                ...common,
                mm_lot_id: reversal.targetLotId,
                lot_id: null,
                transaction_type_id: targetTypeId,
                batch_no: detail.targetBatchNo,
                expiry_date: line.target.expiryDate,
                manufacturing_date: line.target.manufacturingDate,
                quantity: detail.quantity
            });
            createdMovementIds.push(targetMovementId);
            pairs.push({ detail, sourceMovementId, targetMovementId });
        }

        const movementRecord = {
            ...reversal,
            details: details.map((detail, index) => ({
                ...detail,
                sourceMovementId: pairs[index].sourceMovementId,
                targetMovementId: pairs[index].targetMovementId
            }))
        };
        await verifyReversalMovementPairs(movementRecord, createdMovementIds);

        for (const pair of pairs) {
            const line = preview.linePreviews.find((item) => item.detailId === pair.detail.detailId || item.lineNo === pair.detail.lineNo);
            if (!line || !pair.detail.detailId) throw new LotTransferError(503, `Reversal audit data for line ${pair.detail.lineNo} is missing.`);
            detailAuditIds.push(pair.detail.detailId);
            await mutateDirectus(
                `/items/${LOT_TRANSFER_DETAIL_COLLECTION}/${encodeURIComponent(String(pair.detail.detailId))}`,
                "PATCH",
                {
                    source_movement_id: pair.sourceMovementId,
                    target_movement_id: pair.targetMovementId,
                    source_unit_cost: line.source.unitCost,
                    target_unit_cost: line.target.unitCost,
                    source_balance_before: line.source.onHandBefore,
                    source_balance_after: line.source.onHandAfter,
                    target_balance_before: line.target.onHandBefore,
                    target_balance_after: line.target.onHandAfter,
                    source_manufacturing_date: line.source.manufacturingDate,
                    source_expiry_date: line.source.expiryDate,
                    target_manufacturing_date: line.target.manufacturingDate,
                    target_expiry_date: line.target.expiryDate,
                    validation_status: "PASSED",
                    validation_error: null,
                    posting_error: null,
                    reconciliation_required: false,
                    updated_at: manilaTimestamp()
                },
                "Lot-transfer reversal detail audit"
            );
        }

        const reversedAt = manilaTimestamp();
        const singleLine = pairs.length === 1 ? pairs[0] : null;
        const transition = await transitionLotTransferStatus({
            transferId: reversal.id,
            expectedOldStatus: "Draft",
            newStatus: "Reversed",
            changedBy: actor,
            changedAt: reversedAt,
            remarks: `Reversed: ${reason}`,
            patch: {
                status: "Reversed",
                posted_by: actor,
                posted_at: reversedAt,
                reversed_by: actor,
                reversed_at: reversedAt,
                reversal_reason: reason,
                effective_expiry_date: preview.effectiveExpiryDate,
                source_unit_cost: singleLine ? preview.source.unitCost : null,
                target_unit_cost: singleLine ? preview.target.unitCost : null,
                source_movement_id: singleLine?.sourceMovementId || null,
                target_movement_id: singleLine?.targetMovementId || null,
                source_balance_before: singleLine ? preview.source.onHandBefore : null,
                source_balance_after: singleLine ? preview.source.onHandAfter : null,
                target_balance_before: singleLine ? preview.target.onHandBefore : null,
                target_balance_after: singleLine ? preview.target.onHandAfter : null,
                posting_started_at: null,
                idempotency_key: idempotencyKey,
                reconciliation_required: false,
                posting_error: null,
                updated_at: reversedAt
            },
            rollbackPatch: {
                status: "Draft",
                posted_by: reversal.postedBy,
                posted_at: reversal.postedAt,
                reversed_by: reversal.reversedBy,
                reversed_at: reversal.reversedAt,
                reversal_reason: reversal.reversalReason,
                effective_expiry_date: reversal.effectiveExpiryDate,
                source_unit_cost: reversal.sourceUnitCost,
                target_unit_cost: reversal.targetUnitCost,
                source_movement_id: reversal.sourceMovementId,
                target_movement_id: reversal.targetMovementId,
                source_balance_before: reversal.sourceBalanceBefore,
                source_balance_after: reversal.sourceBalanceAfter,
                target_balance_before: reversal.targetBalanceBefore,
                target_balance_after: reversal.targetBalanceAfter,
                posting_started_at: reversal.postingStartedAt,
                idempotency_key: reversal.idempotencyKey,
                reconciliation_required: reversal.reconciliationRequired,
                posting_error: reversal.postingError
            },
            action: "reversal finalization"
        });
        reversalFinalized = true;
        const finalReversal = transition.record;
        if (
            finalReversal.status !== "Reversed"
            || finalReversal.reversalOfId !== original.id
            || finalReversal.reversalReason !== reason
            || finalReversal.reversedBy !== actor
            || !finalReversal.reversedAt
            || finalReversal.details.some((detail) => !detail.sourceMovementId || !detail.targetMovementId)
        ) {
            throw new LotTransferError(503, "The reversal was not durably finalized for every detail line.");
        }
        const originalAfter = await getLotTransfer(original.id);
        if (originalAfter.status !== "Posted" || originalAfter.sourceMovementId !== original.sourceMovementId || originalAfter.targetMovementId !== original.targetMovementId) {
            throw new LotTransferError(503, "The original posted transfer changed while reversal was being finalized; reconciliation is required.");
        }
        return { original: originalAfter, reversal: finalReversal, preview, idempotent: false };
    } catch (error) {
        const compensationFailures: string[] = [];
        if (!reversalFinalized) {
            for (const movementIdValue of [...createdMovementIds].reverse()) {
                try {
                    await deleteInventoryMovement(movementIdValue);
                } catch (compensationError) {
                    compensationFailures.push(compensationError instanceof Error ? compensationError.message : String(compensationError));
                }
            }
        }
        if (reversalId && !reversalFinalized && createdHeader && compensationFailures.length === 0) {
            try {
                await deleteTransferHeaderAndDetails(reversalId);
            } catch (compensationError) {
                compensationFailures.push(compensationError instanceof Error ? compensationError.message : String(compensationError));
            }
        } else if (reversalId && !reversalFinalized) {
            await mutateDirectus(
                `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(reversalId))}`,
                "PATCH",
                {
                    posting_started_at: null,
                    posting_error: error instanceof Error ? error.message : "Unknown lot-transfer reversal failure",
                    reconciliation_required: compensationFailures.length > 0,
                    updated_at: manilaTimestamp()
                },
                "Lot-transfer reversal failure audit"
            ).catch(() => undefined);
            for (const detailId of detailAuditIds) {
                await mutateDirectus(
                    `/items/${LOT_TRANSFER_DETAIL_COLLECTION}/${encodeURIComponent(String(detailId))}`,
                    "PATCH",
                    {
                        source_movement_id: null,
                        target_movement_id: null,
                        posting_error: error instanceof Error ? error.message : "Unknown lot-transfer reversal failure",
                        reconciliation_required: compensationFailures.length > 0,
                        updated_at: manilaTimestamp()
                    },
                    "Lot-transfer reversal detail failure audit"
                ).catch(() => undefined);
            }
        }
        if (compensationFailures.length > 0) {
            throw new LotTransferError(503, "Lot-transfer reversal failed and requires reconciliation.", { compensationFailures });
        }
        throw error;
    }
}
