import { NextResponse } from "next/server";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../_auth";
import { purchaseOrderCancellationSchema } from "../../_schemas";
import {
    cancelRejectedPurchaseOrder,
    PurchaseOrderLifecycleError
} from "../../_lifecycle-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function routeError(error: unknown) {
    const status = error instanceof PurchaseOrderAuthorizationError
        ? error.status
        : error instanceof PurchaseOrderLifecycleError
            ? error.status
            : 500;
    return NextResponse.json({
        error: (error as Error).message || "Failed to cancel purchase order.",
        details: error instanceof PurchaseOrderLifecycleError ? error.details : undefined
    }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid purchase-order ID." }, { status: 400 });
    try {
        const parsed = purchaseOrderCancellationSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid purchase-order cancellation.", details: parsed.error.flatten() }, { status: 400 });
        }
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.procurement });
        return NextResponse.json(await cancelRejectedPurchaseOrder(id, parsed.data, actor));
    } catch (error) {
        return routeError(error);
    }
}
