import { NextResponse } from "next/server";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../_auth";
import { purchaseOrderRevisionSchema } from "../../_schemas";
import {
    PurchaseOrderLifecycleError,
    reviseRejectedPurchaseOrder
} from "../../_lifecycle-service";
import { MrpPairValidationError } from "../../_mrp-validation";
import { ProductCategoryTypeValidationError } from "../../../procurement/_category-type";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function routeError(error: unknown) {
    const status = error instanceof PurchaseOrderAuthorizationError
        ? error.status
        : error instanceof PurchaseOrderLifecycleError
            ? error.status
            : error instanceof MrpPairValidationError
                ? error.status
            : error instanceof ProductCategoryTypeValidationError
                ? error.status
            : 500;
    return NextResponse.json({
        error: (error as Error).message || "Failed to revise purchase order.",
        details: error instanceof PurchaseOrderLifecycleError || error instanceof MrpPairValidationError || error instanceof ProductCategoryTypeValidationError ? error.details : undefined
    }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid purchase-order ID." }, { status: 400 });
    try {
        const body = await request.json().catch(() => null);
        const parsed = purchaseOrderRevisionSchema.safeParse({ ...(body || {}), shipmentId: id });
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid purchase-order revision.", details: parsed.error.flatten() }, { status: 400 });
        }
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.procurement });
        return NextResponse.json(await reviseRejectedPurchaseOrder(id, parsed.data, actor));
    } catch (error) {
        return routeError(error);
    }
}
