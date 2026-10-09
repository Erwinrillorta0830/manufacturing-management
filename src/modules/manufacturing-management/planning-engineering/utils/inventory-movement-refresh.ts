type RelationValue = number | string | { id?: number | string; branch_id?: number | string; product_id?: number | string } | null | undefined;

export interface InventoryMovementEvent {
    branch_id?: RelationValue;
    product_id?: RelationValue;
}

function relationId(value: RelationValue, relationKey: "branch_id" | "product_id"): number | null {
    const rawValue = typeof value === "object" && value !== null
        ? value[relationKey] ?? value.id
        : value;
    const id = Number(rawValue);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function isRelevantInventoryMovement(
    movement: InventoryMovementEvent,
    selectedBranchId: number | null,
    demandProductIds: ReadonlySet<number>
): boolean {
    if (selectedBranchId === null || demandProductIds.size === 0) return false;

    const movementBranchId = relationId(movement.branch_id, "branch_id");
    const movementProductId = relationId(movement.product_id, "product_id");
    return movementBranchId === selectedBranchId
        && movementProductId !== null
        && demandProductIds.has(movementProductId);
}

export interface InventoryRefreshSchedulerOptions {
    debounceMs?: number;
    maxWaitMs?: number;
}

export function createInventoryRefreshScheduler(
    refresh: () => Promise<void>,
    { debounceMs = 500, maxWaitMs = 3000 }: InventoryRefreshSchedulerOptions = {}
) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshInFlight = false;
    let refreshPending = false;
    let isDisposed = false;

    const clearTimers = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        if (maxWaitTimer) clearTimeout(maxWaitTimer);
        debounceTimer = null;
        maxWaitTimer = null;
    };

    const flush = async () => {
        clearTimers();
        if (isDisposed) return;
        if (refreshInFlight) {
            refreshPending = true;
            return;
        }

        refreshInFlight = true;
        do {
            refreshPending = false;
            try {
                await refresh();
            } catch (error) {
                console.error("Failed to refresh planning inventory requirements:", error);
            }
        } while (refreshPending && !isDisposed);
        refreshInFlight = false;
    };

    return {
        schedule() {
            if (isDisposed) return;
            if (refreshInFlight) {
                refreshPending = true;
                return;
            }

            if (!maxWaitTimer) {
                maxWaitTimer = setTimeout(() => void flush(), maxWaitMs);
            }
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => void flush(), debounceMs);
        },
        dispose() {
            isDisposed = true;
            refreshPending = false;
            clearTimers();
        }
    };
}
