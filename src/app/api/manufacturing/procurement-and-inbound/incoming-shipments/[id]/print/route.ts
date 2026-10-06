import { NextResponse } from "next/server";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../_auth";
import { archivePurchaseOrderPdf, PurchaseOrderPrintArchiveError } from "../../_print/archive";
import { loadPurchaseOrderPrintableData, PurchaseOrderPrintDataError } from "../../_print/data";
import { generatePurchaseOrderPdf } from "../../_print/pdf";
import { PURCHASE_ORDER_PRINT_DOCUMENT_TYPES, type PurchaseOrderPrintDocumentType } from "../../_print/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function purchaseOrderId(value: string): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function documentType(value: string | null): PurchaseOrderPrintDocumentType | null {
    return PURCHASE_ORDER_PRINT_DOCUMENT_TYPES.includes(value as PurchaseOrderPrintDocumentType)
        ? value as PurchaseOrderPrintDocumentType
        : null;
}

function optionalId(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function routeError(error: unknown) {
    const status = error instanceof PurchaseOrderAuthorizationError
        || error instanceof PurchaseOrderPrintDataError
        || error instanceof PurchaseOrderPrintArchiveError
        ? error.status
        : 500;
    return NextResponse.json({ error: (error as Error).message || "Unable to generate the purchase-order printable." }, { status });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const actor = await requirePurchaseOrderModuleAccess({ modulePaths: Object.values(PURCHASE_ORDER_MODULE_PATHS) });
        const id = purchaseOrderId((await context.params).id);
        if (!id) return NextResponse.json({ error: "Invalid purchase-order ID." }, { status: 400 });
        const searchParams = new URL(request.url).searchParams;
        const type = documentType(searchParams.get("documentType"));
        if (!type) {
            return NextResponse.json({
                error: `documentType must be one of: ${PURCHASE_ORDER_PRINT_DOCUMENT_TYPES.join(", ")}.`
            }, { status: 400 });
        }
        const historyParam = searchParams.get("historyId");
        const receivingHeaderParam = searchParams.get("receivingHeaderId");
        if ((historyParam && !optionalId(historyParam)) || (receivingHeaderParam && !optionalId(receivingHeaderParam))) {
            return NextResponse.json({ error: "historyId and receivingHeaderId must be positive integers." }, { status: 400 });
        }
        const snapshot = await loadPurchaseOrderPrintableData({
            purchaseOrderId: id,
            documentType: type,
            generatedBy: actor.displayName,
            historyId: optionalId(historyParam),
            receivingHeaderId: optionalId(receivingHeaderParam)
        });
        const rendered = await generatePurchaseOrderPdf(snapshot);
        const archive = await archivePurchaseOrderPdf({ data: snapshot, pdf: rendered.buffer, pageCount: rendered.pageCount });
        const fileName = `${snapshot.purchaseOrder.purchaseOrderNumber}_${type}_${snapshot.purchaseOrder.workflowRevision}.pdf`
            .replace(/[^a-zA-Z0-9._-]+/g, "_");
        return new NextResponse(new Uint8Array(rendered.buffer), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${fileName}"`,
                "Cache-Control": "no-store",
                "X-Printable-Archive-Id": archive.archiveId,
                "X-Printable-Archive-File-Id": archive.fileId,
                "X-Printable-Archive-Reused": String(archive.reused)
            }
        });
    } catch (error) {
        return routeError(error);
    }
}
