import { NextResponse } from "next/server";
import { z } from "zod";
import { getLandedCostAudit, isLandedCostError } from "../_domain";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../../purchase-orders/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const positiveId = z.coerce.number().int().positive();

function errorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : "Landed-cost audit request failed.";
    const status = error instanceof PurchaseOrderAuthorizationError
        ? error.status
        : isLandedCostError(error)
            ? error.status
            : 500;
    return NextResponse.json({
        error: message,
        ...(isLandedCostError(error) ? { code: error.code, details: error.details } : {})
    }, { status });
}

export async function GET(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.expenses });
        const purchaseOrderId = positiveId.parse(new URL(request.url).searchParams.get("purchaseOrderId"));
        return NextResponse.json(await getLandedCostAudit(purchaseOrderId));
    } catch (error) {
        return errorResponse(error);
    }
}
