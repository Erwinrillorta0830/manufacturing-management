import { NextResponse } from "next/server";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../_auth";
import { fetchPurchaseOrderCatalog, PurchaseOrderDraftError } from "../_service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.procurement });
        return NextResponse.json(await fetchPurchaseOrderCatalog());
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message || "Failed to load purchase-order catalog." }, {
            status: error instanceof PurchaseOrderAuthorizationError
                ? error.status
                : error instanceof PurchaseOrderDraftError
                    ? error.status
                    : 500
        });
    }
}
