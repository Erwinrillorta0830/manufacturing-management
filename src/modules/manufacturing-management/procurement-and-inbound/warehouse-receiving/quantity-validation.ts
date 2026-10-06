export const WAREHOUSE_RECEIPT_QUANTITY_EPSILON = 1e-9;

export function isReceiptQuantityOverRemaining(receivedQuantity: number, remainingQuantity: number): boolean {
    return receivedQuantity > remainingQuantity + WAREHOUSE_RECEIPT_QUANTITY_EPSILON;
}
