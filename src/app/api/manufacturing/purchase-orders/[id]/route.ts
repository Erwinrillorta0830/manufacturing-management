import { NextResponse } from "next/server";
import { fetchShipmentLineItems } from "../../procurement/shipments/shipments-helper";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../_auth";
import { ProductCategoryTypeValidationError } from "../../procurement/_category-type";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function idFrom(value: string): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePaths: Object.values(PURCHASE_ORDER_MODULE_PATHS) });
        const id = idFrom((await context.params).id);
        if (!id) return NextResponse.json({ error: "Invalid purchase-order ID." }, { status: 400 });
        // QA Receiving must be able to inspect a PO even when packaging master data
        // is incomplete. Landed-cost preview/finalization keeps the strict check.
        return NextResponse.json({
            data: await fetchShipmentLineItems(id, { requireCompletePackagingWeight: false })
        });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message || "Failed to load purchase-order details." }, {
            status: error instanceof PurchaseOrderAuthorizationError || error instanceof ProductCategoryTypeValidationError ? error.status : 500
        });
    }
}

export async function PUT(_request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.procurement });
        const id = idFrom((await context.params).id);
        if (!id) return NextResponse.json({ error: "Invalid purchase-order ID." }, { status: 400 });
        return NextResponse.json({
            error: "Direct purchase-order edits are disabled after creation. Use the Finance-rejection revision workflow."
        }, { status: 409 });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message || "Failed to edit purchase order." }, {
            status: error instanceof PurchaseOrderAuthorizationError ? error.status : 500
        });
    }
}
