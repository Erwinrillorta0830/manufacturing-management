import { NextResponse } from "next/server";
import {
    getComputationAttachments,
    isLandedCostError,
    uploadLandedCostAttachment,
    type AttachmentDocumentType
} from "../_domain";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../../purchase-orders/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCUMENT_TYPES = new Set<AttachmentDocumentType>([
    "CARRIER_INVOICE",
    "FREIGHT_BILL",
    "BROKER_ASSESSMENT_SHEET",
    "OTHER"
]);

function errorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : "Computation attachment request failed.";
    const status = error instanceof PurchaseOrderAuthorizationError
        ? error.status
        : isLandedCostError(error)
            ? error.status
            : 500;
    return NextResponse.json({ error: message, ...(isLandedCostError(error) ? { code: error.code } : {}) }, { status });
}

export async function GET(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.expenses });
        const params = new URL(request.url).searchParams;
        const computationId = Number(params.get("computationId"));
        if (!Number.isSafeInteger(computationId) || computationId <= 0) {
            return NextResponse.json({ error: "computationId is required." }, { status: 400 });
        }
        return NextResponse.json(await getComputationAttachments(computationId));
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(request: Request) {
    try {
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.expenses });
        const formData = await request.formData();
        const purchaseOrderId = Number(formData.get("purchaseOrderId"));
        const computationId = Number(formData.get("computationId"));
        const documentType = String(formData.get("documentType") || "");
        const file = formData.get("file");
        if (!Number.isSafeInteger(purchaseOrderId) || purchaseOrderId <= 0 || !Number.isSafeInteger(computationId) || computationId <= 0) {
            return NextResponse.json({ error: "purchaseOrderId and computationId are required." }, { status: 400 });
        }
        if (!DOCUMENT_TYPES.has(documentType as AttachmentDocumentType)) {
            return NextResponse.json({ error: "A valid computation document type is required." }, { status: 400 });
        }
        if (!(file instanceof File)) {
            return NextResponse.json({ error: "A PDF or XLSX computation file is required." }, { status: 400 });
        }
        const attachment = await uploadLandedCostAttachment({
            purchaseOrderId,
            computationId,
            documentType: documentType as AttachmentDocumentType,
            file,
            actorId: actor.userId
        });
        return NextResponse.json(attachment, { status: 201 });
    } catch (error) {
        return errorResponse(error);
    }
}
