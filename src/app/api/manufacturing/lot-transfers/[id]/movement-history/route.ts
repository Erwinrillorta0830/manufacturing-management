import { NextResponse } from "next/server";
import { getLotTransferMovementHistory } from "../../_domain";
import { errorResponse, parseTransferId } from "../../_http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
    try {
        const { id } = await params;
        const result = await getLotTransferMovementHistory(parseTransferId(id));
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        return errorResponse(error, "movement history");
    }
}

