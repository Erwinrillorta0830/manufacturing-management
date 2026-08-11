import type { BulkActionResult, ListCostSelectionSnapshot } from "../types";

export type BulkActionOutcome<TSnapshot extends { request_id: number } = ListCostSelectionSnapshot> = {
    result: BulkActionResult;
    snapshots: TSnapshot[];
};

export function applyBulkActionResult<TSnapshot extends { request_id: number }>(
    result: BulkActionResult,
    snapshots: TSnapshot[],
    removeSelectionIds: (ids: number[]) => void,
    setBulkActionOutcome: (outcome: BulkActionOutcome<TSnapshot> | null) => void,
) {
    if (result.unauthorized) return;

    if (result.successIds.length > 0) {
        removeSelectionIds(result.successIds);
    }
    if (result.failedIds.length > 0) {
        setBulkActionOutcome({ result, snapshots });
    } else {
        setBulkActionOutcome(null);
    }
}
