import { NextResponse } from "next/server";
import {
    cancelLotTransfer,
    getSessionUserId,
    parseCancellation
} from "../../_domain";
import { errorResponse, parseTransferId, readJson } from "../../_http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
    try {
        const { id } = await params;
        const { cancellationReason } = parseCancellation(await readJson(request));
        const record = await cancelLotTransfer(
            parseTransferId(id),
            cancellationReason,
            await getSessionUserId()
        );
        return NextResponse.json({ success: true, data: record });
    } catch (error) {
        return errorResponse(error, "cancel");
    }
}
