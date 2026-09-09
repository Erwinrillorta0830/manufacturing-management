import { LotTransferError } from "./_errors";
import {
    LOT_TRANSFER_COLLECTION,
    LOT_TRANSFER_DETAIL_COLLECTION,
    LOT_TRANSFER_SOURCE_OUT_TYPE,
    LOT_TRANSFER_TARGET_IN_TYPE
} from "./_config";
import { mutateDirectus } from "./_directus";
import type {
    LotTransferDetail,
    LotTransferInput,
    LotTransferPreview,
    LotTransferRecord,
    ValidationCheck
} from "./_types";
import { legacyDetailFromRecord } from "./_record-mappers";
import {
    assertDifferentLotIds,
    normalizedDetails,
    transientRecordFromInput
} from "./_input";
import {
    applyDestinationBatchResolutions,
    deleteInventoryLot,
    ensureDestinationBatch,
    storedPostedPreview,
    type EnsuredDestinationBatch
} from "./_destination-batch-posting";
import {
    createInventoryMovement,
    deleteInventoryMovement,
    findTransferMovements,
    isTransferMovement,
    resolveMovementType,
    verifyInventoryMovements
} from "./_movement-operations";
import { buildLotTransferPreview, recordForDetail } from "./_preview";
import { requireSessionUserId } from "./_session";
import { getLotTransfer } from "./_queries";
import { transitionLotTransferStatus } from "./_status-history";
import {
    dateOnly,
    movementId,
    normalizeStatus,
    normalizedBatch,
    numeric
} from "./_values";

async function persistDetailValidation(preview: LotTransferPreview): Promise<void> {
    for (const line of preview.linePreviews) {
        if (!line.detailId) continue;
        const failed = line.checks.filter((item) => !item.passed).map((item) => `${item.label}: ${item.message}`);
        await mutateDirectus(
            `/items/${LOT_TRANSFER_DETAIL_COLLECTION}/${encodeURIComponent(String(line.detailId))}`,
            "PATCH",
            {
                validation_status: failed.length === 0 ? "PASSED" : "FAILED",
                validation_error: failed.length > 0 ? failed.join(" ").slice(0, 5000) : null,
                updated_at: new Date().toISOString()
            },
            "Lot-transfer detail validation audit"
        );
    }
}

export async function submitLotTransfer(id: number, actorUserId: number | null): Promise<LotTransferRecord> {
    const record = await getLotTransfer(id);
    if (record.status !== "Draft") throw new LotTransferError(409, `Only Draft requests can be submitted. Current status: ${record.status}.`);
    const submittedBy = requireSessionUserId(actorUserId, "submit a lot-transfer request");
    const preview = await buildLotTransferPreview(record);
    if (!preview.canApprove) {
        throw new LotTransferError(409, "The lot-transfer request failed the required submission checks.", {
            failedChecks: failedPreviewChecks(preview)
        });
    }
    await persistDetailValidation(preview);
    const submittedAt = new Date().toISOString();
    const transition = await transitionLotTransferStatus({
        transferId: id,
        expectedOldStatus: "Draft",
        newStatus: "Submitted",
        changedBy: submittedBy,
        changedAt: submittedAt,
        remarks: "Submitted for QA approval.",
        patch: {
            status: "Submitted",
            submitted_by: submittedBy,
            submitted_at: submittedAt,
            updated_at: submittedAt
        },
        rollbackPatch: {
            status: "Draft",
            submitted_by: record.submittedBy,
            submitted_at: record.submittedAt,
            updated_at: new Date().toISOString()
        },
        action: "submission"
    });
    return transition.record;
}

export async function previewLotTransferInput(input: LotTransferInput): Promise<LotTransferPreview> {
    assertDifferentLotIds(input.sourceLotId, input.targetLotId);
    const details = normalizedDetails(input);
    // Draft preflight must return the full line-level validation matrix, including
    // failed canonical/UOM checks, so the editor can show the affected line and
    // keep submission disabled instead of turning a validation result into a
    // generic request error.
    return buildLotTransferPreview(transientRecordFromInput({ ...input, details }, null));
}


