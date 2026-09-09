import { LotTransferError } from "./_errors";
import {
    LOT_TRANSFER_COLLECTION,
    LOT_TRANSFER_DETAIL_COLLECTION
} from "./_config";
import { directusRows, mutateDirectus } from "./_directus";
import type { RecordValue } from "./_directus";
import {
    LOT_TRANSFER_STATUSES,
    type LotTransferDetail,
    type LotTransferRecord,
    type LotTransferStatus
} from "./_types";
import {
    destinationBatchAction,
    nullableNumeric,
    nullableString,
    numeric,
    optionalRelationId,
    relationId,
    relationName,
    rowId,
    stringValue,
    transferId
} from "./_values";

export function mapTransferDetail(row: RecordValue, fallbackLineNo: number): LotTransferDetail {
    const detailId = rowId(row, ["lot_transfer_detail_id", "id"]);
    return {
        detailId: detailId > 0 ? detailId : null,
        lineNo: numeric(row.line_no) > 0 ? numeric(row.line_no) : fallbackLineNo,
        productId: numeric(row.product_id),
        sourceInventoryLotId: numeric(row.source_inventory_lot_id),
        sourceBatchNo: stringValue(row.source_batch_no),
        targetInventoryLotId: optionalRelationId(row.target_inventory_lot_id, ["inventory_lot_id", "id"]),
        targetBatchNo: stringValue(row.target_batch_no) || stringValue(row.source_batch_no),
        quantity: numeric(row.quantity),
        lineRemarks: stringValue(row.line_remarks),
        sourceManufacturingDate: nullableString(row.source_manufacturing_date),
        sourceExpiryDate: nullableString(row.source_expiry_date),
        targetManufacturingDate: nullableString(row.target_manufacturing_date),
        targetExpiryDate: nullableString(row.target_expiry_date),
        sourceUnitCost: nullableNumeric(row.source_unit_cost),
        targetUnitCost: nullableNumeric(row.target_unit_cost),
        sourceBalanceBefore: nullableNumeric(row.source_balance_before),
        sourceBalanceAfter: nullableNumeric(row.source_balance_after),
        targetBalanceBefore: nullableNumeric(row.target_balance_before),
        targetBalanceAfter: nullableNumeric(row.target_balance_after),
        sourceMovementId: nullableNumeric(row.source_movement_id),
        targetMovementId: nullableNumeric(row.target_movement_id),
        validationStatus: nullableString(row.validation_status),
        validationError: nullableString(row.validation_error),
        postingError: nullableString(row.posting_error),
        reconciliationRequired: row.reconciliation_required === true || numeric(row.reconciliation_required) === 1,
        destinationBatchAction: destinationBatchAction(row.destination_batch_action)
    };
}

