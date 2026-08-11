import { NextResponse } from "next/server";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";
import {
    fetchPurchaseQaParameters,
    PurchaseQaConfigurationError
} from "../_purchase-specifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        await requirePurchaseOrderModuleAccess({
            modulePaths: [PURCHASE_ORDER_MODULE_PATHS.receiving, PURCHASE_ORDER_MODULE_PATHS.rawMaterials]
        });
        return NextResponse.json({ data: await fetchPurchaseQaParameters() });
    } catch (error) {
        const status = error instanceof PurchaseOrderAuthorizationError || error instanceof PurchaseQaConfigurationError
            ? error.status
            : 500;
        return NextResponse.json({ error: (error as Error).message || "Failed to load QA parameters." }, { status });
    }
}
