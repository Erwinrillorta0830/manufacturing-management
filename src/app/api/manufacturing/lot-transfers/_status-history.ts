import { LotTransferError } from "./_errors";
import { LOT_TRANSFER_COLLECTION, LOT_TRANSFER_STATUS_HISTORY_COLLECTION } from "./_config";
import { directusRows, mutateDirectus, updateDirectusItems, type RecordValue } from "./_directus";
import { getLotTransfer } from "./_queries";
import type { LotTransferRecord, LotTransferStatus, LotTransferStatusHistory } from "./_types";
import { LOT_TRANSFER_STATUSES } from "./_types";
import { manilaTimestamp, nullableString, relationId, relationName, rowId, stringValue } from "./_values";

interface AppendStatusHistoryOptions {
    transferId: number;
    oldStatus: LotTransferStatus | null;
    newStatus: LotTransferStatus;
    changedBy: number | null;
    changedAt?: string;
    remarks: string;
}

interface TransitionStatusOptions {
    transferId: number;
    expectedOldStatus: LotTransferStatus;
    newStatus: LotTransferStatus;
    changedBy: number;
    changedAt?: string;
    remarks: string;
    patch: RecordValue;
    rollbackPatch: RecordValue;
    action: string;
}

const MAX_REMARKS_LENGTH = 5000;

function isStatus(value: unknown): value is LotTransferStatus {
    return (LOT_TRANSFER_STATUSES as readonly string[]).includes(stringValue(value));
}

function statusOrNull(value: unknown): LotTransferStatus | null {
    const normalized = stringValue(value);
    if (!normalized) return null;
    return isStatus(normalized) ? normalized : null;
}

function historyId(row: RecordValue): number {
    return rowId(row, ["lot_transfer_status_history_id", "id"]);
}

function actorName(value: unknown): string | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const actor = value as RecordValue;
    const fullName = [actor.user_fname, actor.first_name, actor.user_lname, actor.last_name]
        .map(stringValue)
        .filter(Boolean)
        .join(" ");
    return fullName || relationName(actor, ["name", "user_name", "email"]);
}

function mapHistoryRow(row: RecordValue): LotTransferStatusHistory {
    const id = historyId(row);
    const lotTransferId = relationId(row.lot_transfer_id, ["lot_transfer_id", "id"]);
    const oldStatusValue = row.old_status;
    const newStatusValue = stringValue(row.new_status);
    const changedAt = nullableString(row.changed_at);
    if (!id || !lotTransferId || !isStatus(newStatusValue) || (stringValue(oldStatusValue) && !statusOrNull(oldStatusValue)) || !changedAt) {
        throw new LotTransferError(502, "Lot-transfer status history returned an invalid record.");
    }
    const changedBy = relationId(row.changed_by, ["user_id", "id"]) || null;
    return {
        id,
        lotTransferId,
        oldStatus: statusOrNull(oldStatusValue),
        newStatus: newStatusValue,
        changedBy,
        changedByName: actorName(row.changed_by),
        changedAt,
        remarks: stringValue(row.remarks)
    };
}

function eventKey(transferId: number, oldStatus: LotTransferStatus | null, newStatus: LotTransferStatus): string {
    return `LOT_TRANSFER_STATUS:${transferId}:${oldStatus || "NULL"}:${newStatus}`;
}

function assertStatusHistoryInput(options: AppendStatusHistoryOptions): void {
    if (!Number.isInteger(options.transferId) || options.transferId <= 0) {
        throw new LotTransferError(400, "A valid lot-transfer ID is required for status history.");
    }
    if (options.oldStatus !== null && !isStatus(options.oldStatus)) {
        throw new LotTransferError(400, "The previous lot-transfer status is invalid.");
    }
    if (!isStatus(options.newStatus)) {
        throw new LotTransferError(400, "The new lot-transfer status is invalid.");
    }
    if (options.oldStatus === options.newStatus) {
        throw new LotTransferError(400, "A lot-transfer status history event must change the status.");
    }
    if (options.changedBy !== null && (!Number.isInteger(options.changedBy) || options.changedBy <= 0)) {
        throw new LotTransferError(400, "The status history actor is invalid.");
    }
    const remarks = options.remarks.trim();
    if (!remarks) throw new LotTransferError(400, "A status history remark is required.");
    if (remarks.length > MAX_REMARKS_LENGTH) throw new LotTransferError(400, "A status history remark must be 5000 characters or fewer.");
}

