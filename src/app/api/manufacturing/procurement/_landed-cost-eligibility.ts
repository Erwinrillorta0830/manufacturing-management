import { DIRECTUS_URL, headers } from "./_directus";
import {
    hasLandedCostStatus,
    isLandedCostPostingEligible,
    type LandedCostStatusRecord
} from "@/modules/manufacturing-management/procurement/landed-cost-eligibility";

export class LandedCostEligibilityError extends Error {
    readonly code = "LANDED_COST_INELIGIBLE";
    readonly status = 409;

    constructor(message: string) {
        super(message);
        this.name = "LandedCostEligibilityError";
    }
}

export interface DirectusLandedCostPurchaseOrder extends LandedCostStatusRecord {
    purchase_order_id?: number;
}

async function fetchPurchaseOrderStatus(purchaseOrderId: number): Promise<DirectusLandedCostPurchaseOrder> {
    const response = await fetch(
        `${DIRECTUS_URL}/items/purchase_order/${purchaseOrderId}?fields=purchase_order_id,inventory_status,payment_status,is_posted,is_posted_amounts`,
        { headers, cache: "no-store" }
    );

    if (response.status === 404) {
        throw new Error("Purchase Order not found");
    }
    if (!response.ok) {
        throw new Error("Failed to load the current purchase order status.");
    }

    const body = await response.json();
    return (body?.data || {}) as DirectusLandedCostPurchaseOrder;
}

export async function assertLandedCostStatus(purchaseOrderId: number): Promise<DirectusLandedCostPurchaseOrder> {
    const purchaseOrder = await fetchPurchaseOrderStatus(purchaseOrderId);
    if (!hasLandedCostStatus(purchaseOrder)) {
        throw new LandedCostEligibilityError(
            `Purchase order ${purchaseOrderId} must have Inventory Status Received and Payment Status Awaiting for Payment before landed-cost processing.`
        );
    }
    return purchaseOrder;
}

export async function assertLandedCostPostingEligible(purchaseOrderId: number): Promise<DirectusLandedCostPurchaseOrder> {
    const purchaseOrder = await assertLandedCostStatus(purchaseOrderId);
    if (!isLandedCostPostingEligible(purchaseOrder)) {
        throw new LandedCostEligibilityError(
            `Purchase order ${purchaseOrderId} has already been posted and cannot be posted again.`
        );
    }
    return purchaseOrder;
}
