export interface MovementLotReference {
    mmLotId?: unknown;
    mm_lot_id?: unknown;
}

/**
 * Storage-lot identity for movement history is the canonical mm_lot_id.
 * inventory_lot_id and legacy lot_id are separate references and must not
 * be required to resolve a canonical storage lot.
 */
export function movementMmLotId(movement: MovementLotReference): number | null {
    const value = movement.mmLotId ?? movement.mm_lot_id;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