async function findEvent(transferId: number, key: string): Promise<LotTransferStatusHistory | null> {
    const params = new URLSearchParams({
        "filter[lot_transfer_id][_eq]": String(transferId),
        "filter[event_key][_eq]": key,
        fields: "*",
        limit: "1"
    });
    const rows = await directusRows(`/items/${LOT_TRANSFER_STATUS_HISTORY_COLLECTION}?${params.toString()}`, "Lot-transfer status history lookup");
    return rows[0] ? mapHistoryRow(rows[0]) : null;
}

function eventMatches(event: LotTransferStatusHistory, options: AppendStatusHistoryOptions): boolean {
    return event.lotTransferId === options.transferId
        && event.oldStatus === options.oldStatus
        && event.newStatus === options.newStatus
        && event.changedBy === options.changedBy
        && event.remarks === options.remarks.trim();
}

export async function getLotTransferStatusHistoryEvent(
    transferId: number,
    oldStatus: LotTransferStatus,
    newStatus: LotTransferStatus
): Promise<LotTransferStatusHistory | null> {
    return findEvent(transferId, eventKey(transferId, oldStatus, newStatus));
}

export async function appendStatusHistory(options: AppendStatusHistoryOptions): Promise<{ entry: LotTransferStatusHistory; idempotent: boolean }> {
    assertStatusHistoryInput(options);
    const key = eventKey(options.transferId, options.oldStatus, options.newStatus);
    const existing = await findEvent(options.transferId, key);
    if (existing) {
        if (!eventMatches(existing, options)) {
            throw new LotTransferError(409, "A conflicting lot-transfer status history event already exists.");
        }
        return { entry: existing, idempotent: true };
    }

    const changedAt = options.changedAt || manilaTimestamp();
    const body = {
        lot_transfer_id: options.transferId,
        old_status: options.oldStatus,
        new_status: options.newStatus,
        changed_by: options.changedBy,
        changed_at: changedAt,
        remarks: options.remarks.trim(),
        event_key: key
    };
    try {
        await mutateDirectus(
            `/items/${LOT_TRANSFER_STATUS_HISTORY_COLLECTION}`,
            "POST",
            body,
            "Lot-transfer status history creation"
        );
    } catch (error) {
        const raced = await findEvent(options.transferId, key).catch(() => null);
        if (raced && eventMatches(raced, options)) return { entry: raced, idempotent: true };
        throw error;
    }

    const persisted = await findEvent(options.transferId, key);
    if (!persisted || !eventMatches(persisted, options)) {
        throw new LotTransferError(503, "Lot-transfer status history was not durably persisted.");
    }
    return { entry: persisted, idempotent: false };
}

