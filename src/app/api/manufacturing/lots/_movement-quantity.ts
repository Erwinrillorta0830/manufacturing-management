type MovementRow = Record<string, unknown>;

function nullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/** Normalize split quantity fields and Directus signed movement quantities. */
export function movementQuantities(row: MovementRow): { quantityIn: number; quantityOut: number; net: number } {
    const signedQuantity = nullableNumber(row.quantity) ?? 0;
    const explicitIn = nullableNumber(row.quantityIn ?? row.quantity_in);
    const explicitOut = nullableNumber(row.quantityOut ?? row.quantity_out);
    const quantityIn = explicitIn ?? Math.max(0, signedQuantity);
    const quantityOut = explicitOut ?? Math.max(0, -signedQuantity);

    return {
        quantityIn,
        quantityOut,
        net: quantityIn - quantityOut
    };
}
