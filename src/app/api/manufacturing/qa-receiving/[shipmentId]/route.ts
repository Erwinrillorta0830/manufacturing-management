import { NextResponse } from "next/server";
import { fetchIncomingShipmentById, fetchShipmentLineItems } from "../../procurement/shipments/shipments-helper";
import { isReceivingQueueShipmentStatus } from "../../procurement/_domain";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";
import { fetchQuarantineDisposition, QuarantineDispositionError, type QuarantineDisposition } from "../_quarantine-disposition";
import { ProductCategoryTypeValidationError } from "../../procurement/_category-type";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class QaReceivingDetailError extends Error {
    constructor(
        public readonly status: 400 | 404 | 409,
        message: string
    ) {
        super(message);
    }
}

function positiveInteger(value: string): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ shipmentId: string }> }
) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });

        const shipmentId = positiveInteger((await params).shipmentId);
        if (!shipmentId) {
            throw new QaReceivingDetailError(400, "The purchase-order ID must be a positive integer.");
        }

        const shipment = await fetchIncomingShipmentById(shipmentId);
        if (!shipment) {
            throw new QaReceivingDetailError(404, "The purchase order could not be found.");
        }

        const eligibleForReceiving = shipment.status === "Received"
            || isReceivingQueueShipmentStatus(shipment.inventory_status ?? shipment.status);
        if (!eligibleForReceiving) {
            throw new QaReceivingDetailError(409, "This purchase order is not eligible for QA receiving.");
        }

        const replacementDispositionParam = new URL(request.url).searchParams.get("replacementDispositionId");
        let replacementDisposition: QuarantineDisposition | null = null;
        if (replacementDispositionParam !== null) {
            const replacementDispositionId = positiveInteger(replacementDispositionParam);
            if (!replacementDispositionId) {
                throw new QaReceivingDetailError(400, "The replacement disposition ID must be a positive integer.");
            }

            const disposition = await fetchQuarantineDisposition(replacementDispositionId);
            if (disposition.purchaseOrderId !== shipmentId) {
                throw new QaReceivingDetailError(409, "The replacement disposition does not belong to this purchase order.");
            }
            if (disposition.dispositionType !== "REPLACEMENT") {
                throw new QaReceivingDetailError(409, "Only replacement dispositions can start replacement receiving.");
            }
            if (disposition.status === "COMPLETED" || disposition.status === "CANCELLED") {
                throw new QaReceivingDetailError(409, "The replacement disposition is already closed.");
            }
            replacementDisposition = disposition;
        }

        const lineItems = await fetchShipmentLineItems(shipmentId, { requireCompletePackagingWeight: false });
        if (lineItems.length === 0) {
            throw new QaReceivingDetailError(409, "This purchase order has no receiving lines available for inspection.");
        }

        return NextResponse.json({
            data: {
                shipment,
                lineItems,
                replacementDisposition
            }
        });
    } catch (error) {
        const status = error instanceof QaReceivingDetailError
            ? error.status
            : error instanceof PurchaseOrderAuthorizationError
                ? error.status
                : error instanceof QuarantineDispositionError
                    ? error.statusCode
                    : error instanceof ProductCategoryTypeValidationError
                        ? error.status
                        : 500;
        return NextResponse.json({ error: (error as Error).message || "Failed to load QA receiving details." }, { status });
    }
}