export async function transitionLotTransferStatus(options: TransitionStatusOptions): Promise<{ record: LotTransferRecord; entry: LotTransferStatusHistory; idempotent: boolean }> {
    const current = await getLotTransfer(options.transferId);
    const key = eventKey(options.transferId, options.expectedOldStatus, options.newStatus);
    const existing = await findEvent(options.transferId, key);
    if (existing) {
        if (existing.changedBy !== options.changedBy || existing.remarks !== options.remarks.trim()) {
            throw new LotTransferError(409, `A conflicting ${options.action} history event already exists.`);
        }
        if (current.status !== options.newStatus) {
            throw new LotTransferError(503, `Lot-transfer ${options.action} history exists but the header status is not ${options.newStatus}. Reconciliation is required.`);
        }
        return { record: current, entry: existing, idempotent: true };
    }
    if (current.status === options.newStatus) {
        throw new LotTransferError(
            503,
            `Lot-transfer ${options.action} reached ${options.newStatus} without a durable status history event. Reconciliation is required.`
        );
    }
    if (current.status !== options.expectedOldStatus) {
        throw new LotTransferError(409, `Only ${options.expectedOldStatus} lot-transfer requests can be ${options.action}. Current status: ${current.status}.`);
    }

    const transitionedRows = await updateDirectusItems(
        `/items/${LOT_TRANSFER_COLLECTION}`,
        {
            filter: {
                lot_transfer_id: { _eq: options.transferId },
                status: { _eq: options.expectedOldStatus }
            }
        },
        options.patch,
        `Lot-transfer ${options.action} compare-and-set`
    );
    if (transitionedRows.length !== 1) {
        const racedRecord = await getLotTransfer(options.transferId).catch(() => null);
        const racedHistory = await findEvent(options.transferId, key).catch(() => null);
        if (racedHistory) {
            if (racedHistory.changedBy !== options.changedBy || racedHistory.remarks !== options.remarks.trim()) {
                throw new LotTransferError(409, `A conflicting ${options.action} history event already exists.`);
            }
            if (racedRecord?.status === options.newStatus) {
                return { record: racedRecord, entry: racedHistory, idempotent: true };
            }
            throw new LotTransferError(503, `Lot-transfer ${options.action} history exists but the header status is not ${options.newStatus}. Reconciliation is required.`);
        }
        if (racedRecord?.status === options.newStatus) {
            throw new LotTransferError(503, `Another ${options.action} operation is finalizing this lot-transfer request. Retry after the audit event is available.`);
        }
        if (racedRecord && racedRecord.status !== options.expectedOldStatus) {
            throw new LotTransferError(409, `Only ${options.expectedOldStatus} lot-transfer requests can be ${options.action}. Current status: ${racedRecord.status}.`);
        }
        throw new LotTransferError(503, `Lot-transfer ${options.action} could not acquire the status transition claim. Retry the operation.`);
    }
    try {
        const appended = await appendStatusHistory({
            transferId: options.transferId,
            oldStatus: options.expectedOldStatus,
            newStatus: options.newStatus,
            changedBy: options.changedBy,
            changedAt: options.changedAt,
            remarks: options.remarks
        });
        const finalRecord = await getLotTransfer(options.transferId);
        if (finalRecord.status !== options.newStatus) {
            throw new LotTransferError(503, `Lot-transfer ${options.action} was not durably finalized.`);
        }
        return { record: finalRecord, entry: appended.entry, idempotent: appended.idempotent };
    } catch (error) {
        const persistedHistory = await findEvent(options.transferId, key).catch(() => null);
        if (persistedHistory) {
            const currentAfterHistory = await getLotTransfer(options.transferId);
            if (currentAfterHistory.status === options.newStatus && eventMatches(persistedHistory, {
                transferId: options.transferId,
                oldStatus: options.expectedOldStatus,
                newStatus: options.newStatus,
                changedBy: options.changedBy,
                changedAt: options.changedAt,
                remarks: options.remarks
            })) {
                return { record: currentAfterHistory, entry: persistedHistory, idempotent: true };
            }
        }

        const currentAfterFailure = await getLotTransfer(options.transferId).catch(() => null);
        if (currentAfterFailure?.status === options.newStatus) {
            const rollbackUpdatedAt = manilaTimestamp();
            const rollbackFilter: RecordValue = {
                lot_transfer_id: { _eq: options.transferId },
                status: { _eq: options.newStatus }
            };
            const transitionUpdatedAt = stringValue(options.patch.updated_at);
            if (transitionUpdatedAt) rollbackFilter.updated_at = { _eq: transitionUpdatedAt };
            const rollbackRows = await updateDirectusItems(
                `/items/${LOT_TRANSFER_COLLECTION}`,
                { filter: rollbackFilter },
                { ...options.rollbackPatch, updated_at: rollbackUpdatedAt },
                `Lot-transfer ${options.action} compensation`
            );
            const compensated = await getLotTransfer(options.transferId).catch(() => null);
            if (rollbackRows.length !== 1 || compensated?.status !== options.expectedOldStatus) {
                throw new LotTransferError(503, `Lot-transfer ${options.action} history failed and the status could not be compensated. Reconciliation is required.`);
            }
        }
        throw error;
    }
}

export async function getLotTransferStatusHistory(transferId: number): Promise<LotTransferStatusHistory[]> {
    await getLotTransfer(transferId);
    const params = new URLSearchParams({
        "filter[lot_transfer_id][_eq]": String(transferId),
        fields: "*",
        limit: "-1",
        sort: "changed_at,lot_transfer_status_history_id"
    });
    const rows = await directusRows(`/items/${LOT_TRANSFER_STATUS_HISTORY_COLLECTION}?${params.toString()}`, "Lot-transfer status history lookup");
    return rows.map(mapHistoryRow).sort((left, right) => left.changedAt.localeCompare(right.changedAt) || left.id - right.id);
}

export async function deleteLotTransferStatusHistory(transferId: number): Promise<void> {
    let rows: RecordValue[];
    try {
        const params = new URLSearchParams({
            "filter[lot_transfer_id][_eq]": String(transferId),
            fields: "lot_transfer_status_history_id",
            limit: "-1"
        });
        rows = await directusRows(`/items/${LOT_TRANSFER_STATUS_HISTORY_COLLECTION}?${params.toString()}`, "Lot-transfer status history cleanup");
    } catch (error) {
        if (error instanceof LotTransferError && [400, 404].includes(error.statusCode)) return;
        throw error;
    }
    for (const row of rows) {
        const id = historyId(row);
        if (id > 0) {
            await mutateDirectus(
                `/items/${LOT_TRANSFER_STATUS_HISTORY_COLLECTION}/${encodeURIComponent(String(id))}`,
                "DELETE",
                undefined,
                "Lot-transfer status history cleanup"
            );
        }
    }
}
