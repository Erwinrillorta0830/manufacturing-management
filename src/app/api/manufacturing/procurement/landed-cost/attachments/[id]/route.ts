import { NextResponse } from "next/server";
import { deleteLandedCostAttachment, isLandedCostError } from "../../_domain";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../../../purchase-orders/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : "Computation attachment deletion failed.";
    const status = error instanceof PurchaseOrderAuthorizationError
        ? error.status
        : isLandedCostError(error)
            ? error.status
            : 500;
    return NextResponse.json({ error: message, ...(isLandedCostError(error) ? { code: error.code } : {}) }, { status });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.expenses });
        const { id } = await context.params;
        const attachmentId = Number(id);
        const purchaseOrderId = Number(new URL(request.url).searchParams.get("purchaseOrderId"));
        if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0 || !Number.isSafeInteger(purchaseOrderId) || purchaseOrderId <= 0) {
            return NextResponse.json({ error: "attachment id and purchaseOrderId are required." }, { status: 400 });
        }
        await deleteLandedCostAttachment({ purchaseOrderId, attachmentId });
        return new Response(null, { status: 204 });
    } catch (error) {
        return errorResponse(error);
    }
}
