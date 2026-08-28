export interface PickingItem {
    detailId: number;
    productId: number;
    productName: string;
    productCode: string;
    orderedQuantity: number;
    pickedQuantity: number;
}

export interface PickingTotals {
    ordered: number;
    picked: number;
    short: number;
    pct: number;
}
