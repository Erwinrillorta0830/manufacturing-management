import { procurementDirectusFetch } from "../procurement/_directus";
import { INVENTORY_STATUS, PAYMENT_STATUS, todayInManila } from "../procurement/_domain";
import { acceptedQuantity } from "./_receiving-status";
import { summarizeReceivingHistory } from "./_receiving-history";
import {
    FORCE_RECEIVED_ACTION,
    FORCE_RECEIVED_STAGE,
    ForceReceivedError,
    evaluateForceReceivedEligibility,
    isForceReceived,
    parseForceReceivedRevisionSnapshot,
    remainingReceivingQuantity,
    type ForceReceivedLineSnapshot,
    type ForceReceivedRevisionSnapshot
} from "./_force-received";
import type { AuthorizedPurchaseOrderUser } from "../purchase-orders/_auth";

const activeForceReceived = new Set<number>();

function rows(body: unknown): Record<string, unknown>[] {
    return body && typeof body === "object" && "data" in body && Array.isArray(body.data)
        ? body.data as Record<string, unknown>[]
        : [];
}

async function directusJson(path: string, init?: RequestInit) {
    const response = await procurementDirectusFetch(path, init);
    const body = await response.json().catch(() => null);
    return { response, body };
}

async function loadOrder(shipmentId: number) {
    const { response, body } = await directusJson(
        `/items/purchase_order/${shipmentId}?fields=purchase_order_id,inventory_status,payment_status,workflow_revision,date_received,force_received_at,force_received_by,force_received_reason`
    );
    if (response.status === 404 || !body?.data) throw new ForceReceivedError("Purchase order not found.", 404);
    if (!response.ok) throw new ForceReceivedError("Unable to load the purchase order.", 503);
    return body.data as Record<string, unknown>;
}

async function loadLines(shipmentId: number) {
    const { response, body } = await directusJson(
        `/items/purchase_order_products?filter[purchase_order_id][_eq]=${shipmentId}&fields=purchase_order_product_id,purchase_order_id,product_id,ordered_quantity&limit=-1`
    );
    if (!response.ok) throw new ForceReceivedError("Unable to load purchase-order lines.", 503);
    return rows(body);
}

async function loadReceiving(shipmentId: number) {
    let { response, body } = await directusJson(
        `/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${shipmentId}&filter[is_reverted][_eq]=0&fields=purchase_order_product_id,purchase_order_line_id,product_id,received_quantity,quantity_rejected,is_replacement&limit=-1`
    );
    if (!response.ok) {
        ({ response, body } = await directusJson(
            `/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${shipmentId}&filter[is_reverted][_eq]=0&fields=purchase_order_product_id,product_id,received_quantity,quantity_rejected,is_replacement&limit=-1`
        ));
    }
    if (!response.ok) throw new ForceReceivedError("Unable to load receiving history.", 503);
    return rows(body);
}

async function loadForceReceivedHistory(shipmentId: number) {
    const { response, body } = await directusJson(
        `/items/purchase_order_approval_history?filter[purchase_order_id][_eq]=${shipmentId}&filter[action][_eq]=${FORCE_RECEIVED_ACTION}&fields=history_id,action,remarks,revision_snapshot,actor_id,created_at&sort=-history_id,-created_at&limit=1`
    );
    if (!response.ok) throw new ForceReceivedError("Unable to load force-received history.", 503);
    return rows(body)[0] || null;
}

function lineSnapshots(
    poLines: Record<string, unknown>[],
    receivingRows: Record<string, unknown>[]
): ForceReceivedLineSnapshot[] {
    const history = summarizeReceivingHistory(receivingRows, poLines);
    if (history.unresolvedRows.length > 0) {
        throw new ForceReceivedError(
            "Existing receiving records could not be matched to a purchase-order line. Reconciliation is required before Force Received.",
            409
        );
    }
    return poLines.map(line => {
        const lineId = Number(line.purchase_order_product_id);
        const orderedQuantity = Number(line.ordered_quantity || 0);
        const previous = history.byLine.get(lineId) || { received: 0, rejected: 0, accepted: 0 };
        if (!Number.isSafeInteger(lineId) || lineId <= 0 || !Number.isFinite(orderedQuantity) || orderedQuantity <= 0) {
            throw new ForceReceivedError("A purchase-order line has invalid ordered quantity data.", 409);
        }
        const accepted = acceptedQuantity(previous.received, previous.rejected);
        return {
            lineId,
            orderedQuantity,
            receivedQuantity: Math.max(0, previous.received),
            acceptedQuantity: accepted,
            remainingQuantity: remainingReceivingQuantity(false, orderedQuantity - previous.received),
            remainingAcceptedQuantity: remainingReceivingQuantity(false, orderedQuantity - accepted)
        };
    });
}

function successPayload(
    order: Record<string, unknown>,
    lines: ForceReceivedLineSnapshot[],
    actor: AuthorizedPurchaseOrderUser,
    idempotent: boolean
) {
    return {
        shipmentId: Number(order.purchase_order_id),
        status: "Received",
        inventoryStatus: INVENTORY_STATUS.RECEIVED,
        paymentStatus: PAYMENT_STATUS.AWAITING_PAYMENT,
        workflowRevision: Number(order.workflow_revision || 0),
        isForceReceived: true,
        forceReceivedAt: order.force_received_at || null,
        forceReceivedBy: actor.userId,
        forceReceivedByName: actor.displayName,
        forceReceivedReason: order.force_received_reason || null,
        idempotent,
        lines: lines.map(line => ({
            ...line,
            remainingQuantity: 0,
            remainingAcceptedQuantity: 0
        }))
    };
}

