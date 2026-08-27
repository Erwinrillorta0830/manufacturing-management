import { NextResponse } from "next/server";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";
import { fetchReceivingDocumentTypes, ReceivingDocumentTypeError } from "../_supplier-document-type";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });
        return NextResponse.json(await fetchReceivingDocumentTypes());
    } catch (error) {
        const status = error instanceof PurchaseOrderAuthorizationError
            ? error.status
            : error instanceof ReceivingDocumentTypeError
                ? error.statusCode
                : 500;
        return NextResponse.json({ error: (error as Error).message || "Failed to load supplier document types." }, { status });
    }
}
