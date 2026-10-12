import { NextResponse } from "next/server";
import {
    getQaReceivingAttachments,
    uploadQaReceivingAttachment,
    isQaAttachmentError
} from "../_attachments-domain";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : "Attachment request failed.";
    const status = error instanceof PurchaseOrderAuthorizationError
        ? error.status
        : isQaAttachmentError(error)
            ? error.status
            : 500;
    const code = isQaAttachmentError(error) ? error.code : "INTERNAL_ERROR";
    return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });
        const params = new URL(request.url).searchParams;
        const purchaseOrderId = Number(params.get("purchaseOrderId"));
        const receivingHeaderId = params.get("receivingHeaderId") ? Number(params.get("receivingHeaderId")) : null;

        if (!Number.isSafeInteger(purchaseOrderId) || purchaseOrderId <= 0) {
            return NextResponse.json({ error: "purchaseOrderId is required." }, { status: 400 });
        }

        const attachments = await getQaReceivingAttachments({
            purchaseOrderId,
            receivingHeaderId
        });
        return NextResponse.json(attachments);
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(request: Request) {
    try {
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });
        const formData = await request.formData();
        const purchaseOrderId = Number(formData.get("purchaseOrderId"));
        const receivingHeaderId = formData.get("receivingHeaderId") ? Number(formData.get("receivingHeaderId")) : null;
        const purchaseOrderProductId = formData.get("purchaseOrderProductId") ? Number(formData.get("purchaseOrderProductId")) : null;
        const remarks = formData.get("remarks") ? String(formData.get("remarks")) : null;
        const file = formData.get("file");

        if (!Number.isSafeInteger(purchaseOrderId) || purchaseOrderId <= 0) {
            return NextResponse.json({ error: "Valid purchaseOrderId is required." }, { status: 400 });
        }

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "A valid file is required." }, { status: 400 });
        }

        const attachment = await uploadQaReceivingAttachment({
            purchaseOrderId,
            receivingHeaderId,
            purchaseOrderProductId,
            file,
            remarks,
            actorId: actor.userId
        });

        return NextResponse.json(attachment, { status: 201 });
    } catch (error) {
        return errorResponse(error);
    }
}
