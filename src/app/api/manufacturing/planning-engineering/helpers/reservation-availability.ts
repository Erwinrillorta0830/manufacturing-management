function nonNegativeFinite(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * The staged/issued portion has already reduced movement-backed on-hand stock.
 * Only the remainder of a reservation should be deducted from that balance.
 */
export function getUnissuedReservationQuantity(
    reservedQuantity: unknown,
    stagedQuantity: unknown,
    issuedToWipQuantity: unknown
): number {
    const reserved = nonNegativeFinite(reservedQuantity);
    const alreadyIssued = Math.max(
        nonNegativeFinite(stagedQuantity),
        nonNegativeFinite(issuedToWipQuantity)
    );
    return Math.max(0, reserved - alreadyIssued);
}
