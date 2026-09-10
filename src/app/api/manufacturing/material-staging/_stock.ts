export function normalizeBatchNo(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
}

export function branchProductKey(branchId: number, productId: number): string {
    return `${branchId}:${productId}`;
}

export function branchProductBatchKey(branchId: number, productId: number, batchNo: unknown): string {
    return `${branchId}:${productId}:${normalizeBatchNo(batchNo)}`;
}

export function branchProductLotBatchKey(
    branchId: number,
    productId: number,
    lotId: number,
    batchNo: unknown
): string {
    return `${branchId}:${productId}:${lotId}:${normalizeBatchNo(batchNo)}`;
}

export interface MaterialStagingStockMovement {
    movement_id?: number | null;
    product_id?: number | null;
    mm_lot_id?: number | null;
    branch_id?: number | null;
    transaction_type_id?: number | null;
    source_document_id?: number | null;
    batch_no?: string | null;
    quantity: number;
    remarks?: string | null;
}

function numericValue(value: unknown): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return numericValue(record.id ?? record.movement_id ?? record.product_id ?? record.branch_id ?? record.transaction_type_id);
    }

    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizeDirectusStagingMovement(row: Record<string, unknown>): MaterialStagingStockMovement {
    return {
        movement_id: numericValue(row.movement_id ?? row.id),
        product_id: numericValue(row.product_id),
        mm_lot_id: numericValue(row.mm_lot_id),
        branch_id: numericValue(row.branch_id),
        transaction_type_id: numericValue(row.transaction_type_id),
        source_document_id: numericValue(row.source_document_id),
        batch_no: row.batch_no == null ? "" : String(row.batch_no),
        quantity: numericValue(row.quantity),
        remarks: row.remarks == null ? "" : String(row.remarks)
    };
}
