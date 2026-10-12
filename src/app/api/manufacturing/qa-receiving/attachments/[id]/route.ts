import { NextResponse } from "next/server";
import {
    deleteQaReceivingAttachment,
    isQaAttachmentError
} from "../../_attachments-domain";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../../purchase-orders/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete attachment.";
    const status = error instanceof PurchaseOrderAuthorizationError
        ? error.status
        : isQaAttachmentError(error)
            ? error.status
            : 500;
    const code = isQaAttachmentError(error) ? error.code : "INTERNAL_ERROR";
    return NextResponse.json({ error: message, code }, { status });
}

export async function DELETE(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });
        const { id } = await context.params;
        const attachmentId = Number(id);

        if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) {
            return NextResponse.json({ error: "Invalid attachment ID." }, { status: 400 });
        }

        await deleteQaReceivingAttachment(attachmentId);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return errorResponse(error);
    }
}
