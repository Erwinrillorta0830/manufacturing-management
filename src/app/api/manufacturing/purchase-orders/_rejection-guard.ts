import { procurementDirectusFetch } from "../procurement/_directus";
import { INVENTORY_STATUS } from "../procurement/_domain";

export type PurchaseOrderRejectionStage = "Finance";

interface PurchaseOrderRejectionCandidate {
    purchaseOrderId: number;
    inventoryStatus: number | null;
    workflowRevision: number;
}

interface ApprovalHistoryRow {
    history_id?: number | string | null;
    purchase_order_id?: number | string | { purchase_order_id?: number | string; id?: number | string } | null;
    action?: string | null;
    approval_stage?: string | null;
    revision_after?: number | string | null;
    created_at?: string | null;
}

function positiveId(value: unknown): number | null {
    const raw = value && typeof value === "object"
        ? (value as { purchase_order_id?: unknown; id?: unknown }).purchase_order_id
            ?? (value as { purchase_order_id?: unknown; id?: unknown }).id
        : value;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function historyRank(row: ApprovalHistoryRow): [number, number, number] {
    const revision = Number(row.revision_after || 0);
    const timestamp = Date.parse(String(row.created_at || "")) || 0;
    const historyId = Number(row.history_id || 0);
    return [Number.isFinite(revision) ? revision : 0, timestamp, Number.isFinite(historyId) ? historyId : 0];
}

function compareHistory(left: ApprovalHistoryRow, right: ApprovalHistoryRow): number {
    const leftRank = historyRank(left);
    const rightRank = historyRank(right);
    for (let index = 0; index < leftRank.length; index += 1) {
        if (leftRank[index] !== rightRank[index]) return leftRank[index] - rightRank[index];
    }
    return 0;
}

export async function fetchCurrentPurchaseOrderRejectionStages(
    candidates: readonly PurchaseOrderRejectionCandidate[]
): Promise<Map<number, PurchaseOrderRejectionStage>> {
    const eligible = candidates.filter(candidate =>
        Number(candidate.inventoryStatus) === INVENTORY_STATUS.REJECTED
        && Number.isSafeInteger(candidate.purchaseOrderId)
        && candidate.purchaseOrderId > 0
    );
    const result = new Map<number, PurchaseOrderRejectionStage>();
    if (eligible.length === 0) return result;

    const ids = [...new Set(eligible.map(candidate => candidate.purchaseOrderId))];
    const params = new URLSearchParams({
        fields: "history_id,purchase_order_id,action,approval_stage,revision_after,created_at",
        limit: "-1",
        sort: "revision_after,created_at,history_id"
    });
    params.set("filter[purchase_order_id][_in]", ids.join(","));
    params.set("filter[action][_eq]", "Rejected");

    const response = await procurementDirectusFetch(`/items/purchase_order_approval_history?${params.toString()}`);
    if (!response.ok) throw new Error("Unable to load purchase-order rejection history.");
    const rows = ((await response.json()).data || []) as ApprovalHistoryRow[];
    const candidateById = new Map(eligible.map(candidate => [candidate.purchaseOrderId, candidate]));
    const latestById = new Map<number, ApprovalHistoryRow>();

    for (const row of rows) {
        const purchaseOrderId = positiveId(row.purchase_order_id);
        if (!purchaseOrderId || !candidateById.has(purchaseOrderId)) continue;
        const current = latestById.get(purchaseOrderId);
        if (!current || compareHistory(current, row) < 0) latestById.set(purchaseOrderId, row);
    }

    for (const [purchaseOrderId, row] of latestById) {
        const candidate = candidateById.get(purchaseOrderId);
        const revision = Number(row.revision_after || 0);
        if (!candidate || revision !== candidate.workflowRevision) continue;
        if (row.approval_stage === "Finance") {
            result.set(purchaseOrderId, row.approval_stage);
        }
    }

    return result;
}

export async function fetchCurrentPurchaseOrderRejectionStage(
    purchaseOrderId: number,
    inventoryStatus: number | null,
    workflowRevision: number
): Promise<PurchaseOrderRejectionStage | null> {
    const stages = await fetchCurrentPurchaseOrderRejectionStages([{
        purchaseOrderId,
        inventoryStatus,
        workflowRevision
    }]);
    return stages.get(purchaseOrderId) || null;
}