export function mapTransferRow(row: RecordValue): LotTransferRecord {
    const statusValue = stringValue(row.status);
    const status = (LOT_TRANSFER_STATUSES as readonly string[]).includes(statusValue)
        ? statusValue as LotTransferStatus
        : "Draft";
    const requestedByValue = row.requested_by;
    const approvedByValue = row.approved_by;
    const postedByValue = row.posted_by;
    const rejectedByValue = row.rejected_by;
    const cancelledByValue = row.cancelled_by;

    return {
        id: transferId(row),
        requestNo: stringValue(row.request_no) || `LTR-${transferId(row)}`,
        status,
        branchId: numeric(row.branch_id),
        productId: numeric(row.product_id),
        unitId: relationId(row.unit_id, ["unit_id", "id"]) || null,
        sourceLotId: numeric(row.source_lot_id),
        sourceInventoryLotId: numeric(row.source_inventory_lot_id),
        sourceBatchNo: stringValue(row.source_batch_no),
        targetLotId: numeric(row.target_lot_id),
        targetInventoryLotId: optionalRelationId(row.target_inventory_lot_id, ["inventory_lot_id", "id"]),
        targetBatchNo: stringValue(row.target_batch_no),
        quantity: numeric(row.quantity),
        reason: stringValue(row.reason),
        requestedBy: relationId(requestedByValue, ["user_id"]),
        requestedByName: relationName(requestedByValue, ["name", "user_name", "user_fname", "email"]),
        requestedAt: nullableString(row.requested_at),
        transferDate: nullableString(row.transfer_date),
        submittedBy: relationId(row.submitted_by, ["user_id"]) || null,
        submittedAt: nullableString(row.submitted_at),
        approvedBy: relationId(approvedByValue, ["user_id"]),
        approvedByName: relationName(approvedByValue, ["name", "user_name", "user_fname", "email"]),
        approvedAt: nullableString(row.approved_at),
        postedBy: relationId(postedByValue, ["user_id"]),
        postedByName: relationName(postedByValue, ["name", "user_name", "user_fname", "email"]),
        postedAt: nullableString(row.posted_at),
        rejectedBy: relationId(rejectedByValue, ["user_id"]),
        rejectedByName: relationName(rejectedByValue, ["name", "user_name", "user_fname", "email"]),
        rejectedAt: nullableString(row.rejected_at),
        rejectionReason: nullableString(row.rejection_reason),
        cancelledBy: relationId(cancelledByValue, ["user_id"]) || null,
        cancelledByName: relationName(cancelledByValue, ["name", "user_name", "user_fname", "email"]),
        cancelledAt: nullableString(row.cancelled_at),
        cancellationReason: nullableString(row.cancellation_reason),
        qaEvidence: nullableString(row.qa_evidence),
        effectiveExpiryDate: nullableString(row.effective_expiry_date),
        sourceUnitCost: nullableNumeric(row.source_unit_cost),
        targetUnitCost: nullableNumeric(row.target_unit_cost),
        sourceMovementId: nullableNumeric(row.source_movement_id),
        targetMovementId: nullableNumeric(row.target_movement_id),
        sourceBalanceBefore: nullableNumeric(row.source_balance_before),
        sourceBalanceAfter: nullableNumeric(row.source_balance_after),
        targetBalanceBefore: nullableNumeric(row.target_balance_before),
        targetBalanceAfter: nullableNumeric(row.target_balance_after),
        idempotencyKey: nullableString(row.idempotency_key),
        reversalOfId: relationId(row.reversal_of_id, ["lot_transfer_id", "id"]) || null,
        reversalReason: nullableString(row.reversal_reason),
        reversedBy: relationId(row.reversed_by, ["user_id", "id"]) || null,
        reversedByName: relationName(row.reversed_by, ["name", "user_name", "user_fname", "email"]),
        reversedAt: nullableString(row.reversed_at),
        linkedReversalId: null,
        linkedReversalRequestNo: null,
        linkedReversalStatus: null,
        linkedReversalReason: null,
        linkedReversalBy: null,
        linkedReversalByName: null,
        linkedReversalAt: null,
        postingStartedAt: nullableString(row.posting_started_at),
        reconciliationRequired: row.reconciliation_required === true || numeric(row.reconciliation_required) === 1,
        postingError: nullableString(row.posting_error),
        createdAt: nullableString(row.created_at),
        updatedAt: nullableString(row.updated_at),
        details: [],
        lineCount: 0,
        totalQuantity: 0
    };
}

export interface ReversalLinkSummary {
    id: number;
    requestNo: string;
    status: LotTransferStatus;
    idempotencyKey: string | null;
    reversalReason: string | null;
    reversedBy: number | null;
    reversedByName: string | null;
    reversedAt: string | null;
}

function mapReversalLink(row: RecordValue): ReversalLinkSummary | null {
    const id = transferId(row);
    const statusValue = stringValue(row.status);
    const status = (LOT_TRANSFER_STATUSES as readonly string[]).includes(statusValue)
        ? statusValue as LotTransferStatus
        : null;
    if (id <= 0 || !status || relationId(row.reversal_of_id, ["lot_transfer_id", "id"]) <= 0) return null;
    return {
        id,
        requestNo: stringValue(row.request_no) || `LTR-${id}`,
        status,
        idempotencyKey: nullableString(row.idempotency_key),
        reversalReason: nullableString(row.reversal_reason),
        reversedBy: relationId(row.reversed_by, ["user_id", "id"]) || null,
        reversedByName: relationName(row.reversed_by, ["name", "user_name", "user_fname", "email"]),
        reversedAt: nullableString(row.reversed_at)
    };
}

export async function readLinkedReversals(transferIds: number[], allowMissingMetadata = true): Promise<Map<number, ReversalLinkSummary>> {
    const ids = [...new Set(transferIds.filter((id) => id > 0))];
    if (ids.length === 0) return new Map();
    const params = new URLSearchParams({
        "filter[reversal_of_id][_in]": ids.join(","),
        fields: "lot_transfer_id,request_no,status,reversal_of_id,reversal_reason,reversed_by,reversed_at,idempotency_key",
        limit: "-1",
        sort: "-reversed_at,-lot_transfer_id"
    });
    let rows: RecordValue[];
    try {
        rows = await directusRows(`/items/${LOT_TRANSFER_COLLECTION}?${params.toString()}`, "Linked lot-transfer reversal lookup");
    } catch (error) {
        // Keep old installations readable until the reversal metadata migration is applied.
        if (allowMissingMetadata && error instanceof LotTransferError && [400, 404].includes(error.statusCode)) return new Map();
        throw error;
    }
    const links = new Map<number, ReversalLinkSummary>();
    for (const row of rows) {
        const link = mapReversalLink(row);
        const originalId = relationId(row.reversal_of_id, ["lot_transfer_id", "id"]);
        if (!link || originalId <= 0) continue;
        const existing = links.get(originalId);
        if (!existing || (link.status === "Reversed" && existing.status !== "Reversed")) links.set(originalId, link);
    }
    return links;
}