export async function approveLotTransfer(id: number, actorUserId: number | null): Promise<{ record: LotTransferRecord; preview: LotTransferPreview; idempotent: boolean }> {
    const record = await getLotTransfer(id);
    if (record.status === "Posted") {
        throw new LotTransferError(409, "Posted lot-transfer requests cannot be approved again.");
    }
    if (record.status === "Approved") {
        return { record, preview: await buildLotTransferPreview(record), idempotent: true };
    }
    if (record.status !== "Submitted") {
        throw new LotTransferError(409, `Only Submitted requests can be approved. Current status: ${record.status}.`);
    }

    const preview = await buildLotTransferPreview(record);
    if (!preview.canApprove) {
        throw new LotTransferError(409, "The lot-transfer request failed the required QA checks.", {
            failedChecks: preview.checks.filter((item) => !item.passed)
        });
    }
    await persistDetailValidation(preview);

    const approvedBy = requireSessionUserId(actorUserId, "approve a lot-transfer request");
    const approvedAt = new Date().toISOString();
    const transition = await transitionLotTransferStatus({
        transferId: id,
        expectedOldStatus: "Submitted",
        newStatus: "Approved",
        changedBy: approvedBy,
        changedAt: approvedAt,
        remarks: "Approved after server-side QA validation.",
        patch: {
            status: "Approved",
            approved_by: approvedBy,
            approved_at: approvedAt,
            effective_expiry_date: preview.effectiveExpiryDate,
            source_unit_cost: preview.source.unitCost,
            target_unit_cost: preview.target.unitCost,
            source_movement_id: null,
            target_movement_id: null,
            source_balance_before: null,
            source_balance_after: null,
            target_balance_before: null,
            target_balance_after: null,
            idempotency_key: null,
            posting_started_at: null,
            reconciliation_required: false,
            posting_error: null,
            updated_at: approvedAt
        },
        rollbackPatch: {
            status: "Submitted",
            approved_by: record.approvedBy,
            approved_at: record.approvedAt,
            effective_expiry_date: record.effectiveExpiryDate,
            source_unit_cost: record.sourceUnitCost,
            target_unit_cost: record.targetUnitCost,
            source_balance_before: record.sourceBalanceBefore,
            source_balance_after: record.sourceBalanceAfter,
            target_balance_before: record.targetBalanceBefore,
            target_balance_after: record.targetBalanceAfter,
            source_movement_id: record.sourceMovementId,
            target_movement_id: record.targetMovementId,
            idempotency_key: record.idempotencyKey,
            posting_started_at: record.postingStartedAt,
            reconciliation_required: record.reconciliationRequired,
            posting_error: record.postingError
        },
        action: "approval"
    });
    const finalRecord = transition.record;
    if (finalRecord.status !== "Approved" || finalRecord.sourceMovementId !== null || finalRecord.targetMovementId !== null) {
        throw new LotTransferError(503, "Lot-transfer approval was not durably finalized without posting inventory.");
    }
    return { record: finalRecord, preview, idempotent: false };
}

