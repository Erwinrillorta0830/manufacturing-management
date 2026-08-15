import type { IncomingShipment, ShipmentLineItem } from "../../procurement/types";
import type {
    PurchaseOrderApprovalCommand,
    PurchaseOrderApprovalDetail,
    PurchaseOrderCatalog,
    PurchaseOrderDecisionStage,
    PurchaseOrderDraftPayload,
    PurchaseOrderListQuery,
    PurchaseOrderListResponse
} from "../types";

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        const details = body?.details;
        const lineDetail = details && typeof details === "object" && typeof details.lineIndex === "number"
            ? ` (Line ${details.lineIndex + 1}${details.productId ? `, product ${details.productId}` : ""})`
            : "";
        throw new Error(`${body?.error || fallback}${lineDetail}`);
    }
    return response.json();
}

export async function fetchPurchaseOrders(query: PurchaseOrderListQuery = {}, signal?: AbortSignal) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== "") params.set(key, String(value));
    });
    const response = await fetch(`/api/manufacturing/purchase-orders?${params.toString()}`, { signal });
    return responseJson<PurchaseOrderListResponse<IncomingShipment>>(response, "Failed to load purchase orders.");
}

export async function fetchPurchaseOrderLines(id: number, signal?: AbortSignal) {
    const response = await fetch(`/api/manufacturing/purchase-orders/${id}`, { signal });
    const body = await responseJson<{ data: ShipmentLineItem[] }>(response, "Failed to load purchase-order lines.");
    return body.data;
}

export async function fetchPurchaseOrderCatalog(signal?: AbortSignal) {
    const response = await fetch("/api/manufacturing/purchase-orders/catalog", { signal });
    return responseJson<PurchaseOrderCatalog>(response, "Failed to load purchase-order catalog.");
}

export async function createPurchaseOrder(payload: PurchaseOrderDraftPayload) {
    const response = await fetch("/api/manufacturing/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    return responseJson(response, "Failed to create purchase order.");
}

export async function editPurchaseOrder(id: number, shipmentData: unknown, lineItems: unknown[]) {
    const response = await fetch(`/api/manufacturing/purchase-orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentData, lineItems })
    });
    return responseJson(response, "Failed to edit purchase order.");
}

export async function reviseRejectedPurchaseOrder(id: number, shipmentData: unknown, lineItems: unknown[], workflowRevision: number) {
    const response = await fetch(`/api/manufacturing/purchase-orders/${id}/revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentData, lineItems, workflowRevision })
    });
    return responseJson(response, "Failed to revise purchase order.");
}

export async function cancelRejectedPurchaseOrder(id: number, workflowRevision: number, remarks?: string) {
    const response = await fetch(`/api/manufacturing/purchase-orders/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowRevision, remarks })
    });
    return responseJson(response, "Failed to cancel purchase order.");
}

export async function updatePurchaseOrderStatus(id: number, status: string) {
    const response = await fetch(`/api/manufacturing/purchase-orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
    });
    return responseJson(response, "Failed to update purchase-order status.");
}

export async function fetchPurchaseOrderApproval(id: number, approvalStage: PurchaseOrderDecisionStage, signal?: AbortSignal) {
    const params = new URLSearchParams({ approvalStage });
    const response = await fetch(`/api/manufacturing/purchase-orders/${id}/approvals?${params.toString()}`, { signal });
    const body = await responseJson<{ data: PurchaseOrderApprovalDetail }>(response, "Failed to load purchase-order approval details.");
    return body.data;
}

export async function submitPurchaseOrderWorkflowAction(id: number, payload: PurchaseOrderApprovalCommand, approvalStage: PurchaseOrderDecisionStage) {
    const params = new URLSearchParams({ approvalStage });
    const response = await fetch(`/api/manufacturing/purchase-orders/${id}/approvals?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    return responseJson<{ success: true; status: string; workflowRevision: number }>(response, "Failed to submit purchase-order approval.");
}
