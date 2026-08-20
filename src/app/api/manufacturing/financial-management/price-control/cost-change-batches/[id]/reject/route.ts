import { NextRequest, NextResponse } from "next/server";

import {
    decodeUserIdFromJwtCookie,
    directusErrorResponse,
    rejectCostBatch,
} from "../../_batch";
import {
    isUnifiedBatchDetectionError,
    rejectUnifiedBatch,
    resolveUnifiedBatchKind,
} from "../../../_unifiedBatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
    try {
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await context.params;
        const headerId = Number(id);
        if (!Number.isFinite(headerId) || headerId <= 0) {
            return NextResponse.json({ error: "Invalid cost batch id" }, { status: 400 });
        }

        const body = (await req.json().catch(() => ({}))) as Partial<{ reject_reason: string }>;
        const rejectReason = String(body.reject_reason ?? "").trim();
        if (!rejectReason) {
            return NextResponse.json({ error: "reject_reason is required" }, { status: 400 });
        }

        const batchKind = await resolveUnifiedBatchKind(headerId);
        if (batchKind === "mixed") {
            const result = await rejectUnifiedBatch(headerId, userId, rejectReason);
            if ("status" in result) return NextResponse.json({ error: result.error }, { status: result.status });
            return NextResponse.json(result);
        }

        return rejectCostBatch(headerId, userId, rejectReason);
    } catch (error: unknown) {
        if (isUnifiedBatchDetectionError(error)) {
            console.error("[costChangeBatchReject] Mixed-batch detection failed", error.originalError);
            return NextResponse.json(
                { error: error.message, code: error.code, retryable: error.retryable },
                { status: error.status },
            );
        }
        return directusErrorResponse(error);
    }
}
