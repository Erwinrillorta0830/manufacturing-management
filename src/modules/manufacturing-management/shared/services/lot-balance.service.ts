export interface LotBalanceRow {
    lotId?: number | null;
    productId?: number | null;
    quantity?: number | null;
    uomName?: string | null;
}

export interface LotBalance {
    onHandQuantity: number;
    occupiedQuantity: number;
    negativeQuantity: number;
    remainingCapacity: number | null;
    occupancyPercent: number | null;
    productOnHand: number;
    uomName: string;
}

/** Uses the same positive-stock occupancy semantics as Lot Management. */
export function calculateLotBalance(
    rows: readonly LotBalanceRow[],
    lotId: number,
    maxCapacity: number,
    productId?: number
): LotBalance {
    const lotRows = rows.filter((row) => Number(row.lotId) === Number(lotId));
    let onHandQuantity = 0;
    let negativeQuantity = 0;
    let productOnHand = 0;
    let uomName = "";

    for (const row of lotRows) {
        const quantity = Number(row.quantity) || 0;
        if (quantity > 0) {
            onHandQuantity += quantity;
            if (productId !== undefined && Number(row.productId) === Number(productId)) {
                productOnHand += quantity;
            }
        } else if (quantity < 0) {
            negativeQuantity += Math.abs(quantity);
        }
        if (!uomName && row.uomName) uomName = row.uomName;
    }

    const capacity = Number(maxCapacity) > 0 ? Number(maxCapacity) : null;
    const occupancyPercent = capacity === null
        ? null
        : Math.max(0, Math.min(100, Math.round((onHandQuantity / capacity) * 100)));

    return {
        onHandQuantity,
        occupiedQuantity: onHandQuantity,
        negativeQuantity,
        remainingCapacity: capacity === null ? null : capacity - onHandQuantity,
        occupancyPercent,
        productOnHand,
        uomName
    };
}
