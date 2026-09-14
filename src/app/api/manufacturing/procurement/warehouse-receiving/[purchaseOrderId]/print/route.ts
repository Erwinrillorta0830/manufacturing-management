import { NextResponse } from "next/server";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../../../purchase-orders/_auth";
import { loadWarehouseReceivingPrintableData, WarehouseReceivingPrintDataError } from "../../_print-data";
import { generateWarehouseReceivingPdf } from "../../_print-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveId(value: string | null): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function routeError(error: unknown) {
    const status = error instanceof PurchaseOrderAuthorizationError
        ? error.status
        : error instanceof WarehouseReceivingPrintDataError
            ? error.status
            : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate the warehouse receiving summary." }, { status });
}

export async function GET(request: Request, context: { params: Promise<{ purchaseOrderId: string }> }) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.warehouseReceiving });
        const purchaseOrderId = positiveId((await context.params).purchaseOrderId);
        const receivingHeaderId = positiveId(new URL(request.url).searchParams.get("receivingHeaderId"));
        if (!purchaseOrderId) return NextResponse.json({ error: "Invalid purchase-order ID." }, { status: 400 });
        if (!receivingHeaderId) return NextResponse.json({ error: "receivingHeaderId must be a positive integer." }, { status: 400 });

        const snapshot = await loadWarehouseReceivingPrintableData({ purchaseOrderId, receivingHeaderId });
        const pdf = await generateWarehouseReceivingPdf(snapshot);
        const fileName = `${snapshot.purchaseOrderNumber}_WAREHOUSE_RECEIVING_${snapshot.receiptNumber}.pdf`
            .replace(/[^a-zA-Z0-9._-]+/g, "_");
        return new NextResponse(new Uint8Array(pdf), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${fileName}"`,
                "Cache-Control": "no-store"
            }
        });
    } catch (error) {
        return routeError(error);
    }
}
