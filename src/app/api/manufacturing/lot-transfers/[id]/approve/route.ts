import { NextResponse } from "next/server";
import {
    approveLotTransfer,
    getSessionUserId,
    parseApproval
} from "../../_domain";
import { errorResponse, parseTransferId, readJson } from "../../_http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
    try {
        const { id } = await params;
        const body = await readJson(request).catch(() => ({}));
        const bodyRecord = body && typeof body === "object" && !Array.isArray(body)
            ? body as Record<string, unknown>
            : {};
        const parsed = parseApproval({
            idempotencyKey: bodyRecord.idempotencyKey || request.headers.get("Idempotency-Key") || ""
        });
        const result = await approveLotTransfer(
            parseTransferId(id),
            parsed.idempotencyKey,
            await getSessionUserId()
        );
        return NextResponse.json({
            success: true,
            data: result.record,
            preview: result.preview,
            idempotent: result.idempotent
        });
    } catch (error) {
        return errorResponse(error, "approve");
    }
}
