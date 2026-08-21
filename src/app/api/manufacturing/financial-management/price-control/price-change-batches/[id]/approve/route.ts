import { NextRequest, NextResponse } from "next/server";
import {
    applyApprovedBatch,
    decodeUserIdFromJwtCookie,
    directusErrorResponse,
} from "../../_batch";
import {
    approveUnifiedBatch,
    isUnifiedBatchDetectionError,
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
            return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
        }

        const batchKind = await resolveUnifiedBatchKind(headerId);
        if (batchKind === "mixed") {
            const result = await approveUnifiedBatch(headerId, userId);
            if ("status" in result) return NextResponse.json({ error: result.error }, { status: result.status });
            return NextResponse.json(result, { status: result.failed > 0 || result.retryable ? 202 : 200 });
        }

        return applyApprovedBatch(headerId, userId);
    } catch (error: unknown) {
        if (isUnifiedBatchDetectionError(error)) {
            console.error("[priceChangeBatchApprove] Mixed-batch detection failed", error.originalError);
            return NextResponse.json(
                { error: error.message, code: error.code, retryable: error.retryable },
                { status: error.status },
            );
        }
        return directusErrorResponse(error);
    }
}