async function conditionalPatch(id: number, expectedRevision: number, data: Record<string, unknown>) {
    const response = await procurementDirectusFetch(
        "/items/purchase_order?fields=purchase_order_id,inventory_status,payment_status,workflow_revision,date_received,force_received_at,force_received_by,force_received_reason",
        {
            method: "PATCH",
            body: JSON.stringify({
                query: {
                    filter: {
                        purchase_order_id: { _eq: id },
                        workflow_revision: { _eq: expectedRevision }
                    },
                    limit: 1
                },
                data
            })
        }
    );
    if (!response.ok) throw new ForceReceivedError("Unable to update the purchase-order workflow.", 503);
    const updated = rows(await response.json());
    return updated.length === 1 ? updated[0] : null;
}

export async function forceReceivePurchaseOrder(input: {
    shipmentId: number;
    workflowRevision: number;
    reason: string;
    idempotencyKey: string;
    actor: AuthorizedPurchaseOrderUser;
}) {
    const { shipmentId, workflowRevision, reason, idempotencyKey, actor } = input;
    if (activeForceReceived.has(shipmentId)) {
        throw new ForceReceivedError("This purchase order is already being force-received.", 409);
    }
    activeForceReceived.add(shipmentId);
    try {
        const order = await loadOrder(shipmentId);
        const poLines = await loadLines(shipmentId);
        if (poLines.length === 0) throw new ForceReceivedError("This purchase order has no purchase-order lines.", 409);
        const receivingRows = await loadReceiving(shipmentId);
        const snapshots = lineSnapshots(poLines, receivingRows);

        if (isForceReceived(order.force_received_at)) {
            const history = await loadForceReceivedHistory(shipmentId);
            const snapshot = parseForceReceivedRevisionSnapshot(history?.revision_snapshot);
            if (snapshot?.idempotencyKey === idempotencyKey) {
                return successPayload(order, snapshot.lines.length > 0 ? snapshot.lines : snapshots, actor, true);
            }
            throw new ForceReceivedError("This purchase order is already force-received.", 409);
        }

        const eligibility = evaluateForceReceivedEligibility({
            inventoryStatus: order.inventory_status,
            workflowRevision: order.workflow_revision,
            expectedWorkflowRevision: workflowRevision,
            forceReceivedAt: order.force_received_at,
            paymentStatus: order.payment_status
        });
        if (!eligibility.ok) throw new ForceReceivedError(eligibility.message, eligibility.status);
        if (!snapshots.some(line => line.remainingAcceptedQuantity > 0)) {
            throw new ForceReceivedError("This purchase order has no remaining accepted quantity to close.", 409);
        }

        const revision = Number(order.workflow_revision || 0);
        const nextRevision = revision + 1;
        const now = new Date().toISOString();
        const headerPatch = {
            inventory_status: INVENTORY_STATUS.RECEIVED,
            payment_status: PAYMENT_STATUS.AWAITING_PAYMENT,
            date_received: todayInManila(),
            force_received_at: now,
            force_received_by: actor.userId,
            force_received_reason: reason,
            workflow_revision: nextRevision
        };
        const updated = await conditionalPatch(shipmentId, revision, headerPatch);
        if (!updated) {
            throw new ForceReceivedError("Another receiving action changed this purchase order. Reload and try again.", 409);
        }

        const revisionSnapshot: ForceReceivedRevisionSnapshot = {
            kind: FORCE_RECEIVED_ACTION,
            idempotencyKey,
            lines: snapshots
        };
        const historyResponse = await procurementDirectusFetch("/items/purchase_order_approval_history", {
            method: "POST",
            body: JSON.stringify({
                purchase_order_id: shipmentId,
                action: FORCE_RECEIVED_ACTION,
                approval_stage: FORCE_RECEIVED_STAGE,
                actor_id: actor.userId,
                actor_role_id: actor.roleId,
                remarks: reason,
                from_inventory_status: INVENTORY_STATUS.PARTIALLY_RECEIVED,
                to_inventory_status: INVENTORY_STATUS.RECEIVED,
                revision_before: revision,
                revision_after: nextRevision,
                revision_snapshot: revisionSnapshot,
                created_at: now
            })
        });
        if (!historyResponse.ok) {
            const rolledBack = await conditionalPatch(shipmentId, nextRevision, {
                inventory_status: order.inventory_status,
                payment_status: order.payment_status ?? null,
                date_received: order.date_received || null,
                force_received_at: null,
                force_received_by: null,
                force_received_reason: null,
                workflow_revision: revision
            }).catch(() => null);
            throw new ForceReceivedError(
                rolledBack
                    ? "Force Received history could not be recorded. The workflow change was rolled back."
                    : "Force Received history could not be recorded and automatic rollback failed.",
                503
            );
        }

        return successPayload(updated, snapshots, actor, false);
    } finally {
        activeForceReceived.delete(shipmentId);
    }
}
