import { directusRows, type RecordValue } from "./_directus";
import { LotTransferError } from "./_errors";
import { getLotTransfer } from "./_queries";
import type {
    LotTransferMovementDirection,
    LotTransferMovementHistory,
    LotTransferMovementHistoryResult
} from "./_types";
import {
    movementId,
    movementTransactionTypeId,
    nullableString,
    numeric,
    relationId,
    stringValue
} from "./_values";

interface MovementType {
    transactionType: string;
    direction: LotTransferMovementDirection;
    originTable: string;
}

const CANONICAL_MOVEMENT_TYPES = new Set([
    "LOT_TRANSFER_OUT",
    "LOT_TRANSFER_IN",
    "LOT_TRANSFER_REVERSAL_OUT",
    "LOT_TRANSFER_REVERSAL_IN"
]);

function canonicalTransactionType(value: unknown): string {
    const normalized = stringValue(value)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    if (normalized === "LOT_TRANSFER_SOURCE_OUT" || normalized === "SOURCE_OUT") return "LOT_TRANSFER_OUT";
    if (normalized === "LOT_TRANSFER_TARGET_IN" || normalized === "TARGET_IN") return "LOT_TRANSFER_IN";
    return normalized || "UNKNOWN_TRANSACTION_TYPE";
}

function movementDirection(value: unknown, quantity: number): LotTransferMovementDirection {
    const normalized = stringValue(value).toUpperCase();
    if (normalized === "IN" || normalized === "OUT") return normalized;
    if (quantity > 0) return "IN";
    if (quantity < 0) return "OUT";
    return "UNKNOWN";
}

function mapMovementType(row: RecordValue): MovementType {
    const transactionType = canonicalTransactionType(row.type_name);
    return {
        transactionType,
        direction: movementDirection(row.direction, 0),
        originTable: stringValue(row.origin_table)
    };
}

async function loadMovementTypes(rows: RecordValue[]): Promise<Map<number, MovementType>> {
    const ids = [...new Set(rows
        .map((row) => movementTransactionTypeId(row))
        .filter((id) => id > 0))];
    if (ids.length === 0) return new Map();
    const params = new URLSearchParams({
        "filter[transaction_type_id][_in]": ids.join(","),
        fields: "transaction_type_id,type_name,direction,origin_table",
        limit: "-1"
    });
    const typeRows = await directusRows(`/items/inventory_transaction_types?${params.toString()}`, "Lot-transfer movement type lookup");
    return new Map(typeRows.map((row) => {
        const id = relationId(row.transaction_type_id, ["transaction_type_id"]) || numeric(row.transaction_type_id);
        return [id, mapMovementType(row)] as const;
    }).filter(([id]) => id > 0));
}

function mapMovement(row: RecordValue, typeById: Map<number, MovementType>, transferId: number): LotTransferMovementHistory {
    const id = movementId(row);
    if (id <= 0) throw new LotTransferError(502, "Lot-transfer movement history returned a row without a valid movement ID.");
    const quantity = numeric(row.quantity);
    const transactionTypeId = movementTransactionTypeId(row) || null;
    const type = typeById.get(transactionTypeId || 0);
    const transactionType = type?.transactionType || canonicalTransactionType(row.transaction_type);
    return {
        movementId: id,
        lotTransferId: transferId,
        detailId: relationId(row.source_document_detail_id, ["lot_transfer_detail_id", "id"]) || null,
        transactionTypeId,
        transactionType,
        movementDirection: movementDirection(type?.direction, quantity),
        sourceDocumentNo: nullableString(row.source_document_no),
        productId: numeric(row.product_id),
        branchId: numeric(row.branch_id),
        mmLotId: relationId(row.mm_lot_id, ["lot_id", "id"]) || null,
        batchNo: stringValue(row.batch_no),
        quantity,
        manufacturingDate: nullableString(row.manufacturing_date),
        expirationDate: nullableString(row.expiry_date),
        createdBy: relationId(row.created_by, ["user_id", "id"]) || null,
        createdAt: nullableString(row.created_at),
        remarks: nullableString(row.remarks)
    };
}

function isCanonicalMovement(row: LotTransferMovementHistory): boolean {
    return CANONICAL_MOVEMENT_TYPES.has(row.transactionType)
        && ((row.transactionType.endsWith("_OUT") && row.movementDirection === "OUT")
            || (row.transactionType.endsWith("_IN") && row.movementDirection === "IN"));
}

function countPairedLines(
    record: Awaited<ReturnType<typeof getLotTransfer>>,
    movements: LotTransferMovementHistory[]
): number {
    const details = record.details.length > 0 ? record.details : [{ detailId: null }];
    return details.reduce((count, detail) => {
        const lineRows = detail.detailId
            ? movements.filter((row) => row.detailId === detail.detailId)
            : movements.filter((row) => row.detailId === null);
        const hasOut = lineRows.some((row) => row.movementDirection === "OUT" && isCanonicalMovement(row));
        const hasIn = lineRows.some((row) => row.movementDirection === "IN" && isCanonicalMovement(row));
        return count + (hasOut && hasIn && lineRows.length === 2 ? 1 : 0);
    }, 0);
}

export async function getLotTransferMovementHistory(transferId: number): Promise<LotTransferMovementHistoryResult> {
    const record = await getLotTransfer(transferId);
    const params = new URLSearchParams({
        "filter[source_document_id][_eq]": String(transferId),
        fields: "movement_id,source_document_id,source_document_detail_id,source_document_no,product_id,branch_id,mm_lot_id,batch_no,quantity,expiry_date,manufacturing_date,transaction_type_id,created_by,created_at,remarks",
        sort: "created_at,movement_id",
        limit: "-1"
    });
    const rows = await directusRows(`/items/inventory_movements?${params.toString()}`, "Lot-transfer movement history lookup");
    const typeById = await loadMovementTypes(rows);
    const movements = rows
        .map((row) => mapMovement(row, typeById, transferId))
        .sort((left, right) => (left.createdAt || "").localeCompare(right.createdAt || "") || left.movementId - right.movementId);
    const expectedLineCount = record.details.length > 0 ? record.details.length : 1;
    const expectsMovements = record.status === "Posted" || record.status === "Reversed" || movements.length > 0;
    const actualMovementCount = movements.length;
    const expectedMovementCount = expectsMovements ? expectedLineCount * 2 : 0;
    const pairedLineCount = expectsMovements ? countPairedLines(record, movements) : 0;
    const reconciliationRequired = expectsMovements
        && (actualMovementCount !== expectedMovementCount
            || pairedLineCount !== expectedLineCount
            || movements.some((movement) => !isCanonicalMovement(movement)));
    return {
        data: movements,
        expectedMovementCount,
        actualMovementCount,
        expectedLineCount: expectsMovements ? expectedLineCount : 0,
        pairedLineCount,
        reconciliationRequired
    };
}
