import { NextResponse } from "next/server";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../_auth";
import { PurchaseOrderFxRateError, resolvePurchaseOrderFxRate } from "../_fx-rate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.procurement });
        const currency = new URL(request.url).searchParams.get("currency") || "PHP";
        return NextResponse.json(await resolvePurchaseOrderFxRate(currency));
    } catch (error) {
        const status = error instanceof PurchaseOrderAuthorizationError
            ? error.status
            : error instanceof PurchaseOrderFxRateError
                ? error.status
                : 500;
        return NextResponse.json({
            error: (error as Error).message || "Failed to load the purchase-order exchange rate.",
            code: error instanceof PurchaseOrderFxRateError ? error.code : undefined,
            details: error instanceof PurchaseOrderFxRateError ? error.details : undefined
        }, { status });
    }
}
