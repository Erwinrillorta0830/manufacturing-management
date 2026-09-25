/**
 * Inventory delta check for staging commits. Compares the currently staged
 * baseline against the newly selected allocation lines and reports whether
 * committing would change anything (quantity adjustment, lot reassignment,
 * or destination-bin change).
 *
 * Lots are keyed by mm_lot_id:inventory_lot_id:batch (never by
 * allocation_line_id, which differs between manual and auto rows for the
 * same physical lot). Quantities use the codebase 1e-6 epsilon.
 */
export const ALLOCATION_DELTA_EPSILON = 0.000001;

export interface StagedAllocationBaseline {
    mm_lot_id?: number | null;
    inventory_lot_id?: number | null;
    batch_no: string;
    staged_quantity: number;
    staging_bin?: string | null;
}

export interface SelectedAllocationLine {
    mm_lot_id: number;
    inventory_lot_id: number;
    batch_no: string;
    quantity: number;
}

function lotKey(mmLotId: unknown, inventoryLotId: unknown, batchNo: unknown): string {
    return `${Number(mmLotId) || 0}:${Number(inventoryLotId) || 0}:${String(batchNo ?? "").trim().toLowerCase()}`;
}

export function hasStagingDelta(
    staged: readonly StagedAllocationBaseline[],
    selected: readonly SelectedAllocationLine[],
    targetBin: string | null,
    remainingQuantity?: number | null
): boolean {
    const remaining = Number(remainingQuantity);
    const hasRemaining = Number.isFinite(remaining) && remaining > ALLOCATION_DELTA_EPSILON;
    const selectedTotal = (selected || []).reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0), 0);
    // Committed lines are incremental top-ups capped at the remaining
    // requirement, so any non-empty selection against outstanding remaining
    // quantity is committable by construction.
    if (hasRemaining && selectedTotal > ALLOCATION_DELTA_EPSILON) return true;
    const stagedByKey = new Map<string, { quantity: number; bin: string | null }>();
    for (const row of staged || []) {
        const key = lotKey(row.mm_lot_id, row.inventory_lot_id, row.batch_no);
        const current = stagedByKey.get(key);
        stagedByKey.set(key, {
            quantity: (current?.quantity || 0) + Math.max(0, Number(row.staged_quantity) || 0),
            bin: current?.bin ?? (row.staging_bin ?? null)
        });
    }
    const selectedByKey = new Map<string, number>();
    for (const line of selected || []) {
        const key = lotKey(line.mm_lot_id, line.inventory_lot_id, line.batch_no);
        selectedByKey.set(key, (selectedByKey.get(key) || 0) + Math.max(0, Number(line.quantity) || 0));
    }

    const selectedTotalByKey = [...selectedByKey.values()].reduce((sum, qty) => sum + qty, 0);
    // Nothing selected to post (covered by the empty-lines guard upstream).
    if (selectedTotalByKey <= ALLOCATION_DELTA_EPSILON) return false;

    // Added/removed lots or any per-lot quantity movement.
    const allKeys = new Set([...stagedByKey.keys(), ...selectedByKey.keys()]);
    for (const key of allKeys) {
        const stagedQty = stagedByKey.get(key)?.quantity || 0;
        const selectedQty = selectedByKey.get(key) || 0;
        if (Math.abs(selectedQty - stagedQty) > ALLOCATION_DELTA_EPSILON) return true;
    }

    // Identical lots and quantities: only a destination-bin change is committable.
    const normalizedTarget = String(targetBin ?? "").trim();
    if (!normalizedTarget) return false;
    for (const key of selectedByKey.keys()) {
        const baseline = stagedByKey.get(key);
        if (!baseline) continue;
        if (baseline.quantity <= ALLOCATION_DELTA_EPSILON) continue;
        if ((baseline.bin || "") !== normalizedTarget) return true;
    }
    return false;
}
