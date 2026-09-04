import { NextResponse } from "next/server";
import { fetchIncomingShipmentById, fetchShipmentLineItems } from "../../../procurement/shipments/shipments-helper";
import { ProductCategoryTypeValidationError } from "../../../procurement/_category-type";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: string): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = positiveInteger((await params).id);
        if (!id) return NextResponse.json({ error: "Invalid purchase-order ID." }, { status: 400 });

        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.procurement });

        const shipment = await fetchIncomingShipmentById(id);
        if (!shipment) return NextResponse.json({ error: "The purchase order could not be found." }, { status: 404 });

        const lines = await fetchShipmentLineItems(id, { requireCompletePackagingWeight: false });
        return NextResponse.json({ data: { shipment, lines } });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message || "Failed to load purchase-order details." }, {
            status: error instanceof PurchaseOrderAuthorizationError || error instanceof ProductCategoryTypeValidationError
                ? error.status
                : 500
        });
    }
}
