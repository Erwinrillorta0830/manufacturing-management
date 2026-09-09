import { NextResponse } from "next/server";
import { getLotTransferStatusHistory } from "../../_domain";
import { errorResponse, parseTransferId } from "../../_http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
    try {
        const { id } = await params;
        const data = await getLotTransferStatusHistory(parseTransferId(id));
        return NextResponse.json({ success: true, data });
    } catch (error) {
        return errorResponse(error, "status history");
    }
}
