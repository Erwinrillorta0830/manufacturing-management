export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
    computeJobOrderMaterialReturns,
    fetchJobOrder,
    returnJobOrderMaterialLeftovers,
    JobOrderCancellationError
} from "@/app/api/manufacturing/production/_material-return";
import { materialReturnFingerprint, verifyMaterialReturnToken } from "../_token";

async function resolveActorUserId(bodyActorId: unknown): Promise<number | null> {
    const bodyId = Number(bodyActorId);
    if (Number.isSafeInteger(bodyId) && bodyId > 0) return bodyId;
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (token) {
            const parts = token.split(".");
            if (parts.length >= 2) {
                let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                while (base64.length % 4) base64 += "=";
                const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
                const id = Number(payload?.id || payload?.user_id || payload?.sub);
                if (Number.isSafeInteger(id) && id > 0) return id;
            }
        }
    } catch (error) {
        console.warn("Unable to resolve the material-return actor from the session:", error);
    }
    return null;
}

function errorResponse(error: unknown) {
    if (error instanceof JobOrderCancellationError) {
        return NextResponse.json(
            {
                error: error.message,
                code: error.code,
                ...(error.details ? { details: error.details } : {})
            },
            { status: error.status }
        );
    }
    return NextResponse.json(
        { error: error instanceof Error ? error.message : "Raw-material return failed." },
        { status: 500 }
    );
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

        const jobOrder = await fetchJobOrder(joId);
        const computed = await computeJobOrderMaterialReturns(jobOrder);
        const fingerprint = materialReturnFingerprint(jobOrder.jobOrderId, computed.lines);
        const tokenError = verifyMaterialReturnToken(previewToken, jobOrder.jobOrderId, fingerprint);
        if (tokenError) {
            return NextResponse.json({ error: tokenError, code: "MATERIAL_RETURN_PREVIEW_STALE" }, { status: 409 });
        }
        if (computed.reconciliationError) {
            return NextResponse.json(
                { error: computed.reconciliationError, code: "JOB_ORDER_RECONCILIATION_FAILED" },
                { status: 409 }
            );
        }
        if (computed.totals.returnableQuantity <= 0) {
            return NextResponse.json({
                success: true,
                data: {
                    jobOrderId: jobOrder.jobOrderId,
                    jobOrderNo: jobOrder.jobOrderNo,
                    status: jobOrder.status,
                    returnedQuantity: 0,
                    movementCount: 0,
                    noop: true
                }
            });
        }

        const actorUserId = await resolveActorUserId(payload.actorUserId ?? payload.userId);
        const execution = await returnJobOrderMaterialLeftovers({
            joId: jobOrder.jobOrderId,
            reason: typeof payload.reason === "string" ? payload.reason : undefined,
            actorUserId,
            destinations: Array.isArray(payload.destinations)
                ? payload.destinations as Array<{ joMaterialId: number; mmLotId: number; inventoryLotId?: number; batchNo?: string }>
                : undefined
        });

        return NextResponse.json({ success: true, data: execution.response });
    } catch (error) {
        return errorResponse(error);
    }
}
