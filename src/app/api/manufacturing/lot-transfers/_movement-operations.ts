import { LotTransferError } from "./_errors";
import {
    LOT_TRANSFER_COLLECTION,
    LOT_TRANSFER_EPSILON
} from "./_config";
import { directusRows, mutateDirectus } from "./_directus";
import type { RecordValue } from "./_directus";
import type { LotTransferRecord } from "./_types";
import {
    movementQuantity,
    movementTransactionTypeId,
    numeric,
    relationId,
    stringValue
} from "./_values";

export async function resolveMovementType(typeName: string, direction: "IN" | "OUT"): Promise<number> {
    const params = new URLSearchParams({
        "filter[type_name][_eq]": typeName,
        "filter[direction][_eq]": direction,
        "filter[origin_table][_eq]": LOT_TRANSFER_COLLECTION,
        fields: "transaction_type_id,type_name,direction,origin_table",
        limit: "-1"
    });
    const rows = await directusRows(`/items/inventory_transaction_types?${params.toString()}`, "Inventory transaction type lookup");
    const ids = [...new Set(rows.map((row) => relationId(row.transaction_type_id, ["transaction_type_id"]) || numeric(row.transaction_type_id)).filter((id) => id > 0))];
    if (ids.length !== 1) {
        throw new LotTransferError(503, `${typeName} (${direction}) is not configured uniquely.`, { matches: ids.length });
    }
    return ids[0];
}

export async function createInventoryMovement(payload: RecordValue): Promise<number> {
    const row = await mutateDirectus("/items/inventory_movements", "POST", payload, "Lot-transfer inventory movement creation");
    const id = row ? relationId(row.movement_id, ["movement_id"]) || relationId(row.id, ["id"]) : 0;
    if (!id) throw new LotTransferError(503, "Directus did not return the created inventory movement ID.");
    return id;
}

export async function deleteInventoryMovement(id: number): Promise<void> {
    await mutateDirectus(`/items/inventory_movements/${encodeURIComponent(String(id))}`, "DELETE", undefined, "Lot-transfer movement compensation");
}

export async function verifyInventoryMovements(ids: number[]): Promise<RecordValue[]> {
    const params = new URLSearchParams({
        "filter[movement_id][_in]": ids.join(","),
        fields: "movement_id,source_document_id,source_document_detail_id,source_document_no,product_id,branch_id,mm_lot_id,batch_no,quantity,expiry_date,manufacturing_date,transaction_type_id",
        limit: "-1"
    });
    return directusRows(`/items/inventory_movements?${params.toString()}`, "Lot-transfer movement verification");
}

export async function findTransferMovements(transferIdValue: number, requestNo: string): Promise<RecordValue[]> {
    const params = new URLSearchParams({
        "filter[source_document_id][_eq]": String(transferIdValue),
        "filter[source_document_no][_eq]": requestNo,
        fields: "movement_id,source_document_id,source_document_detail_id,source_document_no,product_id,branch_id,mm_lot_id,batch_no,quantity,expiry_date,manufacturing_date,transaction_type_id",
        limit: "-1"
    });
    return directusRows(`/items/inventory_movements?${params.toString()}`, "Existing lot-transfer movement lookup");
}

export function isTransferMovement(row: RecordValue, record: LotTransferRecord, side: "source" | "target"): boolean {
    const expectedQuantity = side === "source" ? -record.quantity : record.quantity;
    return numeric(row.product_id) === record.productId
        && numeric(row.branch_id) === record.branchId
        && numeric(row.mm_lot_id) === (side === "source" ? record.sourceLotId : record.targetLotId)
        && stringValue(row.batch_no).toLowerCase() === (side === "source" ? record.sourceBatchNo : record.targetBatchNo).toLowerCase()
        && Math.abs(movementQuantity(row) - expectedQuantity) <= LOT_TRANSFER_EPSILON;
}

export function movementTypeId(row: RecordValue): number {
    return movementTransactionTypeId(row);
}
