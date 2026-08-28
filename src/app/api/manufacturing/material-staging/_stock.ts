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
