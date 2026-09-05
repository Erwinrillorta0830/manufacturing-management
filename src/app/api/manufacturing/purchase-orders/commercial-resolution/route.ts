import { NextResponse } from "next/server";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../_auth";
import { purchaseOrderCommercialResolutionSchema } from "../_schemas";
import {
    PurchaseOrderCommercialResolutionError,
    PurchaseOrderPriceTypeError,
    resolvePurchaseOrderCommercialTerms
} from "../_commercial-resolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.procurement });
        const parsed = purchaseOrderCommercialResolutionSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid purchase-order commercial lookup.", details: parsed.error.flatten() }, { status: 400 });
        }
        return NextResponse.json(await resolvePurchaseOrderCommercialTerms(parsed.data.supplierId, parsed.data.productIds));
    } catch (error) {
        const status = error instanceof PurchaseOrderAuthorizationError
            ? error.status
            : error instanceof PurchaseOrderCommercialResolutionError || error instanceof PurchaseOrderPriceTypeError
                ? error.status
                : 500;
        return NextResponse.json({
            error: (error as Error).message || "Failed to resolve purchase-order commercial terms.",
            details: error instanceof PurchaseOrderCommercialResolutionError || error instanceof PurchaseOrderPriceTypeError
                ? error.details
                : undefined
        }, { status });
    }
}