export async function postLotTransfer(id: number, idempotencyKey: string, actorUserId: number | null): Promise<{ record: LotTransferRecord; preview: LotTransferPreview; idempotent: boolean }> {
    const record = await getLotTransfer(id);
    if (record.status === "Posted") return { record, preview: storedPostedPreview(record), idempotent: true };
    if (record.status !== "Approved") throw new LotTransferError(409, `Only Approved requests can be posted. Current status: ${record.status}.`);
    if (record.reconciliationRequired) {
        throw new LotTransferError(409, "This lot-transfer request requires reconciliation before it can be posted again.");
    }
    if (record.postingStartedAt && record.idempotencyKey && record.idempotencyKey !== idempotencyKey) {
        throw new LotTransferError(409, "Another posting operation is already in progress for this request.");
    }
    const actor = requireSessionUserId(actorUserId, "post a lot-transfer request");

    let claimOwned = false;
    let reconciliationRequired = false;
    const createdMovementIds: number[] = [];
    const createdDestinationBatchIds: number[] = [];
    const detailAuditIds: number[] = [];
    let preview: LotTransferPreview | null = null;

    try {
        const startedAt = new Date().toISOString();
        await mutateDirectus(
            `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
            "PATCH",
            { idempotency_key: idempotencyKey, posting_started_at: startedAt, posting_error: null, reconciliation_required: false, updated_at: startedAt },
            "Lot-transfer posting claim"
        );
        const claimedRecord = await getLotTransfer(id);
        if (claimedRecord.status === "Posted") return { record: claimedRecord, preview: storedPostedPreview(claimedRecord), idempotent: true };
        if (claimedRecord.status !== "Approved" || claimedRecord.idempotencyKey !== idempotencyKey) {
            throw new LotTransferError(409, "Another posting operation is already in progress for this request.");
        }
        claimOwned = true;
        preview = await buildLotTransferPreview(claimedRecord, { excludeTransferMovements: true });
        if (!preview.canPost) {
            throw new LotTransferError(409, "The lot-transfer request failed the required posting checks.", {
                failedChecks: preview.checks.filter((item) => !item.passed)
            });
        }

        const details = claimedRecord.details.length > 0 ? claimedRecord.details : [legacyDetailFromRecord(claimedRecord)];
        const existingMovements = await findTransferMovements(id, claimedRecord.requestNo);
        const pairs: Array<{ detail: LotTransferDetail; sourceMovementId: number; targetMovementId: number }> = [];
        const matchedMovementIds = new Set<number>();
        for (const detail of details) {
            const lineRecord = recordForDetail(claimedRecord, detail);
            const lineRows = detail.detailId
                ? existingMovements.filter((row) => numeric(row.source_document_detail_id) === detail.detailId)
                : existingMovements.filter((row) => isTransferMovement(row, lineRecord, "source") || isTransferMovement(row, lineRecord, "target"));
            const sourceMatches = lineRows.filter((row) => isTransferMovement(row, lineRecord, "source"));
            const targetMatches = lineRows.filter((row) => isTransferMovement(row, lineRecord, "target"));
            if (sourceMatches.length > 1 || targetMatches.length > 1 || (lineRows.length > 0 && !(sourceMatches.length === 1 && targetMatches.length === 1))) {
                reconciliationRequired = true;
                throw new LotTransferError(503, `Transfer detail line ${detail.lineNo} has an incomplete or duplicate movement pair; reconciliation is required.`);
            }
            if (sourceMatches.length === 1 && targetMatches.length === 1) {
                const sourceMovementId = movementId(sourceMatches[0]);
                const targetMovementId = movementId(targetMatches[0]);
                if (!sourceMovementId || !targetMovementId) {
                    reconciliationRequired = true;
                    throw new LotTransferError(503, `Transfer detail line ${detail.lineNo} has movement records without durable IDs.`);
                }
                matchedMovementIds.add(sourceMovementId);
                matchedMovementIds.add(targetMovementId);
                pairs.push({ detail, sourceMovementId, targetMovementId });
            }
        }
        if (existingMovements.length > 0 && (pairs.length !== details.length || matchedMovementIds.size !== existingMovements.length)) {
            reconciliationRequired = true;
            throw new LotTransferError(503, "An incomplete or duplicate lot-transfer movement set exists; reconciliation is required.");
        }

        const destinationBatchCache = new Map<string, EnsuredDestinationBatch>();
        const destinationBatchResolutions = new Map<number, EnsuredDestinationBatch>();
        for (const line of preview.linePreviews) {
            const detail = details.find((item) => item.detailId === line.detailId || item.lineNo === line.lineNo);
            if (!detail) throw new LotTransferError(503, `Validation result for detail line ${line.lineNo} is missing.`);
            const resolution = line.destinationBatchResolution;
            const cacheKey = [
                claimedRecord.targetLotId,
                line.productId,
                normalizedBatch(resolution.batchNo),
                dateOnly(resolution.manufacturingDate) || "",
                dateOnly(resolution.expiryDate) || "",
                normalizeStatus(resolution.qaStatus)
            ].join(":");
            let ensured = destinationBatchCache.get(cacheKey);
            if (!ensured) {
                ensured = await ensureDestinationBatch(recordForDetail(claimedRecord, detail), line, actor);
                destinationBatchCache.set(cacheKey, ensured);
                if (ensured.created) createdDestinationBatchIds.push(ensured.inventoryLotId);
            }
            destinationBatchResolutions.set(line.lineNo, ensured);
        }
        preview = applyDestinationBatchResolutions(preview, destinationBatchResolutions);
        for (const pair of pairs) {
            const ensured = destinationBatchResolutions.get(pair.detail.lineNo);
            if (!ensured) throw new LotTransferError(503, `Destination batch resolution for detail line ${pair.detail.lineNo} is missing.`);
            pair.detail = {
                ...pair.detail,
                targetInventoryLotId: ensured.inventoryLotId,
                targetBatchNo: ensured.batchNo,
                destinationBatchAction: ensured.action
            };
        }

        if (pairs.length === 0) {
            const sourceTypeId = await resolveMovementType(LOT_TRANSFER_SOURCE_OUT_TYPE, "OUT");
            const targetTypeId = await resolveMovementType(LOT_TRANSFER_TARGET_IN_TYPE, "IN");
            for (const line of preview.linePreviews) {
                const detail = details.find((item) => item.detailId === line.detailId || item.lineNo === line.lineNo);
                if (!detail) throw new LotTransferError(503, `Validation result for detail line ${line.lineNo} is missing.`);
                const ensured = destinationBatchResolutions.get(line.lineNo);
                if (!ensured) throw new LotTransferError(503, `Destination batch resolution for detail line ${line.lineNo} is missing.`);
                const resolvedDetail: LotTransferDetail = {
                    ...detail,
                    targetInventoryLotId: ensured.inventoryLotId,
                    targetBatchNo: ensured.batchNo,
                    destinationBatchAction: ensured.action
                };
                const common = {
                    product_id: resolvedDetail.productId,
                    branch_id: claimedRecord.branchId,
                    source_document_id: claimedRecord.id,
                    source_document_detail_id: resolvedDetail.detailId,
                    source_document_no: claimedRecord.requestNo,
                    version_id: null,
                    created_by: actor,
                    remarks: `Lot transfer ${claimedRecord.requestNo} line ${resolvedDetail.lineNo}: ${resolvedDetail.sourceBatchNo} -> ${resolvedDetail.targetBatchNo}`.slice(0, 255)
                };
                const sourceMovementId = await createInventoryMovement({
                    ...common,
                    mm_lot_id: claimedRecord.sourceLotId,
                    lot_id: null,
                    transaction_type_id: sourceTypeId,
                    batch_no: resolvedDetail.sourceBatchNo,
                    expiry_date: line.source.expiryDate,
                    manufacturing_date: line.source.manufacturingDate,
                    quantity: -resolvedDetail.quantity
                });
                createdMovementIds.push(sourceMovementId);
                const targetMovementId = await createInventoryMovement({
                    ...common,
                    mm_lot_id: claimedRecord.targetLotId,
                    lot_id: null,
                    transaction_type_id: targetTypeId,
                    batch_no: resolvedDetail.targetBatchNo,
                    expiry_date: line.target.expiryDate,
                    manufacturing_date: line.target.manufacturingDate,
                    quantity: resolvedDetail.quantity
                });
                createdMovementIds.push(targetMovementId);
                pairs.push({ detail: resolvedDetail, sourceMovementId, targetMovementId });
            }
            const verified = await verifyInventoryMovements(createdMovementIds);
            const verifiedIds = new Set(verified.map((row) => movementId(row)));
            if (createdMovementIds.some((movementIdValue) => !verifiedIds.has(movementIdValue))) {
                throw new LotTransferError(503, "One or more lot-transfer movement pairs could not be verified after insertion.");
            }
        }

        for (const pair of pairs) {
            const line = preview.linePreviews.find((item) => item.detailId === pair.detail.detailId || item.lineNo === pair.detail.lineNo);
            if (!line || !pair.detail.detailId) continue;
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
                    target_inventory_lot_id: pair.detail.targetInventoryLotId,
                    target_batch_no: pair.detail.targetBatchNo,
                    destination_batch_action: pair.detail.destinationBatchAction,
                    validation_status: "PASSED",
                    validation_error: null,
                    posting_error: null,
                    reconciliation_required: false,
                    updated_at: new Date().toISOString()
                },
                "Lot-transfer detail posting audit"
            );
        }

        const postedAt = new Date().toISOString();
        const singleLine = pairs.length === 1 ? pairs[0] : null;
        const headerLine = pairs[0]?.detail || null;
        const transition = await transitionLotTransferStatus({
            transferId: id,
            expectedOldStatus: "Approved",
            newStatus: "Posted",
            changedBy: actor,
            changedAt: postedAt,
            remarks: "Posted with verified source OUT and target IN movement pairs.",
            patch: {
                status: "Posted",
                posted_by: actor,
                posted_at: postedAt,
                effective_expiry_date: preview.effectiveExpiryDate,
                source_unit_cost: singleLine ? preview.source.unitCost : null,
                target_unit_cost: singleLine ? preview.target.unitCost : null,
                source_movement_id: singleLine?.sourceMovementId || null,
                target_movement_id: singleLine?.targetMovementId || null,
                source_balance_before: singleLine ? preview.source.onHandBefore : null,
                source_balance_after: singleLine ? preview.source.onHandAfter : null,
                target_balance_before: singleLine ? preview.target.onHandBefore : null,
                target_balance_after: singleLine ? preview.target.onHandAfter : null,
                target_inventory_lot_id: headerLine?.targetInventoryLotId || null,
                target_batch_no: headerLine?.targetBatchNo || null,
                posting_started_at: null,
                idempotency_key: idempotencyKey,
                reconciliation_required: false,
                posting_error: null,
                updated_at: postedAt
            },
            rollbackPatch: {
                status: "Approved",
                posted_by: record.postedBy,
                posted_at: record.postedAt,
                effective_expiry_date: record.effectiveExpiryDate,
                source_unit_cost: record.sourceUnitCost,
                target_unit_cost: record.targetUnitCost,
                source_movement_id: record.sourceMovementId,
                target_movement_id: record.targetMovementId,
                source_balance_before: record.sourceBalanceBefore,
                source_balance_after: record.sourceBalanceAfter,
                target_balance_before: record.targetBalanceBefore,
                target_balance_after: record.targetBalanceAfter,
                target_inventory_lot_id: record.targetInventoryLotId,
                target_batch_no: record.targetBatchNo,
                posting_started_at: record.postingStartedAt,
                idempotency_key: record.idempotencyKey,
                reconciliation_required: record.reconciliationRequired,
                posting_error: record.postingError
            },
            action: pairs.length === 1 ? "posting finalization" : "multi-line posting finalization"
        });
        const finalRecord = transition.record;
        if (finalRecord.status !== "Posted" || finalRecord.details.some((detail) => detail.detailId && (!detail.sourceMovementId || !detail.targetMovementId))) {
            reconciliationRequired = true;
            throw new LotTransferError(503, "Lot-transfer posting was not durably finalized for every detail line.");
        }
        return { record: finalRecord, preview, idempotent: pairs.length > 0 && createdMovementIds.length === 0 };
    } catch (error) {
        const compensationFailures: string[] = [];
        for (const movementIdValue of [...createdMovementIds].reverse()) {
            try {
                await deleteInventoryMovement(movementIdValue);
            } catch (compensationError) {
                compensationFailures.push(compensationError instanceof Error ? compensationError.message : String(compensationError));
            }
        }
        for (const inventoryLotIdValue of [...createdDestinationBatchIds].reverse()) {
            try {
                await deleteInventoryLot(inventoryLotIdValue);
            } catch (compensationError) {
                compensationFailures.push(compensationError instanceof Error ? compensationError.message : String(compensationError));
            }
        }
        for (const detailId of detailAuditIds) {
            await mutateDirectus(`/items/${LOT_TRANSFER_DETAIL_COLLECTION}/${encodeURIComponent(String(detailId))}`, "PATCH", {
                source_movement_id: null,
                target_movement_id: null,
                posting_error: error instanceof Error ? error.message : "Unknown lot-transfer posting failure",
                reconciliation_required: reconciliationRequired || compensationFailures.length > 0,
                updated_at: new Date().toISOString()
            }, "Lot-transfer detail posting failure audit").catch(() => undefined);
        }
        const errorText = error instanceof Error ? error.message : "Unknown lot-transfer posting failure";
        if (claimOwned) {
            await mutateDirectus(
                `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
                "PATCH",
                {
                    posting_started_at: null,
                    posting_error: errorText,
                    reconciliation_required: reconciliationRequired || compensationFailures.length > 0,
                    updated_at: new Date().toISOString()
                },
                "Lot-transfer posting failure audit"
            ).catch(() => undefined);
        }
        if (reconciliationRequired || compensationFailures.length > 0) {
            throw new LotTransferError(503, "Lot-transfer posting failed and requires reconciliation.", { compensationFailures });
        }
        throw error;
    }
}

