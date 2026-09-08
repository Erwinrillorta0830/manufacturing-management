import { NextResponse } from "next/server";
import {
    approveLotTransfer,
    getSessionUserId
} from "../../_domain";
import { errorResponse, parseTransferId } from "../../_http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
    try {
        const { id } = await params;
        const result = await approveLotTransfer(
            parseTransferId(id),
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
