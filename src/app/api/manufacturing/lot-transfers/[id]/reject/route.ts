import { NextResponse } from "next/server";
import {
    getSessionUserId,
    parseRejection,
    rejectLotTransfer
} from "../../_domain";
import { errorResponse, parseTransferId, readJson } from "../../_http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
    try {
        const { id } = await params;
        const rejection = parseRejection(await readJson(request));
        const record = await rejectLotTransfer(
            parseTransferId(id),
            rejection.rejectionReason,
            rejection.qaEvidence,
            await getSessionUserId()
        );
        return NextResponse.json({ success: true, data: record });
    } catch (error) {
        return errorResponse(error, "reject");
    }
}
