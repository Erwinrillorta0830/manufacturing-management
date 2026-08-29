import { NextResponse } from "next/server";
import { submitLotTransfer } from "../../_domain";
import { errorResponse, parseTransferId } from "../../_http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
    try {
        const { id } = await params;
        const record = await submitLotTransfer(parseTransferId(id));
        return NextResponse.json({ success: true, data: record });
    } catch (error) {
        return errorResponse(error, "submit");
    }
}
