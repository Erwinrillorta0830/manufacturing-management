export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { AuthenticatedActorError, requireManufacturingActorId } from "@/app/api/manufacturing/production/_authenticated-actor";
import {
    finalizeHaltedJobOrder,
    previewHaltFinalize,
    YieldCompletionError
} from "@/app/api/manufacturing/production/_yield-closing-service";
import { JobOrderCancellationError } from "@/app/api/manufacturing/production/_material-return";
import { signMaterialReturnToken, verifyMaterialReturnToken } from "../material-returns/_token";

function errorResponse(error: unknown) {
    if (error instanceof AuthenticatedActorError) {
        return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof YieldCompletionError) {
        return NextResponse.json(
            {
                success: false,
                error: error.message,
                code: error.code,
                ...(error.operationKey ? { operationKey: error.operationKey } : {}),
                reconciliationRequired: error.reconciliationRequired,
                ...(error.reconciliation ? { reconciliation: error.reconciliation } : {})
            },
            { status: error.status }
        );
    }
    if (error instanceof JobOrderCancellationError) {
        return NextResponse.json(
            { success: false, error: error.message, code: error.code },
            { status: error.status }
        );
    }
    return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : "Halted Job Order finalization failed." },
        { status: 500 }
    );
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const joId = (searchParams.get("joId") || "").trim();
        if (!joId) {
            return NextResponse.json({ error: "Provide a joId to preview halt finalization." }, { status: 400 });
        }

        const preview = await previewHaltFinalize(joId);
        return NextResponse.json({
            success: true,
            data: {
                ...preview,
                previewToken: signMaterialReturnToken(preview.jobOrder.jobOrderId, preview.fingerprint)
            }
        });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
        }
        const payload = body as Record<string, unknown>;
        const joId = String(payload.joId ?? "").trim();
        const previewToken = payload.previewToken;
        if (!joId || !previewToken) {
            return NextResponse.json({ error: "Missing joId or previewToken." }, { status: 400 });
        }

        const preview = await previewHaltFinalize(joId);
        const tokenError = verifyMaterialReturnToken(previewToken, preview.jobOrder.jobOrderId, preview.fingerprint);
        if (tokenError) {
            return NextResponse.json({ error: tokenError, code: "MATERIAL_RETURN_PREVIEW_STALE" }, { status: 409 });
        }

        const actorUserId = await requireManufacturingActorId();
        const result = await finalizeHaltedJobOrder({
            joId: preview.jobOrder.jobOrderId,
            productId: payload.productId as string | number,
            productName: typeof payload.productName === "string" ? payload.productName : undefined,
            quantityProduced: payload.quantityProduced as string | number,
            branchId: payload.branchId as string | number,
            lotNumber: String(payload.lotNumber ?? ""),
            mmLotId: payload.mmLotId as string | number,
            manufacturingDate: String(payload.manufacturingDate ?? ""),
            expirationDate: String(payload.expirationDate ?? ""),
            unitCost: payload.unitCost as string | number | null | undefined,
            materials: Array.isArray(payload.materials)
                ? payload.materials as Array<{ joMaterialId: number; consumedQty: number }>
                : undefined,
            remarks: typeof payload.remarks === "string" ? payload.remarks : undefined,
            actorUserId
        });

        return NextResponse.json(result);
    } catch (error) {
        return errorResponse(error);
    }
}
