import { NextResponse } from "next/server";
import { fetchIncomingShipmentsPage } from "../procurement/shipments/shipments-helper";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "./_auth";
import { purchaseOrderListQuerySchema } from "./_schemas";
import { purchaseOrderCreateSchema } from "./_schemas";
import { createPurchaseOrderDraft, PurchaseOrderDraftError } from "./_service";
import { MrpPairValidationError } from "./_mrp-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const values = Object.fromEntries(new URL(request.url).searchParams.entries());
        const parsed = purchaseOrderListQuerySchema.safeParse(values);
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid purchase-order query.", details: parsed.error.flatten() }, { status: 400 });
        }
        const modulePaths = parsed.data.approvalStage
            ? [PURCHASE_ORDER_MODULE_PATHS.financeApproval]
            : Object.values(PURCHASE_ORDER_MODULE_PATHS);
        await requirePurchaseOrderModuleAccess({ modulePaths });
        return NextResponse.json(await fetchIncomingShipmentsPage(parsed.data));
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message || "Failed to load purchase orders." }, {
            status: error instanceof PurchaseOrderAuthorizationError ? error.status : 500
        });
    }
}

export async function POST(request: Request) {
    try {
        const parsed = purchaseOrderCreateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid purchase order.", details: parsed.error.flatten() }, { status: 400 });
        }
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.procurement });
        return NextResponse.json(await createPurchaseOrderDraft(parsed.data, actor.userId), { status: 201 });
    } catch (error) {
        const status = error instanceof PurchaseOrderAuthorizationError
            ? error.status
            : error instanceof PurchaseOrderDraftError
                ? error.status
                : error instanceof MrpPairValidationError
                    ? error.status
                : 500;
        return NextResponse.json({
            error: (error as Error).message || "Failed to create purchase order.",
            details: error instanceof PurchaseOrderDraftError || error instanceof MrpPairValidationError ? error.details : undefined
        }, { status });
    }
}
