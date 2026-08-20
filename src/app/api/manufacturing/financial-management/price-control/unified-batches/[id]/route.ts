import { NextRequest, NextResponse } from "next/server";

import {
    approveUnifiedBatch,
    getUnifiedBatch,
    isUnifiedBatchDetectionError,
    rejectUnifiedBatch,
    retryUnifiedBatch,
} from "../../_unifiedBatch";
import {
    decodeUserIdFromJwtCookie,
    directusErrorResponse,
} from "../../price-change-batches/_batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
    try {
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await context.params;
        const headerId = Number(id);
        if (!Number.isFinite(headerId) || headerId <= 0) {
            return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
        }

        const data = await getUnifiedBatch(headerId);
        if (!data) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

        return NextResponse.json({ data });
    } catch (error: unknown) {
        if (isUnifiedBatchDetectionError(error)) {
            console.error("[unifiedBatch] Mixed-batch detection failed", error.originalError);
            return NextResponse.json(
                { error: error.message, code: error.code, retryable: error.retryable },
                { status: error.status },
            );
        }
        return directusErrorResponse(error);
    }
}

export async function POST(req: NextRequest, context: RouteContext) {
    try {
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await context.params;
        const headerId = Number(id);
        if (!Number.isFinite(headerId) || headerId <= 0) {
            return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
        }

        const body = (await req.json().catch(() => ({}))) as {
            action?: string;
            reject_reason?: string;
            effective_at?: string | null;
        };
        const action = String(body.action ?? "").trim().toLowerCase();

        if (action === "approve") {
            const result = await approveUnifiedBatch(headerId, userId, body.effective_at);
            if ("status" in result) return NextResponse.json({ error: result.error }, { status: result.status });
                return NextResponse.json(result, { status: result.failed > 0 || result.retryable ? 202 : 200 });
        }

        if (action === "retry_application") {
            const result = await retryUnifiedBatch(headerId, userId);
            if ("status" in result) return NextResponse.json({ error: result.error }, { status: result.status });
            return NextResponse.json(result, { status: result.failed > 0 || result.retryable ? 202 : 200 });
        }

        if (action === "reject") {
            const reason = String(body.reject_reason ?? "").trim();
            if (!reason) return NextResponse.json({ error: "reject_reason is required" }, { status: 400 });

            const result = await rejectUnifiedBatch(headerId, userId, reason);
            if ("status" in result) return NextResponse.json({ error: result.error }, { status: result.status });
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    } catch (error: unknown) {
        if (isUnifiedBatchDetectionError(error)) {
            console.error("[unifiedBatch] Mixed-batch detection failed", error.originalError);
            return NextResponse.json(
                { error: error.message, code: error.code, retryable: error.retryable },
                { status: error.status },
            );
        }
        return directusErrorResponse(error);
    }
}
