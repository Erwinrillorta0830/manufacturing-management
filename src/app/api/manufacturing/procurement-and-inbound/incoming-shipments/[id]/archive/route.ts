import { NextResponse } from "next/server";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../_auth";
import {
    loadPurchaseOrderArchiveStatus,
    PurchaseOrderPrintArchiveError
} from "../../_print/archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function purchaseOrderId(value: string): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function routeError(error: unknown) {
    const status = error instanceof PurchaseOrderAuthorizationError || error instanceof PurchaseOrderPrintArchiveError
        ? error.status
        : 500;
    return NextResponse.json({ error: (error as Error).message || "Unable to load the purchase-order archive status." }, { status });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePaths: Object.values(PURCHASE_ORDER_MODULE_PATHS) });
        const id = purchaseOrderId((await context.params).id);
        if (!id) return NextResponse.json({ error: "Invalid purchase-order ID." }, { status: 400 });
        return NextResponse.json({ data: await loadPurchaseOrderArchiveStatus(id) });
    } catch (error) {
        return routeError(error);
    }
}