export function attachLinkedReversal(record: LotTransferRecord, link: ReversalLinkSummary | undefined): LotTransferRecord {
    if (!link) return record;
    return {
        ...record,
        linkedReversalId: link.id,
        linkedReversalRequestNo: link.requestNo,
        linkedReversalStatus: link.status,
        linkedReversalReason: link.reversalReason,
        linkedReversalBy: link.reversedBy,
        linkedReversalByName: link.reversedByName,
        linkedReversalAt: link.reversedAt
    };
}

export function legacyDetailFromRecord(record: LotTransferRecord): LotTransferDetail {
    return {
        detailId: null,
        lineNo: 1,
        productId: record.productId,
        sourceInventoryLotId: record.sourceInventoryLotId,
        sourceBatchNo: record.sourceBatchNo,
        targetInventoryLotId: record.targetInventoryLotId,
        targetBatchNo: record.targetBatchNo || record.sourceBatchNo,
        quantity: record.quantity,
        lineRemarks: "",
        sourceManufacturingDate: null,
        sourceExpiryDate: record.effectiveExpiryDate,
        targetManufacturingDate: null,
        targetExpiryDate: record.effectiveExpiryDate,
        sourceUnitCost: record.sourceUnitCost,
        targetUnitCost: record.targetUnitCost,
        sourceBalanceBefore: record.sourceBalanceBefore,
        sourceBalanceAfter: record.sourceBalanceAfter,
        targetBalanceBefore: record.targetBalanceBefore,
        targetBalanceAfter: record.targetBalanceAfter,
        sourceMovementId: record.sourceMovementId,
        targetMovementId: record.targetMovementId,
        validationStatus: null,
        validationError: null,
        postingError: record.postingError,
        reconciliationRequired: record.reconciliationRequired,
        destinationBatchAction: null
    };
}

export function attachLegacySummary(record: LotTransferRecord, details: LotTransferDetail[]): LotTransferRecord {
    const normalizedDetails = details.length > 0 ? details : [legacyDetailFromRecord(record)];
    const first = normalizedDetails[0];
    const singleLine = normalizedDetails.length === 1 ? first : null;
    return {
        ...record,
        productId: record.productId || first.productId,
        sourceInventoryLotId: record.sourceInventoryLotId || first.sourceInventoryLotId,
        sourceBatchNo: record.sourceBatchNo || first.sourceBatchNo,
        targetInventoryLotId: record.targetInventoryLotId || first.targetInventoryLotId,
        targetBatchNo: record.targetBatchNo || first.targetBatchNo,
        quantity: normalizedDetails.reduce((sum, detail) => sum + detail.quantity, 0),
        sourceMovementId: record.sourceMovementId || singleLine?.sourceMovementId || null,
        targetMovementId: record.targetMovementId || singleLine?.targetMovementId || null,
        details: normalizedDetails,
        lineCount: normalizedDetails.length,
        totalQuantity: normalizedDetails.reduce((sum, detail) => sum + detail.quantity, 0)
    };
}

export async function readTransferDetails(transferIdValue: number): Promise<LotTransferDetail[]> {
    const params = new URLSearchParams({
        "filter[lot_transfer_id][_eq]": String(transferIdValue),
        fields: "*",
        sort: "line_no,lot_transfer_detail_id",
        limit: "-1"
    });
    try {
        const rows = await directusRows(`/items/${LOT_TRANSFER_DETAIL_COLLECTION}?${params.toString()}`, "Lot-transfer detail lookup");
        return rows.map((row, index) => mapTransferDetail(row, index + 1));
    } catch (error) {
        // A legacy environment may be read before the migration is applied. In that case,
        // the header remains readable as a synthetic one-line transfer.
        if (error instanceof LotTransferError && [400, 404].includes(error.statusCode)) return [];
        throw error;
    }
}

export async function hydrateTransferRecord(record: LotTransferRecord, includeLinkedReversal = true): Promise<LotTransferRecord> {
    const hydrated = attachLegacySummary(record, await readTransferDetails(record.id));
    if (!includeLinkedReversal) return hydrated;
    const links = await readLinkedReversals([hydrated.id]);
    return attachLinkedReversal(hydrated, links.get(hydrated.id));
}

export async function readRawTransferDetails(transferIdValue: number): Promise<RecordValue[]> {
    try {
        return await directusRows(`/items/${LOT_TRANSFER_DETAIL_COLLECTION}?filter[lot_transfer_id][_eq]=${transferIdValue}&fields=*&sort=line_no&limit=-1`, "Lot-transfer detail lookup");
    } catch (error) {
        if (error instanceof LotTransferError && [400, 404].includes(error.statusCode)) return [];
        throw error;
    }
}

export async function deleteTransferDetail(id: number): Promise<void> {
    await mutateDirectus(`/items/${LOT_TRANSFER_DETAIL_COLLECTION}/${encodeURIComponent(String(id))}`, "DELETE", undefined, "Lot-transfer detail deletion");
}