export async function rejectLotTransfer(id: number, rejectionReason: string, qaEvidence: string | undefined, actorUserId: number | null): Promise<LotTransferRecord> {
    const record = await getLotTransfer(id);
    if (record.status !== "Submitted") {
        throw new LotTransferError(409, `Only Submitted requests can be rejected. Current status: ${record.status}.`);
    }
    const rejectedBy = requireSessionUserId(actorUserId, "reject a lot-transfer request");
    const rejectedAt = new Date().toISOString();
    const transition = await transitionLotTransferStatus({
        transferId: id,
        expectedOldStatus: "Submitted",
        newStatus: "Rejected",
        changedBy: rejectedBy,
        changedAt: rejectedAt,
        remarks: `Rejected: ${rejectionReason.trim()}`,
        patch: {
            status: "Rejected",
            rejected_by: rejectedBy,
            rejected_at: rejectedAt,
            rejection_reason: rejectionReason,
            qa_evidence: qaEvidence || null,
            posting_started_at: null,
            updated_at: rejectedAt
        },
        rollbackPatch: {
            status: "Submitted",
            rejected_by: record.rejectedBy,
            rejected_at: record.rejectedAt,
            rejection_reason: record.rejectionReason,
            qa_evidence: record.qaEvidence,
            posting_started_at: record.postingStartedAt,
            updated_at: new Date().toISOString()
        },
        action: "rejection"
    });
    return transition.record;
}

