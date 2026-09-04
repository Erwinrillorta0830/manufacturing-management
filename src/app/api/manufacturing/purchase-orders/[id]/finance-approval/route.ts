import { NextResponse } from "next/server";
import { fetchShipmentLineItems, fetchIncomingShipmentById } from "../../../procurement/shipments/shipments-helper";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../_auth";
import {
    getPurchaseOrderApprovalDetail,
    PurchaseOrderApprovalError
} from "../../_approval-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function idFrom(value: string): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function routeError(error: unknown) {
    const status = error instanceof PurchaseOrderAuthorizationError
        ? error.status
        : error instanceof PurchaseOrderApprovalError
            ? error.status
            : 500;
    return NextResponse.json({
        error: (error as Error).message || "Failed to load Finance approval details."
    }, { status });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    const id = idFrom((await context.params).id);
    if (!id) return NextResponse.json({ error: "Invalid purchase-order ID." }, { status: 400 });

    try {
        await requirePurchaseOrderModuleAccess({
            modulePath: PURCHASE_ORDER_MODULE_PATHS.financeApproval,
            approvalStage: "Finance"
        });

        const shipment = await fetchIncomingShipmentById(id);
        if (!shipment) {
            return NextResponse.json({ error: "Purchase order was not found." }, { status: 404 });
        }

        const [lineItems, approvalDetail] = await Promise.all([
            fetchShipmentLineItems(id, { requireCompletePackagingWeight: false }),
            getPurchaseOrderApprovalDetail(id, "Finance")
        ]);

        return NextResponse.json({
            data: {
                shipment,
                lineItems,
                approvalDetail
            }
        });
    } catch (error) {
        return routeError(error);
    }
}
