import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../_directus";
import { canTransitionInventoryStatus, INVENTORY_STATUS, shipmentStatusToInventoryStatus } from "../_domain";
import {
    fetchIncomingShipments, 
    fetchShipmentLineItems, 
    createIncomingShipment,
    updateIncomingShipmentStatus
} from "./shipments-helper";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";
import {
    modulesForStatus,
    legacyPurchaseOrderCreateSchema,
    purchaseOrderStatusUpdateSchema
} from "../../purchase-orders/_schemas";
import { MrpPairValidationError } from "../../purchase-orders/_mrp-validation";

class InvalidTransitionError extends Error {}

async function requireAllowedTransition(shipmentId: number, targetStatus: number): Promise<void> {
    const response = await fetch(`${DIRECTUS_URL}/items/purchase_order/${shipmentId}?fields=inventory_status,payment_status,approver_id,approval_requires_finance`, { headers, cache: "no-store" });
    if (!response.ok) throw new Error("Failed to load the current purchase order status.");
    const order = (await response.json()).data || {};
    const currentStatus = Number(order.inventory_status || 0);
    if (currentStatus === INVENTORY_STATUS.PARTIALLY_RECEIVED) {
        throw new InvalidTransitionError("Partially received purchase orders are view-only and cannot be changed.");
    }
    if (!canTransitionInventoryStatus(currentStatus, targetStatus)) {
        throw new InvalidTransitionError(`Invalid purchase order status transition from ${currentStatus} to ${targetStatus}.`);
    }
    if (targetStatus === INVENTORY_STATUS.EN_ROUTE) {
        if (currentStatus !== INVENTORY_STATUS.APPROVED) {
            throw new InvalidTransitionError("Plant approval is required before dispatch.");
        }
    }
}

export async function GET(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({
            modulePaths: Object.values(PURCHASE_ORDER_MODULE_PATHS)
        });
        const { searchParams } = new URL(request.url);
        const shipmentId = searchParams.get("shipmentId");

        if (shipmentId) {
            const lineItems = await fetchShipmentLineItems(parseInt(shipmentId));
            return NextResponse.json(lineItems);
        }

        const shipments = await fetchIncomingShipments();
        return NextResponse.json(shipments);
    } catch (e) {
        console.error("API Error fetching shipments:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch shipments" }, {
            status: e instanceof PurchaseOrderAuthorizationError ? e.status : 500
        });
    }
}

export async function POST(request: Request) {
    try {
        const rawBody = await request.json();
        const { isReceiveLog } = rawBody;

        if (isReceiveLog) {
            return NextResponse.json(
                { error: "Direct receiving is disabled. Submit inspected receipts through the QA receiving endpoint." },
                { status: 410 }
            );
        }
        const parsed = legacyPurchaseOrderCreateSchema.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid purchase order.", details: parsed.error.flatten() }, { status: 400 });
        }
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.procurement });
        const result = await createIncomingShipment(parsed.data.shipmentData, parsed.data.lineItems, actor.userId);
        return NextResponse.json(result);
    } catch (e) {
        console.error("API Error creating incoming shipment:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to create shipment" }, {
            status: e instanceof PurchaseOrderAuthorizationError || e instanceof MrpPairValidationError ? e.status : 500
        });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { shipmentId, action } = body;

        if (!shipmentId) {
            return NextResponse.json({ error: "Missing required field (shipmentId)" }, { status: 400 });
        }

        if (action === "approve") {
            return NextResponse.json({ error: "Legacy approval is disabled. Use the revision-guarded purchase-order approval endpoint." }, { status: 410 });
        }
        if (action === "reject") {
            return NextResponse.json({ error: "Legacy rejection is disabled. Use the revision-guarded purchase-order approval endpoint." }, { status: 410 });
        }

        const parsed = purchaseOrderStatusUpdateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid status update.", details: parsed.error.flatten() }, { status: 400 });
        if (parsed.data.status === "Approved" || parsed.data.status === "Awaiting Payment" || parsed.data.status === "Rejected") {
            return NextResponse.json({ error: "Approved, Awaiting Payment, and Rejected transitions must use their dedicated workflow endpoints." }, { status: 409 });
        }
        if (parsed.data.status === "Cancelled") {
            return NextResponse.json({ error: "Purchase orders can only be cancelled after a formal Finance rejection." }, { status: 409 });
        }
        const actor = await requirePurchaseOrderModuleAccess({ modulePaths: modulesForStatus(parsed.data.status) });
        await requireAllowedTransition(parsed.data.shipmentId, shipmentStatusToInventoryStatus(parsed.data.status));

        const result = await updateIncomingShipmentStatus(parsed.data.shipmentId, parsed.data.status, actor.userId, parsed.data.lead_time_receiving);
        return NextResponse.json(result);
    } catch (e) {
        console.error("API Error updating shipment status:", e);
        return NextResponse.json(
            { error: (e as Error).message || "Failed to update shipment status" },
            { status: e instanceof PurchaseOrderAuthorizationError ? e.status : e instanceof InvalidTransitionError ? 409 : 500 }
        );
    }
}

export async function PUT() {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.procurement });
        return NextResponse.json({
            error: "Direct purchase-order edits are disabled after creation. Use the Finance-rejection revision workflow."
        }, { status: 409 });
    } catch (e) {
        console.error("API Error updating shipment:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to update shipment" }, {
            status: e instanceof PurchaseOrderAuthorizationError ? e.status : 500
        });
    }
}