export async function cancelLotTransfer(id: number, cancellationReason: string, actorUserId: number | null): Promise<LotTransferRecord> {
    const record = await getLotTransfer(id);
    const cancelledBy = requireSessionUserId(actorUserId, "cancel a lot-transfer request");
    if (record.status === "Cancelled") return record;
    if (!["Draft", "Submitted", "Approved", "Rejected"].includes(record.status)) {
        throw new LotTransferError(409, `Only unposted lot-transfer requests can be cancelled. Current status: ${record.status}.`);
    }

    const reason = cancellationReason.trim();
    if (!reason) throw new LotTransferError(400, "A cancellation reason is required.");
    if (reason.length > 5000) throw new LotTransferError(400, "The cancellation reason must be 5000 characters or fewer.");

    const persistedMovementIds = [
        record.sourceMovementId,
        record.targetMovementId,
        ...record.details.flatMap((detail) => [detail.sourceMovementId, detail.targetMovementId])
    ].filter((movementIdValue): movementIdValue is number => Boolean(movementIdValue && movementIdValue > 0));
    if (persistedMovementIds.length > 0) {
        throw new LotTransferError(409, "This lot-transfer request has inventory movement references and cannot be cancelled.");
    }

    const existingMovements = await findTransferMovements(id, record.requestNo);
    if (existingMovements.length > 0) {
        throw new LotTransferError(409, "This lot-transfer request already has inventory movements and cannot be cancelled.");
    }

    const cancelledAt = new Date().toISOString();
    const transition = await transitionLotTransferStatus({
        transferId: id,
        expectedOldStatus: record.status,
        newStatus: "Cancelled",
        changedBy: cancelledBy,
        changedAt: cancelledAt,
        remarks: `Cancelled: ${reason}`,
        patch: {
            status: "Cancelled",
            cancelled_by: cancelledBy,
            cancelled_at: cancelledAt,
            cancellation_reason: reason,
            updated_at: cancelledAt
        },
        rollbackPatch: {
            status: record.status,
            cancelled_by: record.cancelledBy,
            cancelled_at: record.cancelledAt,
            cancellation_reason: record.cancellationReason,
            updated_at: new Date().toISOString()
        },
        action: "cancellation"
    });
    const finalRecord = transition.record;
    if (finalRecord.status !== "Cancelled" || !finalRecord.cancelledAt || finalRecord.cancelledBy !== cancelledBy || finalRecord.cancellationReason !== reason) {
        throw new LotTransferError(503, "Lot-transfer cancellation was not durably finalized.");
    }
    return finalRecord;
}

export function failedPreviewChecks(preview: LotTransferPreview): ValidationCheck[] {
    return preview.checks.filter((item) => !item.passed);
}
