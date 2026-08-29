import { NextResponse } from "next/server";
import { buildLotTransferPreview, getLotTransfer } from "../../_domain";
import { errorResponse, parseTransferId } from "../../_http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
    try {
        const { id } = await params;
        const preview = await buildLotTransferPreview(await getLotTransfer(parseTransferId(id)));
        return NextResponse.json({ success: true, data: preview });
    } catch (error) {
        return errorResponse(error, "preview");
    }
}
